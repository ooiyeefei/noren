#!/usr/bin/env bash
# Creates what story photos need in AWS (specs/003-story-photos): a private bucket in Tokyo, a
# CloudFront distribution that reads it, and a user limited to two prefixes. Safe to rerun.
#
#   scripts/setup-photo-bucket.sh <aws-profile> <expected-account-id>
#
# It stops before changing anything if the profile belongs to another account. It prints the settings
# to add and writes the secret key to a chmod 600 file, never to the terminal. Move that value into the
# hosting settings, then delete the file: AWS shows a secret key only once, when the key is created.
set -euo pipefail

readonly AWS_REGION="ap-northeast-1"
readonly ALLOWED_ORIGIN="https://noren.yooi.me"
readonly USER_NAME="noren-story-photos"
readonly OAC_NAME="noren-story-photos"
readonly HEADERS_POLICY_NAME="noren-story-photos"
readonly DISTRIBUTION_COMMENT="noren-story-photos"
# AWS's managed CachingOptimized policy. It honours the Cache-Control each object carries.
readonly CACHE_POLICY_ID="658327ea-f89d-4fab-a63d-7e88639e58f6"

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <aws-profile> <expected-account-id>" >&2
  exit 64
fi
readonly PROFILE="$1"
readonly EXPECTED_ACCOUNT="$2"
if ! [[ "$EXPECTED_ACCOUNT" =~ ^[0-9]{12}$ ]]; then
  echo "The expected account id must be 12 digits. Got: $EXPECTED_ACCOUNT" >&2
  exit 64
fi

aws_() { aws --profile "$PROFILE" --region "$AWS_REGION" "$@"; }
# CloudFront and IAM are global, so these calls do not need a region.
aws_global() { aws --profile "$PROFILE" "$@"; }

ACCOUNT="$(aws_global sts get-caller-identity --query Account --output text)"
if [ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "Stopping: profile $PROFILE belongs to account $ACCOUNT, and you confirmed $EXPECTED_ACCOUNT. Nothing was changed." >&2
  exit 1
fi

readonly BUCKET="noren-story-photos-$ACCOUNT"
readonly BUCKET_ARN="arn:aws:s3:::$BUCKET"
readonly ORIGIN_DOMAIN="$BUCKET.s3.$AWS_REGION.amazonaws.com"
# Inside the project's git-ignored scratch folder, so it can't be committed by accident.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SECRET_DIR="${PHOTO_SECRET_DIR:-$PROJECT_ROOT/.scratch/photo-bucket}"
readonly SECRET_FILE="$SECRET_DIR/noren-photos-$ACCOUNT.env"
say() { printf '%s\n' "$*"; }

say "Account $ACCOUNT confirmed. Setting up $BUCKET in $AWS_REGION."

# --- The bucket. Every step below sets a final state, so running it again changes nothing. ---
if aws_ s3api head-bucket --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" >/dev/null 2>&1; then
  say "Bucket already exists."
else
  aws_ s3api create-bucket --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=$AWS_REGION" \
    --object-ownership BucketOwnerEnforced >/dev/null
  say "Bucket created."
fi

aws_ s3api put-public-access-block --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws_ s3api put-bucket-encryption --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws_ s3api put-bucket-cors --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" \
  --cors-configuration \
  "{\"CORSRules\":[{\"AllowedOrigins\":[\"$ALLOWED_ORIGIN\"],\"AllowedMethods\":[\"POST\"],\"AllowedHeaders\":[\"*\"],\"MaxAgeSeconds\":3000}]}"

aws_ s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" \
  --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-incoming","Status":"Enabled","Filter":{"Prefix":"incoming/"},"Expiration":{"Days":1},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'

# --- CloudFront, found by name so a rerun does not make a second one. ---
OAC_ID="$(aws_global cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$OAC_NAME'].Id | [0]" --output text)"
if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  OAC_ID="$(aws_global cloudfront create-origin-access-control \
    --origin-access-control-config \
    "{\"Name\":\"$OAC_NAME\",\"Description\":\"Noren story photos\",\"SigningProtocol\":\"sigv4\",\"SigningBehavior\":\"always\",\"OriginAccessControlOriginType\":\"s3\"}" \
    --query OriginAccessControl.Id --output text)"
  say "Origin access control created."
fi

# Search engines stay out, so a photo a member removes does not live on in an image index (FR-213).
HEADERS_POLICY_ID="$(aws_global cloudfront list-response-headers-policies --type custom \
  --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$HEADERS_POLICY_NAME'].ResponseHeadersPolicy.Id | [0]" \
  --output text)"
if [ "$HEADERS_POLICY_ID" = "None" ] || [ -z "$HEADERS_POLICY_ID" ]; then
  HEADERS_POLICY_ID="$(aws_global cloudfront create-response-headers-policy \
    --response-headers-policy-config \
    "{\"Name\":\"$HEADERS_POLICY_NAME\",\"SecurityHeadersConfig\":{\"ContentTypeOptions\":{\"Override\":true}},\"CustomHeadersConfig\":{\"Quantity\":1,\"Items\":[{\"Header\":\"X-Robots-Tag\",\"Value\":\"noindex, nofollow\",\"Override\":true}]}}" \
    --query ResponseHeadersPolicy.Id --output text)"
  say "Response headers policy created."
fi

DISTRIBUTION_ID="$(aws_global cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$DISTRIBUTION_COMMENT'].Id | [0]" --output text)"
if [ "$DISTRIBUTION_ID" = "None" ] || [ -z "$DISTRIBUTION_ID" ]; then
  DISTRIBUTION_ID="$(aws_global cloudfront create-distribution --distribution-config "{
    \"CallerReference\":\"$DISTRIBUTION_COMMENT-$ACCOUNT\",
    \"Comment\":\"$DISTRIBUTION_COMMENT\",
    \"Enabled\":true,
    \"HttpVersion\":\"http2and3\",
    \"PriceClass\":\"PriceClass_200\",
    \"Origins\":{\"Quantity\":1,\"Items\":[{
      \"Id\":\"photos\",
      \"DomainName\":\"$ORIGIN_DOMAIN\",
      \"OriginAccessControlId\":\"$OAC_ID\",
      \"S3OriginConfig\":{\"OriginAccessIdentity\":\"\"}
    }]},
    \"DefaultCacheBehavior\":{
      \"TargetOriginId\":\"photos\",
      \"ViewerProtocolPolicy\":\"redirect-to-https\",
      \"AllowedMethods\":{\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"],\"CachedMethods\":{\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"]}},
      \"Compress\":false,
      \"CachePolicyId\":\"$CACHE_POLICY_ID\",
      \"ResponseHeadersPolicyId\":\"$HEADERS_POLICY_ID\"
    }
  }" --query Distribution.Id --output text)"
  say "Distribution created. CloudFront can take about 15 minutes to deploy it."
fi
DISTRIBUTION_DOMAIN="$(aws_global cloudfront get-distribution --id "$DISTRIBUTION_ID" \
  --query Distribution.DomainName --output text)"
readonly DISTRIBUTION_ARN="arn:aws:cloudfront::$ACCOUNT:distribution/$DISTRIBUTION_ID"

# Only this distribution, and only photos/. Nothing in incoming/ is ever readable from outside.
aws_ s3api put-bucket-policy --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT" --policy \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"CloudFrontReadsPhotos\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"$BUCKET_ARN/photos/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"$DISTRIBUTION_ARN\"}}}]}"

# --- The app's user: three actions on two prefixes, and no list permission at all. ---
if aws_global iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  say "User already exists."
else
  aws_global iam create-user --user-name "$USER_NAME" >/dev/null
  say "User created."
fi
aws_global iam put-user-policy --user-name "$USER_NAME" --policy-name noren-story-photos \
  --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\",\"s3:DeleteObject\"],\"Resource\":[\"$BUCKET_ARN/incoming/*\",\"$BUCKET_ARN/photos/*\"]}]}"

ACCESS_KEY_ID="$(aws_global iam list-access-keys --user-name "$USER_NAME" \
  --query 'AccessKeyMetadata[0].AccessKeyId' --output text)"
SECRET_NOTE="No new key was made, because the user already has one. If you no longer have its secret, delete that key in IAM and run this again."
if [ "$ACCESS_KEY_ID" = "None" ] || [ -z "$ACCESS_KEY_ID" ]; then
  # The output goes straight into these variables and then a private file, never to the terminal.
  umask 077
  mkdir -p "$SECRET_DIR"
  if [ -e "$SECRET_FILE" ]; then
    echo "Stopping before making a key: $SECRET_FILE already exists. Move it away first." >&2
    exit 1
  fi
  read -r ACCESS_KEY_ID NEW_SECRET_KEY < <(aws_global iam create-access-key \
    --user-name "$USER_NAME" \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  printf 'PHOTOS_S3_SECRET_ACCESS_KEY=%s\n' "$NEW_SECRET_KEY" >"$SECRET_FILE"
  unset NEW_SECRET_KEY
  chmod 600 "$SECRET_FILE"
  SECRET_NOTE="The secret key is in $SECRET_FILE (only you can read it). Add it to both places, then delete the file."
fi

cat <<SETTINGS

Done. Add these settings. Use printf rather than echo if you pipe a value into a command.

Vercel project settings AND the Convex deployment (npx convex env set):
  PHOTOS_S3_BUCKET=$BUCKET
  PHOTOS_S3_REGION=$AWS_REGION
  PHOTOS_S3_ACCESS_KEY_ID=$ACCESS_KEY_ID
  PHOTOS_S3_SECRET_ACCESS_KEY  $SECRET_NOTE

Vercel project settings only:
  PHOTOS_PUBLIC_BASE_URL=https://$DISTRIBUTION_DOMAIN

Set these on Vercel before the deploy that sets photos.enabled to true in regions/nagasaki.json. The
content security policy is built from them when the site is built.
SETTINGS

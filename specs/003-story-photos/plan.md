# Implementation Plan: Photos on a written story

**Branch**: `story-photos` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

## Summary

The browser shrinks a picture to a JPEG and uploads it straight to S3 under a permit, because Vercel functions cap bodies at 4.5 MB. A second route re-encodes it with all metadata removed and writes the only copy anyone can read. Convex holds the rows and chooses every key. Removal writes a row to a small outbox that a scheduled Convex action works through, so a failed deletion is retried instead of lost.

**Language**: TypeScript on Node.js 24 (Vercel) and Node.js 22 (Convex actions). **New**: `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`. `sharp` moves from dev to production dependencies because a live route now needs it. **Storage**: Amazon S3 in Tokyo, read through CloudFront. **Testing**: Vitest, `convex-test`, real `sharp` on generated images, a fake S3 client.

## Constitution Check

Against version 2.3.0.

| Principle | Result | How |
|---|---|---|
| I. Stories, not scores | Pass | No stars, counts or ordering by photos. Strain: this moves Noren one step nearer a review page, so the text stays required and photos live inside a story. |
| II. Real data only | Pass | The member who writes the story is the human who confirms it. Demo accounts and fictional places are refused. |
| III. Humans are the source of truth | Pass | A steward approves a new member's photos. Nothing is judged by a machine. |
| IV. Link out, don't copy | Pass | This covers third-party posts. The form asks for photos the member took. Nothing stops someone uploading a picture from elsewhere, so a takedown is the remedy. |
| V. AI is an editor | Pass | No model sees a photo. The story agent reads text only. |
| VI. Original language first | Pass | No words are added to a story. |
| VII. Region is configuration | Pass | Every number and the caution key live in the region file. No credentials in the repository. |
| Privacy, first bullet | **Strained** | See below. |

**Needs an owner decision before `enabled: true`.** The bullet lists what a public demo may show: "a place a member adds, a story a member writes and a public post a member links", then says "No other real person's data is shown." A photo is not on that list, and a photo can show a bystander's face. The form's request to ask first is a mitigation, not a rule that holds. The bullet needs a MINOR amendment that names photos, says what happens to a person shown without asking, and states the takedown path. Nothing is amended here, and shipping switched off breaks nothing.

**The privacy notice names Amazon Web Services** (S3 in Tokyo, CloudFront worldwide) only while photos are on, because T057 names services as the code uses them that day.

## Design

```text
regions/nagasaki.json              photos block; collection.newAccount.perDay.photo
src/lib/region/schema.ts           validates it
src/lib/photos/settings.ts         reads the environment, fails closed; no AWS import
src/lib/photos/process.ts          sharp: real JPEG check, re-encode, no metadata
src/lib/photos/s3-store.ts         the only file that imports the AWS SDK
src/lib/photos/routes.ts           both routes, with store, Convex and sharp injected
src/components/place/photo-shrink.ts  browser: canvas to JPEG
src/components/place/photo-upload.ts  browser: shrink, permit, S3, finish
src/app/api/story-photos/*         thin wiring
convex/tables/storyPhotos.ts       storyPhoto, photoObjectRemoval
convex/lib/storyPhotos.ts          rules and helpers, including removePhotos
convex/storyPhotos.ts              public and internal functions
convex/storyPhotoActions.ts        "use node": deletes objects
src/components/place/photo-picker.tsx, story-photos.tsx
src/components/steward/waiting-photos.tsx
scripts/setup-photo-bucket.sh      not run
```

**Why Convex chooses the keys.** The second route needs to record a finished photo, and it can only call public Convex functions with the member's token, so a member can call the same function. If that function took a key, a member could point a row at someone else's file, and removing the row would delete it. Convex picks both keys when the upload begins and the function takes only the photo's id and size. A direct call can then only mark a row whose final key nobody can write except the server, so unchecked bytes never reach `photos/`. No shared secret is needed.

**Why an outbox.** Removal has to survive S3 being down, the settings being wrong and a person's account being deleted. The row goes at once, so the photo leaves the page in the same transaction, and a removal row stays until S3 confirms. An hourly cron retries. Stewards see a warning if any are failing.

**Status.** One field: `uploading` (permit given), `unattached` (checked and stored), `waiting`, `live`. Whether a photo waits is decided when it attaches, using the member's age then.

**Cache.** Objects carry `max-age=cacheSeconds` (one hour). A year would be normal for an immutable key, but a deleted photo would keep being served. An invalidation on each removal would need a sixth setting and another IAM permission for a gain of under an hour.

**Where the bucket is reachable.** CloudFront can read only `photos/*`. `incoming/` is never served. The upload permit allows one exact key.

## Settings

| Setting | Vercel | Convex | Why |
|---|---|---|---|
| `PHOTOS_S3_BUCKET` | yes | yes | Both talk to the bucket |
| `PHOTOS_S3_REGION` | yes | yes | |
| `PHOTOS_S3_ACCESS_KEY_ID` | yes | yes | |
| `PHOTOS_S3_SECRET_ACCESS_KEY` | yes (sensitive) | yes | Vercel signs permits and writes; Convex deletes |
| `PHOTOS_PUBLIC_BASE_URL` | yes | no | The page builds addresses and the content security policy from it |

The content security policy is built in `next.config.ts`, so these must be in Vercel before the deploy that turns photos on.

## Turning it on

1. Owner decides the constitution question. The privacy notice's photos section appears by itself once `enabled` is true, so the same change sets a new `documentsVersion`, and the lawyer reads that section first.
2. Owner runs `scripts/setup-photo-bucket.sh <aws-profile> <account-id>`.
3. Owner adds the settings above, then deletes the file holding the secret.
4. Set `photos.enabled: true`, deploy Convex and the site.
5. Live UAT on a real iPhone: upload, read the served file's metadata, remove, check the bucket.

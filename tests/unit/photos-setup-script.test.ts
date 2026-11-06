import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Runs the script against a fake `aws` placed first on PATH, so this never reaches AWS. The fake logs
 * every call and remembers what exists between runs, which is what makes a rerun testable.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/setup-photo-bucket.sh");
const ACCOUNT = "111122223333";
const SECRET = "fictionalSecretValueThatMustNeverPrint";
const ACCESS_KEY = "AKIAFICTIONALKEY";

const FAKE_AWS = String.raw`#!/usr/bin/env bash
state="$FAKE_AWS_STATE"
printf '%s' "$*" | tr '\n' ' ' >> "$state/calls"
echo >> "$state/calls"
have() { [ -e "$state/$1" ]; }
mark() { touch "$state/$1"; }
args="$*"
case "$args" in
  *"sts get-caller-identity"*) echo "$FAKE_ACCOUNT" ;;
  *"s3api head-bucket"*) have bucket || exit 254 ;;
  *"s3api create-bucket"*) mark bucket; echo '{}' ;;
  *"s3api put-"*) echo "put" >> "$state/puts" ;;
  *"cloudfront list-origin-access-controls"*)
    if have oac; then echo "OACFICTIONAL"; else echo "None"; fi ;;
  *"cloudfront create-origin-access-control"*) mark oac; echo "OACFICTIONAL" ;;
  *"cloudfront list-response-headers-policies"*)
    if have rhp; then echo "RHPFICTIONAL"; else echo "None"; fi ;;
  *"cloudfront create-response-headers-policy"*) mark rhp; echo "RHPFICTIONAL" ;;
  *"cloudfront list-distributions"*"Id"*)
    if have dist; then echo "DISTFICTIONAL"; else echo "None"; fi ;;
  *"cloudfront create-distribution"*) mark dist; echo "DISTFICTIONAL" ;;
  *"cloudfront get-distribution"*"DomainName"*) echo "dfictional.cloudfront.net" ;;
  *"iam get-user"*) have user || exit 254 ;;
  *"iam create-user"*) mark user; echo '{}' ;;
  *"iam put-user-policy"*) echo "put" >> "$state/puts" ;;
  *"iam list-access-keys"*)
    if have key; then echo "$FAKE_ACCESS_KEY"; else echo "None"; fi ;;
  *"iam create-access-key"*)
    mark key
    echo "created" >> "$state/keys"
    printf '%s\t%s\n' "$FAKE_ACCESS_KEY" "$FAKE_SECRET" ;;
  *) echo "fake aws: unexpected: $args" >&2; exit 99 ;;
esac
`;

let dir: string;
let state: string;

function run(profile = "fictional-profile", confirm = ACCOUNT, fakeAccount = ACCOUNT) {
  const args = [SCRIPT, profile, confirm].filter((arg) => arg !== "");
  return spawnSync("bash", args, {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}`,
      HOME: dir,
      FAKE_AWS_STATE: state,
      FAKE_ACCOUNT: fakeAccount,
      FAKE_ACCESS_KEY: ACCESS_KEY,
      FAKE_SECRET: SECRET,
      PHOTO_SECRET_DIR: path.join(dir, "secrets"),
    },
  });
}

const calls = () =>
  existsSync(path.join(state, "calls")) ? readFileSync(path.join(state, "calls"), "utf8") : "";
const secretFile = () => path.join(dir, "secrets", `noren-photos-${ACCOUNT}.env`);

beforeEach(() => {
  mkdirSync(path.join(ROOT, ".scratch"), { recursive: true });
  dir = mkdtempSync(path.join(ROOT, ".scratch", "photo-script-"));
  state = path.join(dir, "state");
  mkdirSync(state);
  mkdirSync(path.join(dir, "bin"));
  writeFileSync(path.join(dir, "bin", "aws"), FAKE_AWS);
  chmodSync(path.join(dir, "bin", "aws"), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the bucket setup script, against a fake aws", () => {
  it("needs both arguments, and makes no call without them", () => {
    const result = run("fictional-profile", "");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/usage/i);
    expect(calls()).toBe("");
  });

  it("refuses a confirmation that is not an account number", () => {
    const result = run("fictional-profile", "yes");
    expect(result.status).not.toBe(0);
    expect(calls()).toBe("");
  });

  it("stops before any write when the profile is another account", () => {
    const result = run("fictional-profile", ACCOUNT, "999988887777");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("999988887777");
    expect(calls().trim().split("\n")).toHaveLength(1);
    expect(calls()).toContain("sts get-caller-identity");
  });

  it("uses the named profile and Tokyo on every call", () => {
    expect(run().status).toBe(0);
    for (const line of calls().trim().split("\n")) {
      expect(line).toContain("--profile fictional-profile");
    }
    expect(calls()).toContain("s3api create-bucket");
    expect(calls()).toContain("LocationConstraint=ap-northeast-1");
    expect(calls()).toContain("--region ap-northeast-1");
  });

  it("blocks public access, encrypts, allows one origin, and expires incoming after a day", () => {
    expect(run().status).toBe(0);
    const log = calls();
    expect(log).toContain("put-public-access-block");
    expect(log).toContain("BlockPublicAcls=true");
    expect(log).toContain("BlockPublicPolicy=true");
    expect(log).toContain("IgnorePublicAcls=true");
    expect(log).toContain("RestrictPublicBuckets=true");
    expect(log).toContain("put-bucket-encryption");
    expect(log).toContain("put-bucket-cors");
    expect(log).toContain('"AllowedOrigins":["https://noren.yooi.me"]');
    expect(log).toContain('"AllowedMethods":["POST"]');
    expect(log).toContain("put-bucket-lifecycle-configuration");
    expect(log).toContain('"Prefix":"incoming/"');
    expect(log).toContain('"Days":1');
  });

  it("lets CloudFront read photos only, and this distribution only", () => {
    expect(run().status).toBe(0);
    const log = calls();
    expect(log).toContain("put-bucket-policy");
    expect(log).toContain("cloudfront.amazonaws.com");
    expect(log).toContain("/photos/*");
    expect(log).toContain("distribution/DISTFICTIONAL");
    expect(log).toContain('"Allow"');
    expect(log).not.toMatch(/"Principal":"\*"/);
  });

  it("limits the app's user to the two prefixes, with no list or wildcard action", () => {
    expect(run().status).toBe(0);
    const policy = calls()
      .split("\n")
      .find((line) => line.includes("iam put-user-policy"))!;
    expect(policy).toContain("/incoming/*");
    expect(policy).toContain("/photos/*");
    expect(policy).toContain("s3:PutObject");
    expect(policy).toContain("s3:GetObject");
    expect(policy).toContain("s3:DeleteObject");
    expect(policy).not.toContain("s3:*");
    expect(policy).not.toContain("ListBucket");
  });

  it("never prints the secret key, and writes it to a file only its owner can read", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(SECRET);
    expect(result.stderr).not.toContain(SECRET);
    expect(readFileSync(secretFile(), "utf8")).toContain(SECRET);
    expect(statSync(secretFile()).mode & 0o777).toBe(0o600);
  });

  it("prints each setting to add and where it goes, and the file with the secret", () => {
    const { stdout } = run();
    expect(stdout).toContain(`PHOTOS_S3_BUCKET=noren-story-photos-${ACCOUNT}`);
    expect(stdout).toContain("PHOTOS_S3_REGION=ap-northeast-1");
    expect(stdout).toContain(`PHOTOS_S3_ACCESS_KEY_ID=${ACCESS_KEY}`);
    expect(stdout).toContain("PHOTOS_PUBLIC_BASE_URL=https://dfictional.cloudfront.net");
    expect(stdout).toContain("PHOTOS_S3_SECRET_ACCESS_KEY");
    expect(stdout).toContain(secretFile());
    expect(stdout).toMatch(/Vercel/);
    expect(stdout).toMatch(/Convex/);
  });

  it("is safe to rerun: no second key, nothing created twice, the file left alone", () => {
    expect(run().status).toBe(0);
    const firstFile = readFileSync(secretFile(), "utf8");
    const second = run();
    expect(second.status).toBe(0);
    expect(second.stdout).not.toContain(SECRET);
    expect(readFileSync(path.join(state, "keys"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(calls().match(/s3api create-bucket/g)).toHaveLength(1);
    expect(calls().match(/cloudfront create-distribution/g)).toHaveLength(1);
    expect(calls().match(/cloudfront create-origin-access-control/g)).toHaveLength(1);
    expect(calls().match(/iam create-user/g)).toHaveLength(1);
    expect(readFileSync(secretFile(), "utf8")).toBe(firstFile);
  });
});

describe("the bucket setup script itself", () => {
  it("parses, and has no other way to write the secret out", () => {
    const parsed = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" });
    expect(parsed.status).toBe(0);
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("set -euo pipefail");
    expect(source).not.toMatch(/set -x/);
    // One read from AWS, one write to the private file, and then it is gone.
    const uses = source.split("\n").filter((line) => line.includes("NEW_SECRET_KEY"));
    expect(uses).toHaveLength(3);
    expect(uses[0]).toMatch(/^\s*read -r ACCESS_KEY_ID NEW_SECRET_KEY/);
    expect(uses[1]).toMatch(/^\s*printf .* >"\$SECRET_FILE"$/);
    expect(uses[2]).toMatch(/^\s*unset NEW_SECRET_KEY$/);
  });
});

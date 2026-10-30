import { execFile } from "node:child_process";

export type Identity = { subject: string; issuer: string };
export type ConvexRunner = (
  fn: string,
  args: unknown,
  options?: { identity?: Identity },
) => Promise<unknown>;
export type ExecFileLike = (
  file: string,
  args: string[],
  options: { cwd: string; maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function createCliRunner(options: {
  prod: boolean;
  cwd: string;
  exec?: ExecFileLike;
}): ConvexRunner {
  const execute: ExecFileLike = options.exec ?? execFile;
  return (fn, args, runOptions) =>
    new Promise((resolve, reject) => {
      const argv = ["convex", "run", fn, JSON.stringify(args)];
      if (runOptions?.identity) argv.push("--identity", JSON.stringify(runOptions.identity));
      if (options.prod) argv.push("--prod");
      execute(
        "npx",
        argv,
        { cwd: options.cwd, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }
          // `convex run` prints nothing for a function that returns null (e.g. places:attachOwner).
          if (stdout.trim() === "") {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(
              new Error(
                `Convex CLI returned non-JSON stdout: ${JSON.stringify(stdout.slice(0, 200))}`,
              ),
            );
          }
        },
      );
    });
}

export function parseSeedFlags(argv: readonly string[]): {
  data: string;
  issuer?: string;
  prod: boolean;
  dryRun: boolean;
} {
  let data = "";
  let issuer: string | undefined;
  let prod = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--prod") prod = true;
    else if (flag === "--dry-run") dryRun = true;
    else if (flag === "--data" || flag === "--issuer") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      if (flag === "--data") data = value;
      else {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
          throw new Error("--issuer must be an https URL without credentials, query or fragment");
        issuer = value; // Preserve the exact iss, including its trailing slash semantics.
      }
    } else throw new Error(`Unknown flag: ${flag}`);
  }
  return { data, issuer, prod, dryRun };
}

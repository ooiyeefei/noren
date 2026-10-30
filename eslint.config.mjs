import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Written by `convex dev`; never edited by hand.
    "convex/_generated/**",
    // Copied from node_modules by scripts/copy-maplibre-worker.mjs; minified, not ours to lint.
    "public/maplibre/**",
  ]),
  {
    // Every write must pass through the triggers in convex/lib/gate.ts, so the raw wrappers
    // are off limits everywhere else (research D3, D19).
    files: ["convex/**/*.ts"],
    ignores: ["convex/lib/gate.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/server"],
              importNames: ["mutation", "internalMutation"],
              message: "Import mutation or internalMutation from convex/lib/gate instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

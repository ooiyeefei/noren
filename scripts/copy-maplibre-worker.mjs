import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function workerCopyTools() {
  const src = fileURLToPath(
    new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url),
  );
  const dest = fileURLToPath(new URL("../public/maplibre/maplibre-gl-worker.mjs", import.meta.url));

  function copyIfChanged(src, dest) {
    let content;
    try {
      content = readFileSync(src);
    } catch {
      throw new Error(`MapLibre worker source missing or unreadable: ${src}`);
    }
    if (!content.length) throw new Error(`MapLibre worker source is empty: ${src}`);

    let existing;
    try {
      existing = readFileSync(dest);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing?.length === content.length && existing.equals(content)) {
      return { changed: false, bytes: content.length };
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    return { changed: true, bytes: content.length };
  }

  return { src, dest, copyIfChanged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { src, dest, copyIfChanged } = workerCopyTools();
    const { bytes } = copyIfChanged(src, dest);
    console.log(`${dest} (${bytes} bytes)`);
  } catch (error) {
    console.error(error.message.replace(/[\r\n]+/g, " "));
    process.exit(1);
  }
}

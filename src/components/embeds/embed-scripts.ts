import type { EmbedDescriptor } from "@/lib/ports";

export type EmbedPlan =
  | { kind: "link"; url: string }
  | { kind: "facade" }
  | { kind: "iframe"; src: string }
  | { kind: "blockquote"; url: string; scriptUrl: string };

export function embedPlan(embed: EmbedDescriptor, loaded: boolean): EmbedPlan {
  if (embed.kind === "link") return { kind: "link", url: embed.url };
  if (!loaded) return { kind: "facade" };
  return embed.kind === "iframe" ? { kind: "iframe", src: embed.url } : embed;
}

export function isAllowedOrigin(url: string, allowedOrigins: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      allowedOrigins.includes(parsed.origin)
    );
  } catch {
    return false;
  }
}

type EmbedWindow = Window & {
  instgrm?: { Embeds: { process(): void } };
  twttr?: { widgets: { load(): void } };
};
const scripts = new WeakMap<Document, Map<string, Promise<void>>>();

export function loadEmbedScript(
  scriptUrl: string,
  allowedOrigins: readonly string[],
  doc: Document = document,
): Promise<void> {
  if (!isAllowedOrigin(scriptUrl, allowedOrigins))
    return Promise.reject(new Error("Disallowed embed script"));
  const url = new URL(scriptUrl).href;
  let pending = scripts.get(doc);
  if (!pending) {
    pending = new Map();
    scripts.set(doc, pending);
  }
  let promise = pending.get(url);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const selectorUrl = url.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      const existing = doc.querySelector<HTMLScriptElement>(`script[src="${selectorUrl}"]`);
      if (existing?.dataset.embedLoaded === "true") {
        resolve();
        return;
      }
      const script = existing ?? doc.createElement("script");
      script.addEventListener(
        "load",
        () => {
          script.dataset.embedLoaded = "true";
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        () => {
          script.remove();
          reject(new Error("Embed script failed"));
        },
        { once: true },
      );
      if (!existing) {
        script.async = true;
        script.src = url;
        doc.head.appendChild(script);
      }
    });
    pending.set(url, promise);
  }
  return promise.then(() => {
    const view = doc.defaultView as EmbedWindow | null;
    view?.instgrm?.Embeds.process();
    view?.twttr?.widgets.load();
  });
}

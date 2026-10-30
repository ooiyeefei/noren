import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS, embedFor } from "../../src/lib/adapters";
import { SOURCE_LIVENESS } from "../../src/lib/ports";
import type { SourceAdapterId } from "../../src/lib/domain/constants";

const samples: Record<SourceAdapterId, string[]> = {
  link_card: ["https://example.com/post?utm_source=example#example", "http://EXAMPLE.com/post"],
  meta_embed: [
    "https://instagram.com/p/EXAMPLE123",
    "https://www.instagram.com/reel/EXAMPLE123/",
    "https://instagram.com/tv/EXAMPLE123/",
    "https://facebook.com/example/posts/1234567890",
    "https://facebook.com/example/videos/1234567890",
    "https://facebook.com/watch/?v=1234567890",
    "https://facebook.com/reel/1234567890",
    "https://facebook.com/permalink.php?story_fbid=1234567890&id=1234567890",
    "https://facebook.com/share/p/EXAMPLE123",
    "https://facebook.com/share/v/EXAMPLE123",
    "https://threads.net/@example/post/EXAMPLE123",
    "https://threads.com/t/EXAMPLE123",
  ],
  youtube: [
    "https://youtube.com/watch?v=AAAAAAAAAAA",
    "https://youtu.be/AAAAAAAAAAA?si=EXAMPLE123",
    "https://youtube.com/shorts/AAAAAAAAAAA",
    "https://youtube.com/embed/AAAAAAAAAAA",
    "https://youtube.com/live/AAAAAAAAAAA",
    "https://youtube-nocookie.com/embed/AAAAAAAAAAA",
  ],
  x: [
    "https://twitter.com/example/status/1234567890?s=example&t=example",
    "https://x.com/i/web/status/1234567890",
  ],
  google_maps_link: [
    "https://google.co.jp/maps?place_id=EXAMPLE123&query=example",
    "https://google.com/maps?query_place_id=EXAMPLE123",
    "https://google.com/maps/place/example",
    "https://maps.app.goo.gl/EXAMPLE123",
    "https://goo.gl/maps/EXAMPLE123",
  ],
  tiktok: [
    "https://tiktok.com/@example/video/1234567890?utm_source=example",
    "https://m.tiktok.com/@example/video/1234567890",
  ],
};

// Script-rendered frames are absent from the initial blockquote descriptor.
const scriptFrameOrigins: Record<string, readonly string[]> = {
  "https://www.instagram.com/embed.js": ["https://www.instagram.com"],
  "https://platform.twitter.com/widgets.js": ["https://platform.twitter.com"],
};

afterEach(() => vi.unstubAllGlobals());

describe.each(Object.values(ADAPTERS))("SourceAdapter contract: $id", (adapter) => {
  it("matches its samples", () => {
    for (const url of samples[adapter.id]) expect(adapter.matches(url), url).toBe(true);
  });

  it("describe is idempotent on its canonical URL", () => {
    for (const url of samples[adapter.id]) {
      const description = adapter.describe(url);
      expect(adapter.describe(description.canonicalUrl)).toEqual(description);
    }
  });

  it("embedFor(id, canonical) equals describe(canonical).embed", () => {
    for (const url of samples[adapter.id]) {
      const canonical = adapter.describe(url).canonicalUrl;
      expect(embedFor(adapter.id, canonical)).toEqual(adapter.describe(canonical).embed);
    }
  });

  it("every blockquote scriptUrl origin is in scriptHosts", () => {
    for (const url of samples[adapter.id]) {
      const { embed } = adapter.describe(url);
      if (embed.kind === "blockquote") {
        expect(adapter.policy.scriptHosts).toContain(new URL(embed.scriptUrl).origin);
      }
    }
  });

  it("every iframe url origin is in frameHosts", () => {
    for (const url of samples[adapter.id]) {
      const { embed } = adapter.describe(url);
      if (embed.kind === "iframe") expect(adapter.frameHosts).toContain(new URL(embed.url).origin);
    }
  });

  it("every frame origin created by an embed script is in frameHosts", () => {
    for (const url of samples[adapter.id]) {
      const { embed } = adapter.describe(url);
      if (embed.kind !== "blockquote") continue;
      const origins = scriptFrameOrigins[embed.scriptUrl];
      expect(origins, `Unspecified frame origins for ${embed.scriptUrl}`).toBeDefined();
      for (const origin of origins!) expect(adapter.frameHosts).toContain(origin);
    }
  });

  it("embeds use https, link cards keep the pasted scheme, and URLs contain no '<'", () => {
    for (const url of samples[adapter.id]) {
      const { embed } = adapter.describe(url);
      const urls = embed.kind === "blockquote" ? [embed.url, embed.scriptUrl] : [embed.url];
      for (const output of urls) {
        expect(new URL(output).protocol).toBe(
          adapter.id === "link_card" ? new URL(url).protocol : "https:",
        );
        expect(output).not.toContain("<");
      }
    }
  });

  it("policy flags are false", () => {
    expect(adapter.policy.storesContent).toBe(false);
    expect(adapter.policy.aiAllowed).toBe(false);
  });

  it("liveness resolves to one of SOURCE_LIVENESS with a stubbed fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(null, { status: 200 })),
    );
    for (const url of samples[adapter.id]) {
      expect(SOURCE_LIVENESS).toContain(await adapter.liveness(adapter.describe(url).canonicalUrl));
    }
  });

  it("matches and describe never call fetch", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const url of [...samples[adapter.id], "https://example.com/unsupported", "not a URL"]) {
      if (adapter.matches(url)) adapter.describe(url);
      else expect(() => adapter.describe(url)).toThrow(Error);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

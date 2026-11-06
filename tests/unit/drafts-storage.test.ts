import { describe, expect, it } from "vitest";
import { canReuseUpload, photoDraftKey } from "@/lib/drafts/photo-store";
import {
  DRAFT_TTL_MS,
  clearDraftScope,
  draftData,
  draftKey,
  draftScope,
  freshDraft,
  removeDraft,
  sweepDrafts,
  writeDraft,
  type DraftStorage,
} from "@/lib/drafts/storage";

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const NOW = 1_800_000_000_000;

describe("draft scope", () => {
  it("waits for sign-in, then keeps a member's drafts apart from a visitor's", () => {
    expect(draftScope(false, "user_1")).toBeNull();
    expect(draftScope(true, "user_1")).toBe("u:user_1");
    expect(draftScope(true, null)).toBe("anon");
    expect(draftKey("u:user_1", "story:p1:text")).toBe("noren:draft:u:user_1:story:p1:text");
  });
});

describe("kept drafts", () => {
  it("reads back what was written", () => {
    const storage = memoryStorage();
    const key = draftKey("u:a", "story:p1:text");
    writeDraft(storage, key, { body: "Somen at noon" }, 1, NOW);
    const raw = freshDraft(storage.getItem(key), 1, NOW + 1000);
    expect(raw).not.toBeNull();
    expect(draftData(raw!)).toEqual({ body: "Somen at noon" });
    removeDraft(storage, key);
    expect(storage.getItem(key)).toBeNull();
  });

  it("ignores a draft from another version of the form, a week old, or not JSON", () => {
    const storage = memoryStorage();
    writeDraft(storage, "k", "text", 1, NOW);
    expect(freshDraft(storage.getItem("k"), 2, NOW)).toBeNull();
    expect(freshDraft(storage.getItem("k"), 1, NOW + DRAFT_TTL_MS)).toBeNull();
    expect(freshDraft("not json", 1, NOW)).toBeNull();
    expect(freshDraft(null, 1, NOW)).toBeNull();
  });

  it("keeps the form working when storage throws", () => {
    const broken: DraftStorage = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeDraft(broken, "k", "text", 1, NOW)).not.toThrow();
    expect(() => removeDraft(broken, "k")).not.toThrow();
    expect(() => clearDraftScope(broken, "u:a")).not.toThrow();
    expect(() => sweepDrafts(broken, NOW)).not.toThrow();
  });

  it("clears one member's drafts on sign-out and leaves everyone else's", () => {
    const storage = memoryStorage();
    writeDraft(storage, draftKey("u:a", "story:p1:text"), "a1", 1, NOW);
    writeDraft(storage, draftKey("u:a", "check:p2"), "a2", 1, NOW);
    writeDraft(storage, draftKey("u:ab", "story:p1:text"), "ab", 1, NOW);
    storage.setItem("noren:guide", "dismissed");
    clearDraftScope(storage, "u:a");
    expect([...storage.map.keys()].sort()).toEqual([
      "noren:draft:u:ab:story:p1:text",
      "noren:guide",
    ]);
  });

  it("sweeps drafts past their week, and nothing that is not a draft", () => {
    const storage = memoryStorage();
    writeDraft(storage, draftKey("u:a", "old"), "x", 1, NOW - DRAFT_TTL_MS);
    writeDraft(storage, draftKey("u:a", "new"), "y", 1, NOW - 1000);
    storage.setItem(draftKey("anon", "broken"), "{");
    storage.setItem("noren:guide", "dismissed");
    sweepDrafts(storage, NOW);
    expect([...storage.map.keys()].sort()).toEqual(["noren:draft:u:a:new", "noren:guide"]);
  });
});

describe("kept photos", () => {
  const HOUR = 60 * 60 * 1000;
  const file = new Blob(["jpeg"]);

  it("attaches an upload the server still keeps, and sends again one it may have let go", () => {
    const keep = 22 * HOUR;
    expect(canReuseUpload({ id: 1, file, photoId: "p", uploadedAt: NOW - HOUR }, NOW, keep)).toBe(
      true,
    );
    expect(canReuseUpload({ id: 1, file, photoId: "p", uploadedAt: NOW - keep }, NOW, keep)).toBe(
      false,
    );
  });

  it("sends again a photo whose upload the reload cut off", () => {
    expect(canReuseUpload({ id: 1, file }, NOW, 22 * HOUR)).toBe(false);
    expect(canReuseUpload({ id: 1, file, photoId: "p" }, NOW, 22 * HOUR)).toBe(false);
  });

  it("keys photos by member, so clearing one member's leaves another's", () => {
    expect(photoDraftKey("u:a", "story:p1")).toBe("u:a:story:p1");
  });
});

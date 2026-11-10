import { describe, expect, it } from "vitest";
import { legalDocuments, lineText } from "@/lib/i18n/messages/legal-documents";
import { shareMessages } from "@/lib/i18n/messages/share";

// The notice quotes the words on the screen, and says who may post. The file asks for its words and
// documentsVersion to change with them, so a change to the tick or the buttons that is not matched
// there fails here.
const quoted = (text: string) => text.replace(/[.。]$/, "");
const section = (locale: "en" | "ja", kind: "terms" | "privacy", id: string) => {
  const found = legalDocuments[locale][kind].sections.find((s) => s.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return [...(found.paragraphs ?? []), ...(found.items ?? []), ...(found.closing ?? [])]
    .map(lineText)
    .join("\n");
};
const sharing = (locale: "en" | "ja") => section(locale, "privacy", "story-pictures");

describe.each(["en", "ja"] as const)("the sharing words in the notice, %s", (locale) => {
  const m = shareMessages[locale];

  it("quote the button, the tick and the two choices exactly as the screen says them", () => {
    const text = sharing(locale);
    expect(text).toContain(m.button);
    expect(text).toContain(quoted(m.consentTick));
    expect(text).toContain(m.consentAllow);
    expect(text).toContain(m.consentStop);
  });

  it("keep no word of the labels that were replaced, and do not say a picture carries a photo", () => {
    const everything = [sharing(locale), section(locale, "terms", "rights")].join("\n");
    for (const old of [
      "Share as a picture",
      "its own accounts, credited to you",
      "Take back",
      "first photo",
      "画像でシェアする",
      "公式アカウントで、あなたの名前を添えて",
      "「取り消す」",
      "最初の写真",
    ])
      expect(everything).not.toContain(old);
  });
});

describe("who may post, as the notice and the terms say it", () => {
  it("names the place's verified owner as well as a person at Noren, and says nothing posts by itself", () => {
    expect(sharing("en")).toContain("the place's verified owner on Noren");
    expect(sharing("en")).toContain("Noren never posts by itself");
    expect(sharing("en")).toContain("never your photos");
    expect(sharing("ja")).toContain("Noren に確認済みのその場所のオーナー");
    expect(sharing("ja")).toContain("Noren が自動で投稿することはありません");
    expect(sharing("ja")).toContain("写真は使いません");
  });

  it("keeps the contact for taking a post down, in both languages", () => {
    expect(sharing("en")).toContain("{contact}");
    expect(sharing("ja")).toContain("{contact}");
  });

  it("has the terms say Noren and the place's owner may post the words and name on Instagram", () => {
    expect(section("en", "terms", "rights")).toContain(
      "you also allow Noren, and the verified owner of the place, to post its words and your name on Instagram",
    );
    expect(section("ja", "terms", "rights")).toContain(
      "Noren と、Noren に確認済みのその場所のオーナーが、本文と表示名を Instagram に投稿",
    );
  });
});

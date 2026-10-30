import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AiAssistedBadge,
  DemoBadge,
  MachineTranslationBadge,
  TranslationPendingBadge,
  UnreviewedBadge,
} from "@/components/badges";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";

const badges = [
  {
    Component: DemoBadge,
    id: "demo",
    key: "demo",
    hint: "demoHint",
    labels: ["デモ", "Demo"],
    hints: ["デモ用の架空のデータです", "Mock data for the demo"],
  },
  {
    Component: MachineTranslationBadge,
    id: "machine-translation",
    key: "machineTranslation",
    hint: "machineTranslationHint",
    labels: ["機械翻訳", "Machine translation"],
    hints: [
      "自動で翻訳されたもので、まだ人が確認していません",
      "Translated automatically; not yet checked by a person",
    ],
  },
  {
    Component: UnreviewedBadge,
    id: "unreviewed",
    key: "unreviewed",
    hint: "unreviewedHint",
    labels: ["未レビュー", "Unreviewed"],
    hints: ["日本語話者による確認がまだです", "Not yet reviewed by a Japanese speaker"],
  },
  {
    Component: AiAssistedBadge,
    id: "ai-assisted",
    key: "aiAssisted",
    hint: "aiAssistedHint",
    labels: ["AI 支援", "AI-assisted"],
    hints: ["AI の支援を受けて作成されました", "Written with help from AI"],
  },
  {
    Component: TranslationPendingBadge,
    id: "translation-pending",
    key: "translationPending",
    hint: "translationPendingHint",
    labels: ["翻訳待ち", "Translation pending"],
    hints: ["まだ翻訳がないため、原文を表示しています", "No translation yet; showing the original"],
  },
] as const;

describe("each badge renders its text and hint in ja and en", () => {
  for (const { Component, id, labels, hints } of badges) {
    SUPPORTED_LOCALES.forEach((locale, index) => {
      it(`${id} in ${locale}`, () => {
        const html = renderToStaticMarkup(<Component locale={locale} className="caller-class" />);
        expect(html).toContain(`data-badge="${id}"`);
        expect(html).toContain(`lang="${locale}"`);
        expect(html).toContain(`title="${hints[index]}"`);
        expect(html).toContain(`>${labels[index]}</span>`);
        expect(html).toContain("caller-class");
      });
    });
  }
});

it("no badge renders an empty label", () => {
  for (const { Component } of badges) {
    for (const locale of SUPPORTED_LOCALES) {
      const label = renderToStaticMarkup(<Component locale={locale} />)
        .replace(/<[^>]*>/g, "")
        .trim();
      expect(label.length).toBeGreaterThan(0);
    }
  }
});

it("badge messages have the same keys in both locales", () => {
  expect(Object.keys(badgeMessages.ja).sort()).toEqual(Object.keys(badgeMessages.en).sort());
  expect(Object.keys(badgeMessages.ja)).toHaveLength(10);
  for (const { key, hint } of badges) {
    for (const locale of SUPPORTED_LOCALES) {
      expect(badgeMessages[locale][key].trim()).not.toBe("");
      expect(badgeMessages[locale][hint].trim()).not.toBe("");
    }
  }
});

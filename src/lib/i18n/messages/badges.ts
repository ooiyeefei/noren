import { defineMessages } from "../index";

// Japanese UI copy remains unreviewed until owner task T098.
export const badgeMessages = defineMessages({
  ja: {
    demo: "デモ",
    demoHint: "デモ用の架空のデータです",
    machineTranslation: "機械翻訳",
    machineTranslationHint: "自動で翻訳されたもので、まだ人が確認していません",
    unreviewed: "未レビュー",
    unreviewedHint: "日本語話者による確認がまだです",
    aiAssisted: "AI 支援",
    aiAssistedHint: "AI の支援を受けて作成されました",
    translationPending: "翻訳待ち",
    translationPendingHint: "まだ翻訳がないため、原文を表示しています",
    unconfirmed: "未確認",
    unconfirmedHint: "オープンデータから載せた場所で、まだ誰も現地で確かめていません",
  },
  en: {
    demo: "Demo",
    demoHint: "Mock data for the demo",
    machineTranslation: "Machine translation",
    machineTranslationHint: "Translated automatically; not yet checked by a person",
    unreviewed: "Unreviewed",
    unreviewedHint: "Not yet reviewed by a Japanese speaker",
    aiAssisted: "AI-assisted",
    aiAssistedHint: "Written with help from AI",
    translationPending: "Translation pending",
    translationPendingHint: "No translation yet; showing the original",
    unconfirmed: "Not yet confirmed",
    unconfirmedHint: "Listed from open data; no one has checked it in person yet",
  },
});

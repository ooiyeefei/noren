import { defineMessages } from "../index";

// The page a signed-out visitor meets first. Japanese UI copy remains unreviewed until owner task T098.
export const welcomeMessages = defineMessages({
  ja: {
    metaTitle: "ようこそ",
    heroTitle: "誰かが、もう書き残している。",
    heroLead:
      "Noren は、長崎の地元のお店や場所と、そこについて人々が語ってきた物語を載せた地図です。",
    openMap: "地図をひらく",
    filmLabel: "Noren を紹介する動画",
    filmNote: "2分32秒。音声は英語の合成音声で、制作者の言葉を読み上げています。日本語字幕つき。",
    filmFallback: "動画をダウンロードして見る",
    captionsEn: "English",
    captionsJa: "日本語",
    howTitle: "使いかた",
    findTitle: "黄色いのれんを探す",
    findBody: "地図の黄色いのれんは、誰かがその場所の物語を書き残している印です。",
    readTitle: "その奥にいる人を読む",
    readBody:
      "人々が書いたものを AI が短い物語にまとめ、AI が書いたことも明記します。どの文も、もとの投稿につながっています。",
    addTitle: "あなたの話を加える",
    addBody:
      "自分の物語を書くことも、すでに投稿したもののリンクを貼ることもできます。「今もあります」をワンタップすると、次に来る人の役に立ち、スタンプ帳にそのお店のスタンプが入ります。",
    membersNote: "読むのは誰でもできます。投稿は、いまは招待制です。",
    ctaTitle: "次にのれんをくぐるとき、その誰かは、あなたかもしれません。",
  },
  en: {
    metaTitle: "Welcome",
    heroTitle: "Somebody already wrote it down.",
    heroLead:
      "Noren is a map of Nagasaki's local places, with the stories people have told about them.",
    openMap: "Open the map",
    filmLabel: "A film introducing Noren",
    filmNote: "2 minutes 32 seconds, with captions. The voice is synthetic, reading the maker's words.",
    filmFallback: "Download the film",
    captionsEn: "English",
    captionsJa: "日本語",
    howTitle: "How it works",
    findTitle: "Look for the yellow noren",
    findBody: "A yellow curtain on the map means somebody wrote down a story about that place.",
    readTitle: "Read about the people behind it",
    readBody:
      "AI gathers what people wrote into a short story, and says that it did. Every sentence links to the post it came from.",
    addTitle: "Add what you saw",
    addBody:
      "Write your own story, or paste a link to something you already posted. One tap on Still here helps the next visitor and puts the place's stamp in your stamp book.",
    membersNote: "Anyone can read Noren. Adding to it is invite-only for now.",
    ctaTitle: "Next time you walk through a noren, that somebody could be you.",
  },
});

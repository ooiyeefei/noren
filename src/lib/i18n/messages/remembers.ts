import { defineMessages } from "../index";

// "What Noren remembers". Japanese copy awaits native-speaker review.
export const remembersMessages = defineMessages({
  en: {
    metaTitle: "What Noren remembers",
    title: "What Noren remembers",
    lead: "These are kept on this device, in your browser. Noren's servers do not store them.",
    privacyHeading: "Kept on your device",
    privacyBody:
      "An allergy is health information, and a diet such as halal can show a religious belief. Under Japan's privacy law (APPI) they can count as special care-required personal information, so Noren keeps them on this device only. When you plan a day, your rules and likes travel with that one request so the draw can use them, and Noren does not store them. They are never shown to the AI model: it sees only what you type or say in the chat, and what you put under today's trip. “Forget everything” clears them from this device at any time.",
    cantKeep:
      "This browser won't keep your choices after you close the page (a private window, or blocked storage).",
    planLink: "Plan my day",

    rulesHeading: "Hard rules",
    rulesNote:
      "Noren follows these whenever it can check them, and they never fade. Where it can't check, it says so every time.",
    rulesEmpty: "No rules yet.",
    canCheck: "Noren can check this",
    cannotCheck: "Noren can't check this. Ask the place.",
    allergyPrefix: "Allergy: ",
    quickAdd: "Quick add",
    allergyChip: "Allergy…",
    allergyStart: "allergic to ",
    rulesFull: "That is the most rules Noren can use at once ({max}). Remove one to add another.",
    addRuleLabel: "Add a rule",
    addRuleHelp: "For example “no spicy food”, or “allergic to peanuts” to add an allergy.",

    tastesHeading: "Likes",
    tastesNote:
      "A like only tilts the draw toward it and never rules a place out. Likes you add stay until you remove them. Likes Noren notices from the places you open and save fade after about three weeks.",
    tastesEmpty: "Nothing yet. Open and save places and Noren will notice, or add a few.",
    tasteTold: "You added this",
    tasteNoticed: "Noticed from what you opened. Fades.",
    addTasteLabel: "Add something you like",
    addTasteHelp: "For example “history”, “coffee” or “old shops”.",

    tripHeading: "Today's trip",
    tripNote:
      "Places you've been and things you've eaten today. They are wiped at the end of the day in Japan unless you keep them.",
    tripEmpty: "Nothing yet today.",
    addTripLabel: "Add something you did today",
    addTripHelp: "For example “champon for lunch” or “Dejima”.",
    keepAfterToday: "Keep after today",
    keptAfterToday: "Kept after today",

    add: "+ Add",
    remove: "Remove {label}",
    voiceSummary: "Use your voice instead",

    forgetHeading: "Forget everything",
    forgetBody: "Removes your rules, likes and today's trip from this device.",
    forgetButton: "Forget everything",
    forgetConfirm: "Forget everything on this device?",
    forgetYes: "Yes, forget",
    forgetNo: "Keep it",
    forgotten: "Everything is forgotten.",
  },
  ja: {
    metaTitle: "Noren が覚えていること",
    title: "Noren が覚えていること",
    lead: "これらはこの端末のブラウザの中に保管されます。Noren のサーバーには保存されません。",
    privacyHeading: "端末の中に保管",
    privacyBody:
      "アレルギーは健康に関する情報であり、ハラールのような食事は信仰を示すことがあります。日本の個人情報保護法（APPI）では「要配慮個人情報」にあたる場合があるため、Noren はこの端末の中だけに保管します。一日のプランを作るときは、その一回のリクエストに限ってルールと好みが送られ、抽選に使われます。Noren はそれを保存しません。AI モデルには見せません。AI が受け取るのは、チャットに入力・発話した内容と、「今日の行き先」に入れたものだけです。「すべて忘れる」で、いつでもこの端末から消せます。",
    cantKeep:
      "このブラウザでは、ページを閉じると設定が保存されません（プライベートウィンドウ、またはストレージがブロックされています）。",
    planLink: "一日のプランを作る",

    rulesHeading: "守るルール",
    rulesNote:
      "Noren は確認できる限り必ず守ります。時間がたっても薄れません。確認できないときは、そのたびにお知らせします。",
    rulesEmpty: "ルールはまだありません。",
    canCheck: "Noren が確認できます",
    cannotCheck: "Noren では確認できません。お店に確認してください。",
    allergyPrefix: "アレルギー：",
    quickAdd: "すぐ追加",
    allergyChip: "アレルギー…",
    allergyStart: "アレルギー ",
    rulesFull:
      "Noren が一度に使えるルールは最大{max}件です。追加するには、どれかを削除してください。",
    addRuleLabel: "ルールを追加",
    addRuleHelp:
      "例：「辛いものは避ける」。アレルギーは「ピーナッツアレルギー」のように入力します。",

    tastesHeading: "好み",
    tastesNote:
      "好みは抽選の確率を少し傾けるだけで、場所を除外することはありません。自分で追加した好みは、消すまで残ります。開いたり保存したりした場所から Noren が気づいた好みは、約3週間で薄れていきます。",
    tastesEmpty:
      "まだありません。場所を開いたり保存したりすると Noren が気づきます。自分で追加もできます。",
    tasteTold: "あなたが追加しました",
    tasteNoticed: "開いた場所から気づきました。薄れていきます。",
    addTasteLabel: "好きなものを追加",
    addTasteHelp: "例：「歴史」「コーヒー」「古い商店」",

    tripHeading: "今日の行き先",
    tripNote:
      "今日行った場所や食べたもの。残す設定にしない限り、日本時間の一日の終わりに消えます。",
    tripEmpty: "今日はまだありません。",
    addTripLabel: "今日したことを追加",
    addTripHelp: "例：「お昼にちゃんぽん」「出島」",
    keepAfterToday: "今日が終わっても残す",
    keptAfterToday: "今日が終わっても残します",

    add: "＋ 追加",
    remove: "{label}を削除",
    voiceSummary: "声で入力する",

    forgetHeading: "すべて忘れる",
    forgetBody: "ルール・好み・今日の行き先を、この端末から削除します。",
    forgetButton: "すべて忘れる",
    forgetConfirm: "この端末の記憶をすべて削除しますか？",
    forgetYes: "はい、削除します",
    forgetNo: "やめる",
    forgotten: "すべて削除しました。",
  },
});

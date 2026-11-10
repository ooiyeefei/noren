import { defineMessages } from "../index";

// "Plan my day" and "What Noren remembers". Japanese copy awaits native-speaker review.
export const plannerMessages = defineMessages({
  en: {
    metaTitle: "Plan my day",
    title: "Plan my day",
    lead: "Say what you'd like to do. Noren draws a short walk from real places nearby and shows what people have written about them.",
    signInTitle: "Sign in to plan your day",
    signInBody:
      "Planning uses AI, so it is for signed-in members. What you type and the plan you get are not stored.",
    signInLink: "Sign in",

    startHeading: "Where do you start?",
    startNearest: "Nearest to me",
    startNeighbourhood: "Neighbourhood",
    startPlace: "A place",
    startNeighbourhoodLabel: "Choose a neighbourhood",
    startNeighbourhoodNone: "Choose…",
    startPlaceLabel: "Search for a place",
    startNoPlace: "No place by that name.",
    startChosenNeighbourhood: "Starting in {name}.",
    startChosenPlace: "Starting at {name}.",
    startNone: "No start chosen yet.",
    startClear: "Clear",
    locating: "Finding the nearest neighbourhood…",
    nearestNote:
      "Your phone works out the nearest neighbourhood. Only its name goes to Noren, never where you are.",
    locDenied:
      "Noren can't read your location. Turn location on for this site in your settings, or pick a neighbourhood.",
    locUnavailable:
      "Your device couldn't find your location. Try again outside, or pick a neighbourhood.",
    locTimeout: "Finding your location took too long. Try again, or pick a neighbourhood.",
    locUnsupported: "This browser can't read a location. Pick a neighbourhood instead.",
    locFar: "You seem to be far from the neighbourhoods Noren knows. Pick one instead.",

    usingHeading: "Noren will use what it remembers",
    usingNothing:
      "Nothing saved yet. Say something like “I'm vegetarian” and Noren will ask if you want it remembered.",
    usingRules: "Rules: {list}",
    usingTastes: "Likes: {list}",
    usingDone: "Done today: {list}",
    usingEdit: "Change what Noren remembers",

    inputLabel: "What would you like to do?",
    inputPlaceholder: "Three stops near Shinchi. I'm vegetarian and I like history.",
    send: "Plan",
    sending: "Asking Noren…",
    voiceSummary: "Use your voice instead",
    voiceNote: "Your words appear in the box. Check them, then send.",
    tryHeading: "Try asking",
    example1: "Three stops near Shinchi, I like history",
    example2: "What do people say about Dejima?",
    example3: "Draw today's omikuji",
    you: "You",

    aiLabel: "Picked by Noren's AI from members' stories",
    drawnLabel: "Drawn at random by Noren. No AI wrote any of this.",
    drawNote:
      "Stops are drawn at random from real places near the start. This is not a ranking and not a recommendation.",
    stopsOne: "1 stop",
    stopsMany: "{n} stops",
    minutesOnFoot: "about {n} minutes on foot",
    wildNone: "no wild cards",
    wildOne: "1 wild card",
    wildMany: "{n} wild cards",
    shorter: "Only {got} of the {asked} stops you asked for are near enough.",
    noStops: "Noren found no places near the start that fit. Try another start, or fewer rules.",
    startedFrom: "Start: {name}",
    legFrom: "{minutes} min on foot from {from}",
    whyWild: "Wild card — not picked for you",
    whyMatched: "Matches your interest in {list}",
    whyRandomHad: "Drawn at random. It does not match your interests, which only tilt the odds",
    whyRandom: "Drawn at random from places near the start",
    openPage: "Open the page",
    nobodyWroteHere: "Nobody has written about this place yet.",
    writeFirst: "Write the first story",
    rulesAppliedHeading: "Rules Noren applied",
    rulesAppliedLine: "{tag}: Noren {checks}. {limit}.",
    rulesNotCheckedHeading: "Rules Noren can't check",
    rulesNotCheckedIntro: "Noren has no data for these, so a stop may break them. Ask the place.",
    rulesNotCheckedLine: "{tag}: {reason}",
    interestsNotMatched: "Noren doesn't know how to match: {list}. They didn't change the draw.",
    leftOut: "Part of the AI's answer didn't match what members wrote, so it was left out.",
    plainNote:
      "The AI's words couldn't be checked against members' stories, so only the draw is shown.",
    emptyReply: "Noren couldn't make a plan from that. Try rephrasing, or pick a start.",
    needsStart:
      "Where would you like to start? Pick a neighbourhood, a place or “Nearest to me” above, then ask again.",
    answersHeading: "What people wrote",
    nobodyWrote: "Nobody on Noren has written about that yet.",
    writeAbout: "Write about {name}",
    writeSomewhere: "Find a place and write the first story",
    omikujiHeading: "Today's omikuji",
    omikujiNote:
      "The slip comes from a template, not from AI. It is the same for everyone who asks about this area today.",
    errorGeneric: "Noren couldn't answer just now. Try again in a moment.",

    proposalRemember: "Remember: {text}?",
    proposalForget: "Forget: {text}?",
    proposalVisitedAdd: "Add to today's trip: {text}?",
    proposalVisitedRemove: "Take off today's trip: {text}?",
    saidAs: "You said: “{words}”",
    yes: "Yes",
    no: "No",
    appliedAdd: "Saved on this device.",
    appliedRemove: "Removed from this device.",
    declined: "Left as it was.",

    foundBy: "Found by Noren in a public post by {name}",
    foundByAnon: "Found by Noren in a public post",
    originalPost: "Original post",
    sourceWords: "Source {n}",
    topic: "About: {topic}",
    humanTranslation: "Translation confirmed by a person",
  },
  ja: {
    metaTitle: "一日のプラン",
    title: "一日のプラン",
    lead: "やりたいことを伝えてください。Noren が近くの実在の場所から短い散歩コースを選び、その場所について人々が書いたことを見せます。",
    signInTitle: "ログインしてプランを作る",
    signInBody:
      "プランづくりは AI を使うため、ログインした方のみご利用いただけます。入力した内容とプランは保存されません。",
    signInLink: "ログイン",

    startHeading: "どこから始めますか？",
    startNearest: "現在地の近く",
    startNeighbourhood: "エリア",
    startPlace: "場所",
    startNeighbourhoodLabel: "エリアを選ぶ",
    startNeighbourhoodNone: "選んでください…",
    startPlaceLabel: "場所を探す",
    startNoPlace: "その名前の場所は見つかりません。",
    startChosenNeighbourhood: "{name}から始めます。",
    startChosenPlace: "{name}から始めます。",
    startNone: "出発地はまだ選ばれていません。",
    startClear: "選び直す",
    locating: "近くのエリアを探しています…",
    nearestNote:
      "お使いの端末が近くのエリアを調べます。Noren に送られるのはエリアの名前だけで、いまいる場所は送られません。",
    locDenied:
      "位置情報を読み取れません。設定でこのサイトの位置情報をオンにするか、エリアを選んでください。",
    locUnavailable:
      "位置情報を取得できませんでした。屋外でもう一度試すか、エリアを選んでください。",
    locTimeout: "位置情報の取得に時間がかかりすぎました。もう一度試すか、エリアを選んでください。",
    locUnsupported: "このブラウザでは位置情報を読み取れません。エリアを選んでください。",
    locFar: "Noren が扱うエリアから離れているようです。エリアを選んでください。",

    usingHeading: "Noren は覚えていることを使います",
    usingNothing:
      "まだ何も保存されていません。「ベジタリアンです」のように伝えると、覚えておくかどうかを Noren が尋ねます。",
    usingRules: "ルール：{list}",
    usingTastes: "好み：{list}",
    usingDone: "今日行ったところ：{list}",
    usingEdit: "覚えていることを見直す",

    inputLabel: "やりたいことは何ですか？",
    inputPlaceholder: "新地の近くで3か所。ベジタリアンで、歴史が好きです。",
    send: "プランを作る",
    sending: "Noren に聞いています…",
    voiceSummary: "声で入力する",
    voiceNote: "話した内容は入力欄に表示されます。確認してから送ってください。",
    tryHeading: "例えば",
    example1: "新地の近くで3か所、歴史が好きです",
    example2: "出島について、みんなは何と書いていますか？",
    example3: "今日のおみくじを引く",
    you: "あなた",

    aiLabel: "メンバーの話から Noren の AI が選びました",
    drawnLabel: "Noren が無作為に選びました。AI が書いた文章は含まれていません。",
    drawNote:
      "立ち寄り先は、出発地の近くの実在の場所から無作為に選んでいます。順位でも、おすすめでもありません。",
    stopsOne: "1か所",
    stopsMany: "{n}か所",
    minutesOnFoot: "徒歩で約{n}分",
    wildNone: "ワイルドカードなし",
    wildOne: "ワイルドカード1か所",
    wildMany: "ワイルドカード{n}か所",
    shorter: "ご希望の{asked}か所のうち、近くで見つかったのは{got}か所です。",
    noStops:
      "出発地の近くに条件に合う場所が見つかりませんでした。別の出発地を試すか、ルールを減らしてください。",
    startedFrom: "出発地：{name}",
    legFrom: "{from}から徒歩約{minutes}分",
    whyWild: "ワイルドカード — あなたに合わせて選んだ場所ではありません",
    whyMatched: "{list}への興味に合っています",
    whyRandomHad:
      "無作為に選ばれた場所です。興味は確率を傾けるだけなので、合っていないこともあります",
    whyRandom: "出発地の近くから無作為に選ばれました",
    openPage: "ページを開く",
    nobodyWroteHere: "この場所について、まだ誰も書いていません。",
    writeFirst: "最初のストーリーを書く",
    rulesAppliedHeading: "適用したルール",
    rulesAppliedLine: "{tag}：Noren は{checks}。{limit}。",
    rulesNotCheckedHeading: "確認できなかったルール",
    rulesNotCheckedIntro:
      "これらは Noren にデータがないため、条件に合わない場所が含まれることがあります。お店に確認してください。",
    rulesNotCheckedLine: "{tag}：{reason}",
    interestsNotMatched: "次の興味は照合できませんでした：{list}。抽選には反映されていません。",
    leftOut: "AI の回答のうち、メンバーが書いた内容と照合できない部分は除きました。",
    plainNote: "AI の回答をメンバーの話と照合できなかったため、抽選の結果だけを表示しています。",
    emptyReply: "その内容ではプランを作れませんでした。言い方を変えるか、出発地を選んでください。",
    needsStart:
      "どこから始めますか？上でエリア・場所・「現在地の近く」のいずれかを選んでから、もう一度お聞きください。",
    answersHeading: "書かれていたこと",
    nobodyWrote: "それについては、まだ Noren に誰も書いていません。",
    writeAbout: "{name}について書く",
    writeSomewhere: "場所を探して最初のストーリーを書く",
    omikujiHeading: "今日のおみくじ",
    omikujiNote:
      "おみくじの文は AI ではなく、決まった文型から作られています。今日このエリアで引いた人は、みな同じ結果になります。",
    errorGeneric: "いま回答できませんでした。少ししてからもう一度お試しください。",

    proposalRemember: "覚えておきますか：{text}",
    proposalForget: "忘れますか：{text}",
    proposalVisitedAdd: "今日の行き先に追加しますか：{text}",
    proposalVisitedRemove: "今日の行き先から外しますか：{text}",
    saidAs: "あなたの言葉：「{words}」",
    yes: "はい",
    no: "いいえ",
    appliedAdd: "この端末に保存しました。",
    appliedRemove: "この端末から削除しました。",
    declined: "そのままにしました。",

    foundBy: "公開投稿から Noren が見つけました（投稿者：{name}）",
    foundByAnon: "公開投稿から Noren が見つけました",
    originalPost: "元の投稿",
    sourceWords: "出典 {n}",
    topic: "内容：{topic}",
    humanTranslation: "人が確認した翻訳",
  },
});

/**
 * The draw's own wording, which is English, in Japanese. The page shows the draw's sentences as they
 * are in English and uses this table for Japanese. A sentence not in the table is shown as it is, so
 * a new rule can never show nothing; tests/unit/planner-ui.test.tsx fails when a rule has no entry.
 */
export const DRAW_TEXT_JA: Readonly<Record<string, string>> = {
  "leaves out places whose owner says they take cash only":
    "オーナーが現金のみと伝えている場所を除きます",
  "leaves out places that list steps or accessibility notes":
    "段差やバリアフリーに関する注意が載っている場所を除きます",
  "leaves out places whose owner says a reservation is required":
    "オーナーが予約必須と伝えている場所を除きます",
  "leaves out places whose owner asks for no photography":
    "オーナーが撮影お断りと伝えている場所を除きます",
  "leaves out bars and izakaya": "バー・居酒屋を除きます",
  "Noren cannot tell whether the other places take cards":
    "他の場所がカード払いに対応しているかは分かりません",
  "Noren cannot confirm that any place is step-free": "どの場所が段差なしかは確認できません",
  "Noren cannot tell whether the other places are easy to walk into":
    "他の場所が予約なしで入りやすいかは分かりません",
  "Noren cannot tell whether the other places welcome photos":
    "他の場所が撮影を歓迎しているかは分かりません",
  "Noren cannot tell whether a restaurant or café serves alcohol":
    "飲食店やカフェがお酒を出すかどうかは分かりません",
  "Noren has no menu or ingredient data, so it cannot check this. Ask the place.":
    "Noren にはメニューや食材のデータがないため確認できません。お店に直接ご確認ください。",
  "Noren has no data it can check this against.": "確認に使えるデータがありません。",
  "This region does not record that.": "この地域ではその情報を記録していません。",
  "Owners' statements are not shown on Noren yet, so this cannot be checked.":
    "お店の方の声がまだ Noren に載っていないため、確認できません。",
};

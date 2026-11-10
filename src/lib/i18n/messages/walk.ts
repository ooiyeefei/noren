import { defineMessages, type MessageTable } from "@/lib/i18n";

// Walk mode and the day's omikuji. The Japanese copy is unreviewed: no native speaker has read it
// yet, and the site footer says so (T098). Plain words, short sentences, because it is read
// outdoors and some of it is spoken aloud.
export const walkMessages = defineMessages({
  en: {
    metaTitle: "Walk mode",
    title: "Walk mode",
    lead: "Keep this page open while you walk. When you pass a place with a story, a card shows it, and Noren can read the first lines aloud. Earphones work best.",
    iphoneNote:
      "On iPhone, keep the screen on and this page in front. A web page cannot read your location in the background. A phone app that walks with you hands-free may come later.",
    privacyLine:
      "Your phone works out where you are and how far each place is. Noren does not receive your location.",
    desktopTitle: "Walk mode is for phones",
    desktopBody:
      "Open this page on your phone and press Start walk. Below, you can still draw today's omikuji by picking a neighbourhood.",

    start: "Start walk",
    stop: "Stop walk",
    starting: "Starting…",
    statusWalking: "Walking. Noren is watching for stories near you.",
    statusFinding: "Finding your position…",
    statusRough: "Your position is rough (about {metres} m), so Noren is waiting for a better one.",
    placesLoaded: "{count} places are on your phone now.",
    screenHeld: "The screen will stay on.",
    screenRefused: "Keep the screen on",
    screenRefusedBody:
      "Your phone would not let Noren hold the screen awake. Please keep it on yourself while you walk.",
    problemDenied:
      "Noren cannot read your location. Turn on location for this site in your phone's settings, then press Start walk again.",
    problemUnsupported: "This browser cannot read your location. Try your phone's own browser.",
    problemLoad: "Noren could not load the places. Check your connection and try again.",

    soundOn: "Sound on",
    soundOff: "Sound off",
    soundHint: "Reads the first lines of a story aloud when you pass a place.",
    noVoice:
      "This phone has no on-device voice for {language}, so Noren shows these words and does not read them.",
    noVoiceAtAll:
      "This phone has no on-device voice, so Noren shows the words and does not read them.",
    stopTalking: "Stop talking",
    readAloud: "Read aloud",
    speaking: "Reading aloud…",

    nearYou: "Near you",
    metresAway: "{metres} m away",
    writtenIn: "Written in {language}.",
    readWhole: "Read the whole story",
    openPlace: "Open the place page",
    hasStoryNoWords: "People have shared stories about this place.",
    readStories: "Read the stories",
    close: "Close",
    earlier: "Earlier on this walk",
    newTab: "Opens in a new tab, so your walk keeps going.",
    askAbout: "Ask about this place",

    introMember: "{name} wrote:",
    introMemberAnon: "Someone wrote:",
    introStitched: "Noren's AI stitched this from public posts:",
    introPost: "A public post by {author}:",
    introPostAnon: "A public post:",
    introMachine: "A machine translation of a public post by {author}:",
    introMachineAnon: "A machine translation of a public post:",
    aiNote:
      "Stitched by Noren's AI from {count} posts. AI can misread them, so go and read the posts.",
    aiSources: "Posts from {platforms}. Each sentence leads to its words on the place page.",
    webPages: "web pages",
    postNote:
      "A short quote from a public post, with the name the author uses on that platform. Read the original on the place page.",

    firstStory: "Nobody has written about {name} yet. Go in and be the first.",
    detourLane: "There's a lane nobody has mentioned {minutes} min away.",
    detourPlace: "A short detour: {minutes} min away.",
    randomPick: "A random pick, drawn on your phone. Not a recommendation.",

    omikujiTitle: "Today's omikuji (おみくじ)",
    omikujiLead:
      "Draw today's slip, like the ones at Suwa Shrine. It names one place to go to. Everyone gets the same slip in the same neighbourhood today.",
    omikujiRandom: "A random pick for the day. It is not a ranking and not a fortune.",
    omikujiWhere: "Where",
    nearMe: "Near me",
    allOf: "All of {region}",
    drawSlip: "Draw today's slip",
    drawing: "Drawing…",
    locating: "Reading your location once, on this phone…",
    locationDenied: "Noren cannot read your location. Pick a neighbourhood instead.",
    slipFor: "Today's slip for {where}, {day}",
    slipNoPlace: "There is no place to draw for {where} today.",
    slipLeg: "About {metres} m, {minutes} min on foot, to the {direction}.",
    slipFromCentre:
      "About {metres} m, {minutes} min on foot, to the {direction}, from the middle of {name}.",
    slipHere: "It is right here.",
    slipAtCentre: "It is right at the middle of {name}.",
    compassN: "north",
    compassNE: "north-east",
    compassE: "east",
    compassSE: "south-east",
    compassS: "south",
    compassSW: "south-west",
    compassW: "west",
    compassNW: "north-west",
  },
  ja: {
    metaTitle: "歩きモード",
    title: "歩きモード",
    lead: "歩いている間、このページを開いたままにしてください。物語のある場所の近くを通ると、カードが出て、最初の数行を読み上げることもできます。イヤホンがおすすめです。",
    iphoneNote:
      "iPhone では、画面をつけたまま、このページを前に出しておいてください。ウェブページは、裏側では位置情報を読めません。手ぶらで歩けるアプリは、いずれ作るかもしれません。",
    privacyLine:
      "いまどこにいるか、各場所まであと何メートルかは、お使いの端末の中で計算します。位置情報は Noren に送られません。",
    desktopTitle: "歩きモードはスマートフォン向けです",
    desktopBody:
      "スマートフォンでこのページを開き、「歩きはじめる」を押してください。このまま下で、地区を選んで今日のおみくじを引くこともできます。",

    start: "歩きはじめる",
    stop: "歩きおわる",
    starting: "準備しています…",
    statusWalking: "歩いています。近くの物語を探しています。",
    statusFinding: "現在地を探しています…",
    statusRough: "現在地の誤差が大きい（約{metres} m）ので、よくなるのを待っています。",
    placesLoaded: "{count}件の場所を端末に読み込みました。",
    screenHeld: "画面はつけたままになります。",
    screenRefused: "画面をつけたままにしてください",
    screenRefusedBody:
      "お使いの端末が、Noren による画面の維持を許可しませんでした。歩いている間は、ご自身で画面をつけたままにしてください。",
    problemDenied:
      "位置情報を読めません。端末の設定でこのサイトの位置情報をオンにして、もう一度「歩きはじめる」を押してください。",
    problemUnsupported:
      "このブラウザでは位置情報を読めません。端末の標準ブラウザでお試しください。",
    problemLoad: "場所を読み込めませんでした。通信状況を確かめて、もう一度お試しください。",

    soundOn: "音声オン",
    soundOff: "音声オフ",
    soundHint: "場所の近くを通ると、物語の最初の数行を読み上げます。",
    noVoice: "この端末には{language}の音声が入っていないため、読み上げずに文章だけを表示します。",
    noVoiceAtAll: "この端末には音声が入っていないため、読み上げずに文章だけを表示します。",
    stopTalking: "読み上げを止める",
    readAloud: "読み上げる",
    speaking: "読み上げています…",

    nearYou: "近くにあります",
    metresAway: "{metres} m先",
    writtenIn: "{language}で書かれています。",
    readWhole: "物語を全部読む",
    openPlace: "場所のページを開く",
    hasStoryNoWords: "この場所について、物語が寄せられています。",
    readStories: "物語を読む",
    close: "閉じる",
    earlier: "この散歩のこれまで",
    newTab: "新しいタブで開くので、歩きは続きます。",
    askAbout: "この場所についてたずねる",

    introMember: "{name} が書きました。",
    introMemberAnon: "ある人が書きました。",
    introStitched: "Noren の AI が、公開されている投稿から仕立てました。",
    introPost: "{author} さんの公開投稿です。",
    introPostAnon: "公開されている投稿です。",
    introMachine: "{author} さんの公開投稿の機械翻訳です。",
    introMachineAnon: "公開されている投稿の機械翻訳です。",
    aiNote:
      "{count}件の投稿をもとに、Noren の AI が仕立てました。AI が読み違えることもあるので、元の投稿もお読みください。",
    aiSources: "{platforms}の投稿です。場所のページで、各文のもとの言葉を読めます。",
    webPages: "ウェブページ",
    postNote:
      "公開されている投稿の短い引用です。名前は、その投稿者がそのサービスで使っているものです。元の投稿は、場所のページで読めます。",

    firstStory: "{name}について書いた人は、まだいません。入って、最初の一人になりませんか。",
    detourLane: "まだ誰も書いていない路地が、歩いて{minutes}分のところにあります。",
    detourPlace: "ちょっと寄り道：歩いて{minutes}分です。",
    randomPick: "端末の中でくじ引きで選びました。おすすめではありません。",

    omikujiTitle: "今日のおみくじ",
    omikujiLead:
      "諏訪神社のおみくじのように、今日の一枚を引きます。行ってみる場所が一つ書かれています。今日は、同じ地区なら誰でも同じ一枚です。",
    omikujiRandom: "今日のくじ引きです。順位でも、運勢でもありません。",
    omikujiWhere: "地区",
    nearMe: "現在地の近く",
    allOf: "{region}ぜんぶ",
    drawSlip: "今日の一枚を引く",
    drawing: "引いています…",
    locating: "この端末の中で、位置情報を一度だけ読んでいます…",
    locationDenied: "位置情報を読めません。かわりに地区を選んでください。",
    slipFor: "{where}の今日の一枚（{day}）",
    slipNoPlace: "{where}には、今日引ける場所がありません。",
    slipLeg: "約{metres} m、徒歩およそ{minutes}分、{direction}の方向です。",
    slipFromCentre:
      "{name}の中心から、約{metres} m、徒歩およそ{minutes}分、{direction}の方向です。",
    slipHere: "ここがその場所です。",
    slipAtCentre: "{name}のちょうど中心にあります。",
    compassN: "北",
    compassNE: "北東",
    compassE: "東",
    compassSE: "南東",
    compassS: "南",
    compassSW: "南西",
    compassW: "西",
    compassNW: "北西",
  },
});

export type WalkMessageTable = MessageTable<keyof (typeof walkMessages)["en"]>;

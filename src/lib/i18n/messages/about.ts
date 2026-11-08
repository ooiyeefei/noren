import { defineMessages } from "../index";

// The "What is Noren" page. Japanese UI copy remains unreviewed until owner task T098.
export const aboutMessages = defineMessages({
  ja: {
    metaTitle: "Noren とは？",
    heroTitle: "Noren とは？",
    heroLead:
      "Noren は、長崎の地元のお店と、その奥にいる人たちの物語を載せたオープンな地図です。星の数も、広告も、ランキングもありません。",
    openMap: "地図をひらく",
    watchFilm: "映像で見る",
    meaningTitle: "名前の由来",
    meaningBody:
      "日本のお店は、店を開けるときにのれんを掛けます。のれんには店の名前が染めてあり、お客さんはそれをくぐって中に入ります。Noren は、まちに対して同じことをします。のれんの向こうに何があるのかを見せるのです。",
    together: "使い分けてください。行き方は Google マップで、行く理由は Noren で。",
    feelTitle: "同じお店、ふたつのページ",
    typicalLabel: "よくある掲載ページ",
    typicalCaption: "点数、順位、広告、そして知らない人たちの意見。",
    norenLabel: "Noren のページ",
    norenCaption:
      "人々が書いたものからまとめた短い物語と、一文ごとの出典。確かめたかどうかも正直に表示します。",
    sponsored: "広告",
    topTen: "トップ10",
    confirmedChip: "現地で確認済み",
    sourceReview: "訪れた人の口コミ",
    sourcePost: "地元の人のブログ投稿",
    promisesTitle: "Noren の約束",
    p1Title: "点数ではなく、物語を",
    p1Body: "星もランキングもトップ10もありません。お店は数字ではないからです。",
    p2Title: "すべての文に出典を",
    p2Body:
      "物語は人々の投稿をもとに AI が書き、そのことを明記します。各文の脚注から、もとになった投稿をたどれます。",
    p3Title: "誰でも削除を依頼できます",
    p3Body:
      "AI は投稿を読み違えることがあります。誤りや、載せるべきでないものを見つけたら、このページの下にあるフォームから依頼してください。アカウントは不要で、担当者がすべての依頼を確認します。",
    p4Title: "売り物にしない",
    p4Body: "広告も有料掲載もありません。地図に載るのは無料で、お金で順位は動きません。",
    p5Title: "正直な表示",
    p5Body:
      "確かめていないことは、そう書きます。オープンデータから載せた場所は、行った人が「今もあります」と伝えるまで「未確認」のままです。",
    p6Title: "ひらかれている",
    p6Body:
      "コードはオープンソース（Apache-2.0）、地図はオープンデータ。地図は私たちのものではなく、まちのものです。",
    statusTitle: "いまの Noren",
    nowLabel: "いま",
    nowBody:
      "長崎。地元の場所、数千か所をひとつの地図に。その一部には物語があります。行ったことのある人が「今もあります」と伝えるまで、どの場所にも「未確認」の表示がつきます。",
    nextLabel: "これから",
    nextBody: "ひとつの地区から順に。物語を増やし、このまちのやり方とその理由も加えていきます。",
    noticedTitle: "気づいたこと",
    noticedBody:
      "大きな街の外にある小さなお店は、見つけにくいことがあります。日本語を読まない旅行者にとっては、なおさらです。お店の人は日々の営業で忙しく、外国語でネットに書くことまでは、なかなか手が回りません。",
    ideaTitle: "次に取り組んでいるアイデア",
    ideaBody:
      "お店の人が Noren で自分のお店を登録すると、確認した話を英語と地元の言葉（今は日本語、広がれば他の国の言葉も）で受け取り、Google や Instagram などの SNS をはじめ、インターネットのどこにでも投稿でき、店先に貼るポスターも用意できる。そんな仕組みを考えています。まだアイデアの段階で、公開はしていません。参加しているお店もまだありません。",
    madeInBefore: "Noren は、",
    programName: "Nagasaki Nomad",
    madeInAfter: " のプログラムに参加して、長崎でつくりました。心から感謝しています。",
    openBody:
      "オープンソースのプロジェクトで、一緒につくってくれる人を歓迎しています。誰でも、ここから発展させることができます。",
    contactBefore: "ご連絡は ",
    contactAfter: " まで。",
    ctaTitle: "のれんの向こうの物語を探しに。",
  },
  en: {
    metaTitle: "What is Noren?",
    heroTitle: "What is Noren?",
    heroLead:
      "Noren is an open map of Nagasaki's local places and the stories of the people behind them. No stars, no ads, no ranking.",
    openMap: "Open the map",
    watchFilm: "Watch the film",
    meaningTitle: "The name",
    meaningBody:
      "In Japan, a shop hangs its noren, a split cloth curtain, when it opens. The cloth carries the shop's name, and you part it to step inside. Noren does the same for a city: it shows you what is behind the curtain.",
    together: "Use them together: Google Maps to get there, Noren to know why.",
    feelTitle: "One place, two kinds of page",
    typicalLabel: "A typical listing",
    typicalCaption: "A score, a rank, ads and strangers' opinions.",
    norenLabel: "A Noren page",
    norenCaption:
      "A short story from what people wrote, a source under every sentence, and an honest label for what has been checked.",
    sponsored: "Sponsored",
    topTen: "Top 10",
    confirmedChip: "Confirmed in person",
    sourceReview: "A visitor's review",
    sourcePost: "A local's blog post",
    promisesTitle: "What Noren promises",
    p1Title: "Stories, not scores",
    p1Body: "No stars, no rankings, no top-10 lists. A place is not a number.",
    p2Title: "Every sentence shows its source",
    p2Body:
      "AI writes each story from what people posted, and says so. A footnote under each sentence leads to the post it came from.",
    p3Title: "Anyone can ask us to remove something",
    p3Body:
      "AI can misread a post. If something here is wrong or shouldn't be here, use the form at the bottom of this page. You don't need an account, and a person reads every request.",
    p4Title: "Nothing is for sale",
    p4Body:
      "No ads and no paid placement. Being on the map costs nothing, and money cannot move a place up.",
    p5Title: "Honest labels",
    p5Body:
      "Noren says what it has not checked. A place listed from open data stays “Not yet confirmed” until someone who has been there says “Still here”.",
    p6Title: "Open",
    p6Body:
      "Open-source code (Apache-2.0) and open map data. The map belongs to the city, not to us.",
    statusTitle: "Where it is today",
    nowLabel: "Now",
    nowBody:
      "Nagasaki. Thousands of local places on one map, and stories for some of them. Each place stays labelled “Not yet confirmed” until a member who has been there says “Still here”.",
    nextLabel: "Next",
    nextBody:
      "One neighbourhood at a time: more stories, and local ways (how things work here, and why).",
    noticedTitle: "Something we've noticed",
    noticedBody:
      "Small places outside the big cities can be hard to find, above all for visitors who don't read Japanese. Owners are busy running the place, and writing about it online in a second language rarely comes first.",
    ideaTitle: "An idea we're working on next",
    ideaBody:
      "Owners could claim their place on Noren and get their own story back in English and their local language (Japanese for now, others as we expand), ready to share on Google, Instagram and other social media, or anywhere online, with a poster for the window. It's still an idea: it isn't live yet, and no shop has signed up.",
    madeInBefore: "Made in Nagasaki, with thanks to the ",
    programName: "Nagasaki Nomad programme",
    madeInAfter: ".",
    openBody: "Noren is an open-source project, open for collaboration: anyone can build on it.",
    contactBefore: " To get involved, write to ",
    contactAfter: ".",
    ctaTitle: "Find the story behind the curtain.",
  },
});

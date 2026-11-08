import { defineMessages } from "../index";

// The mock proposal for local teams (spec 002, US5). Every name, number and gift here is a sample:
// no real place, shop or neighbourhood appears, and tests/unit/proposal.test.tsx checks that against
// regions/nagasaki.json and the Shinchi set. Japanese UI copy remains unreviewed until a person
// reads it (FR-123).
export const proposalMessages = defineMessages({
  ja: {
    metaTitle: "地域のみなさまへ",
    heroTitle: "地区ののれん",
    heroLead:
      "お店や場所を訪ねるたびに、地区ののれんが一枚ずつ染まります。パズルのピースのようなものです。絵は、全部染まるまで見えません。染め上がったのれんは、バッジとして手元に残ります。",
    nextTitle: "地区がこの先、運営できること",
    statement:
      "このページは、地域のみなさまにお見せするための提案です。お店も、商店街も、地域の団体も、まだどれにも同意していません。以下の画面はすべて見本で、名前は仮のもの、数字は例です。",
    stepsLabel: "これからの流れ",

    nowWhen: "いま",
    nowBody:
      "訪れた人が歩いて、GPS でチェックインし、地区ののれんを染め上げて、その絵を手元に残します。お店がすることは何もありません。",
    nowTag: "いま動いています",
    pilotWhen: "試行",
    pilotBody:
      "一つの地区で、5〜10店、ひとつの季節に。染め上げた人は、ささやかな記念品をもらえます。レジに QR コードを置くと、買い物をしたことがスタンプに残せます。",
    pilotTag: "見本です。地域のパートナーが必要です。",
    laterWhen: "そのあと",
    laterBody:
      "地域のチームが、自分たちの絵、場所、日にち、特典で、のれんを運営します。試行で人が使うとわかれば、クーポンやキャッシュバックも加えます。",
    laterTag: "見本です。地域のパートナーが必要です。",

    giftTitle: "染め上げた記念品",
    giftNorenLabel: "染め上がった見本ののれん",
    giftBody:
      "見本商店街ののれんが染め上がりました。見本商店街の事務所でこの画面を見せると、ささやかな記念品がもらえます。",
    giftShow: "スタッフに見せる",
    giftMark: "スタッフ：渡したことにする",
    giftGiven: "渡しました",
    giftCaption: "染め上げた人は全員、同じ記念品をもらえます。運に左右されません。",

    qrTitle: "レジの QR コード",
    qrLabel: "使えない見本の模様です",
    qrShop: "見本の店 A",
    qrBody: "お支払いのあとに読み取ります。3枚目が染まります。",
    qrCaption:
      "これは絵で、読み取れません。GPS でわかるのは近くまで来たことだけです。買い物をしたことがわかるのは、この QR コードだけです。",

    teamTitle: "地域のチームがのれんをつくる",
    teamNameLabel: "のれんの名前",
    teamName: "見本商店街 秋ののれん",
    teamPlacesLabel: "場所",
    shopA: "見本の店 A",
    shopB: "見本の店 B",
    shrine: "見本神社",
    teamRewardLabel: "特典",
    rewardBadge: "バッジのみ",
    rewardGift: "記念品",
    rewardCoupon: "クーポン",
    teamCaption:
      "絵も、チームが用意します。たとえば、地元の作家の作品や、権利を持っているキャラクターです。",

    shopTitle: "お店に見えるもの",
    shopVisits: "10月に、このセットで訪れた人",
    shopStories: "お店のページに加わった新しい話",
    shopCaption:
      "数字は例です。まだどのお店もこれを行っていないためです。お店に見えるのは合計だけで、誰が来たかは見えません。",

    teamGetsTitle: "地域のチームにとっての良いところ",
    teamGets1: "訪れる人が、大通りから離れて、小さなお店まで歩く理由になります。",
    teamGets2: "行った人が書いた新しい話が、お店ごとのページに増えます。",
    teamGets3: "開発者を雇わなくても、自分たちの絵と特典を加えられます。",
    askTitle: "お願いしたいこと",
    ask1: "試行の場になってくれる商店街か団体が一つ。",
    ask2: "レジに QR コードを置いてくれるお店が5〜10店。",
    ask3: "ささやかな記念品と、それを渡す人。",

    rules:
      "どのお店も、いつも同じ一枚を渡します。そのため、運で手に入る一枚はありません。消費者庁が示している例では、3店でそれぞれ1,000円を使うと600円までの景品を出せるとされ、来店するだけでもらえる景品は200円までとされています。実施の前に、消費者庁か県に計画を確かめます。",
    rulesLink: "消費者庁の景品規制のページ",
    opensInNewTab: "（新しいタブで開きます）",
  },
  en: {
    metaTitle: "For local teams",
    heroTitle: "Neighbourhood noren",
    heroLead:
      "Each visit dyes one panel of a neighbourhood's curtain, like one puzzle piece. The picture stays hidden until every panel is dyed, and then the finished noren is yours to keep as a badge.",
    nextTitle: "What a neighbourhood could run next",
    statement:
      "This page is a proposal to show local teams. No shop, shopping street or local body has agreed to any of it. Every screen below is a mock, with sample names and example numbers.",
    stepsLabel: "How it could grow",

    nowWhen: "Now",
    nowBody:
      "Visitors walk, check in by GPS, finish a neighbourhood and keep its picture. Shops don't need to do anything.",
    nowTag: "Working today",
    pilotWhen: "Pilot",
    pilotBody:
      "One neighbourhood, 5 to 10 shops, one season. Finishing the set earns a small gift. A QR code at the till means a stamp can show a purchase.",
    pilotTag: "Mock. Needs local partners.",
    laterWhen: "Later",
    laterBody:
      "Local teams run their own sets with their own art, places, dates and rewards. Coupons or cashback come in if the pilot shows people spend.",
    laterTag: "Mock. Needs local partners.",

    giftTitle: "A gift for finishing",
    giftNorenLabel: "A finished sample noren",
    giftBody:
      "You finished Sample Street's noren. Show this at the Sample Street office for a small gift.",
    giftShow: "Show to staff",
    giftMark: "Staff: mark as given",
    giftGiven: "Given",
    giftCaption: "Everyone who finishes gets the same gift, so chance plays no part.",

    qrTitle: "A QR code at the till",
    qrLabel: "A sample pattern that is not a working code",
    qrShop: "Sample Shop A",
    qrBody: "Scan after you pay. This gives you panel 3.",
    qrCaption:
      "This is a drawing and won't scan. GPS shows you came near, and only this shows you bought something.",

    teamTitle: "A local team builds a set",
    teamNameLabel: "Set name",
    teamName: "Sample Street autumn noren",
    teamPlacesLabel: "Places",
    shopA: "Sample Shop A",
    shopB: "Sample Shop B",
    shrine: "Sample Shrine",
    teamRewardLabel: "Reward",
    rewardBadge: "Badge only",
    rewardGift: "Gift",
    rewardCoupon: "Coupon",
    teamCaption:
      "The team also adds its own art, such as work by a local artist or a mascot it holds the rights to.",

    shopTitle: "What a shop sees",
    shopVisits: "visits through this set in October",
    shopStories: "new stories on your page",
    shopCaption:
      "Example numbers, because no shop has run this yet. Shops see totals and never see who visited.",

    teamGetsTitle: "What a local team gets",
    teamGets1: "A reason for visitors to walk beyond the main street and into smaller shops.",
    teamGets2: "New stories on each shop's page, written by people who went.",
    teamGets3: "A way to add its own art and rewards without hiring a developer.",
    askTitle: "What we would ask for",
    ask1: "One shopping street or association to host the pilot.",
    ask2: "5 to 10 shops willing to put a QR code at the till.",
    ask3: "A small gift, and someone to hand it out.",

    rules:
      "Each shop always gives the same panel, so nobody gets a panel by chance. In the Consumer Affairs Agency's own example, ¥1,000 at each of 3 shops allows a gift of up to ¥600, and a gift for visiting alone is capped at ¥200. We would confirm the plan with the agency or the prefecture before any pilot.",
    rulesLink: "The agency's prize rules",
    opensInNewTab: "(opens in a new tab)",
  },
});

import { defineMessages } from "../index";

// The stamp book and neighbourhood missions. Japanese UI copy remains unreviewed until owner task T098.
export const stampMessages = defineMessages({
  ja: {
    title: "スタンプ帳",
    intro:
      "確かめた場所や、話を分かち合った場所のスタンプが、ここに集まります。見られるのはあなただけです。",
    empty:
      "スタンプはまだありません。地図で場所を見つけて、行ってみたら「今もあります」を押してください。",
    goToMap: "地図で場所を探す",
    inBook: "この場所があなたのスタンプ帳に入りました。",
    openBook: "スタンプ帳を開く",
    collection: "地区ののれんを集める",
  },
  en: {
    title: "Your stamp book",
    intro:
      "Every place you check or share a story about leaves its stamp here. Only you can see this book.",
    empty:
      "Your book has no stamps yet. Find a place on the map, and when you have been there, press Still here.",
    goToMap: "Find a place on the map",
    inBook: "This place is in your stamp book.",
    openBook: "Open your stamp book",
    collection: "Collect the noren of each neighbourhood",
  },
});

export const missionMessages = defineMessages({
  ja: {
    left: "{name}を完成させましょう。あと{n}か所、確かめる人を待っています",
    leftOne: "{name}を完成させましょう。あと{n}か所、確かめる人を待っています",
    done: "{name}のすべての場所を、誰かが確かめました",
    progressLabel: "{name}で確かめられた場所",
    nearby: "近くのまだ確かめられていない場所",
    regionHeading: "地域を完成させましょう",
    regionLeft: "あと{n}か所",
    regionDone: "完成",
    showOnMap: "{name}を地図で見る",
  },
  en: {
    left: "Help finish {name}: {n} places still need someone to check them",
    leftOne: "Help finish {name}: {n} place still needs someone to check it",
    done: "Someone has checked every place in {name}",
    progressLabel: "Places checked in {name}",
    nearby: "Nearby places to check",
    regionHeading: "Help finish a neighbourhood",
    regionLeft: "{n} left",
    regionDone: "Finished",
    showOnMap: "Show {name} on the map",
  },
});

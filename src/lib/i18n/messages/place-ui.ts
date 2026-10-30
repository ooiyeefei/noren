import { defineMessages } from "../index";

// Notice wording requires owner review before sharing the demo (T125).
export const placeUiMessages = defineMessages({
  ja: {
    locate: "現在地を表示",
    locateNote: "Noren は現在地を保存しません。",
    locationOff: "位置情報がオフです。地図はそのまま使えます。",
    zoomIn: "拡大",
    zoomOut: "縮小",
    openPlace: "開く",
    yourLocation: "現在地",

    mapLabel: "場所の地図",
    pickerHint:
      "地図をクリックしてピンを置きます。キーボードでは、矢印キーで地図を動かし、Enterキーで中央にピンを置けます。",
    mapFailed: "地図を読み込めませんでした。場所の一覧をご利用ください。",
    attribution: "地図の出典",
    emptyList: "表示する場所はありません。",
    loadPost: "{platform}の投稿を読み込む",
    cookieLine: "読み込むと{platform}のコンテンツが表示され、Cookieが設定される場合があります。",
    viewOriginal: "元の投稿を見る",
    postedOn: "投稿日：{date}",
    byAuthor: "投稿者（クリエイターの入力）：{author}",
    notice: "このページには外部サービスの投稿があります。選んだ投稿だけを読み込みます。",
    noticeLink: "外部サービスについて",
    loadFailed: "読み込めませんでした。元の投稿へのリンクをご利用ください。",
  },
  en: {
    locate: "Show my location",
    locateNote: "Noren does not save your location.",
    locationOff: "Location is off. You can still browse the map.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    openPlace: "Open",
    yourLocation: "Your location",

    mapLabel: "Map of places",
    pickerHint:
      "Click to place a pin. With a keyboard, use the arrow keys to move the map, then Enter to place the pin at its centre.",
    mapFailed: "The map could not load. You can use the place list.",
    attribution: "Map attribution",
    emptyList: "No places to show.",
    loadPost: "Load this post from {platform}",
    cookieLine: "Loading shows content from {platform}, which may set cookies.",
    viewOriginal: "View the original",
    postedOn: "Posted on {date}",
    byAuthor: "Posted by {author} (as entered by the creator)",
    notice: "This page can show posts from other services. They load only when you choose.",
    noticeLink: "About other services",
    loadFailed: "This post could not load. You can still view the original.",
  },
});

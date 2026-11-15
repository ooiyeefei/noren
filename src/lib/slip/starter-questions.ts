// OWNER: edit these.
//
// The starter questions. A place nobody has left a question at yet gets one of these as the question
// sealed in its slip (the sealed slip, walk mode) and shown on the story form. Each place keeps the
// same one every day: it is picked from the place's id, so adding or removing a question below
// changes which place gets which, once, and nothing else.
//
// How to edit:
//   key    A short word with lowercase letters and digits only. It is stored with stories that answer
//          the question, so NEVER rename or reuse a key once people may have answered it. To retire a
//          question, delete the line (an old answer just stops showing "Answering: ..."); to reword it,
//          change only the en and ja text.
//   en, ja Plain words, one sentence or two, no links, no names of people. English is read by visitors;
//          the Japanese is polite です／ます style. Keep both about the same length.
//   for    "staffed": it asks about a person ("Ask how the place got its name."), so it is only given
//          to a place where someone is likely to be behind a counter: restaurants, cafes, bars, shops,
//          music shops, galleries and stays (see STAFFED_CATEGORIES below).
//          "any": it works anywhere, at a monument, a park or a shrine as well as at a shop. It is
//          given to every place.
//
// Never write a question that asks people to rate, rank or compare (no "best", no stars).

export type StarterQuestion = {
  key: string;
  en: string;
  ja: string;
  for: "staffed" | "any";
};

export const STARTER_QUESTIONS: readonly StarterQuestion[] = [
  // Asked of a person.
  {
    key: "name",
    en: "Ask how this place got its name.",
    ja: "この場所の名前の由来を、聞いてみてください。",
    for: "staffed",
  },
  {
    key: "longest",
    en: "Ask what has been here the longest, and who first brought it in.",
    ja: "ここに一番長くあるものは何か、誰が最初に持ち込んだのかを、聞いてみてください。",
    for: "staffed",
  },
  {
    key: "regulars",
    en: "Ask what the regulars usually come back for.",
    ja: "常連の方が、いつも何を目当てに通っているのかを、聞いてみてください。",
    for: "staffed",
  },
  {
    key: "street",
    en: "Ask what has changed on this street since the place opened.",
    ja: "お店ができてから、この通りで何が変わったのかを、聞いてみてください。",
    for: "staffed",
  },
  // Works anywhere.
  {
    key: "oldest",
    en: "Find the oldest thing you can see here. What is it?",
    ja: "ここで目に入るいちばん古いものを探してみてください。それは何ですか？",
    for: "any",
  },
  {
    key: "sound",
    en: "Stand still for a minute. What do you hear that you would miss somewhere else?",
    ja: "一分だけ立ち止まってみてください。よそでは聞けない音は、何ですか？",
    for: "any",
  },
  {
    key: "before",
    en: "What do you think stood here fifty years ago? Look for a clue.",
    ja: "五十年前、ここには何があったと思いますか？手がかりを探してみてください。",
    for: "any",
  },
  {
    key: "worn",
    en: "Find something worn smooth by hands or feet, like a step, a handle or a stone. Who wore it down?",
    ja: "階段や取っ手、石など、手や足ですり減ったものを探してみてください。誰がすり減らしたのでしょう？",
    for: "any",
  },
];

/**
 * The region's categories (regions/nagasaki.json) where a person is likely to be behind a counter.
 * Any other category, or none, gets only the "any" questions: museum, attraction, bath and other
 * are left out because staff may not be there to ask. Add a category key here to count it.
 */
export const STAFFED_CATEGORIES: readonly string[] = [
  "restaurant",
  "cafe",
  "bar",
  "shop",
  "music_shop",
  "gallery",
  "stay",
];

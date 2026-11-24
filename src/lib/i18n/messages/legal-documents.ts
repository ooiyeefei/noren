import { defineMessages, type Locale } from "../index";

// The terms and the privacy notice (FR-126). The owner approved them on 6 Nov 2026 (T059), with no
// lawyer's read and no second person's review of the Japanese recorded. On 7 Nov they approved the
// changes for sign-in by email and password, no Google, speech input, pictures of a story and Noren's
// own accounts, also with no lawyer's read or review of the Japanese. On 9 Nov they approved the wording
// for sharing on Instagram, which the writer now allows for Noren and the place's verified owner, with
// the same caveats. On 10 Nov they gave a blanket approval for the wording the connector, Plan my day,
// What Noren remembers and walk mode need, again with no lawyer's read or review of the Japanese.
// Both pages answer 404 while documentsVersion is null. Turning speech input or Noren's own accounts
// off makes this notice wrong, so change the words and documentsVersion in the same change.
//
// A section or a line with `when` shows only while that switch is on, and a line with `unless` only
// while it is off, so the notice states what the code uses that day (FR-126) whichever features are
// on. Turning a switch on changes the published notice, so set a new documentsVersion in that change.
//
// Every {placeholder} is filled from regions/<id>.json by src/components/legal/documents.ts, so the
// operator, the contact, the minimum age and the takedown times are never typed here.
//
// The services below were traced from the code at commit 0a0891b and checked again at d8f1df0, when
// kept drafts were added. Check them again with every change of documentsVersion, because the notice
// must match what the code uses on that day (FR-126).

/**
 * What the notice follows from the region file: photos, the three switched features, and whether
 * a writer can let AI read a story (the tick shows while the connector or the planner is on).
 * `malaysia` is on while the region malaysia-west is on, `facts` follows features.facts, and `trip`
 * is on only while features.trip is "open" (a trial member is told on the trip pages instead, T077).
 */
export type NoticeSwitch =
  "photos" | "connector" | "planner" | "walk" | "aiReading" | "malaysia" | "facts" | "trip";

/** A line shown only while a switch is on (`when`) or only while it is off (`unless`). */
export type SwitchedLine = { text: string; when?: NoticeSwitch; unless?: NoticeSwitch };
export type LegalLine = string | SwitchedLine;

export function lineText(line: LegalLine): string {
  return typeof line === "string" ? line : line.text;
}

export function lineShown(line: LegalLine, on: (key: NoticeSwitch) => boolean): boolean {
  if (typeof line === "string") return true;
  return (
    (line.when === undefined || on(line.when)) && (line.unless === undefined || !on(line.unless))
  );
}

export type LegalService = {
  /** The same in every language, so a test can hold the list against the code. */
  name: string;
  country: string;
  does: string;
  /** Said after `does`, each only while its switch is on. */
  more?: readonly SwitchedLine[];
};

export type LegalSection = {
  /** The same in every language, and the heading's anchor. */
  id: string;
  /** Shown only while this switch is on. */
  when?: NoticeSwitch;
  heading: string;
  /** Shown before the list, if there is one. */
  paragraphs?: readonly LegalLine[];
  items?: readonly LegalLine[];
  services?: readonly LegalService[];
  /** Shown after the list. */
  closing?: readonly LegalLine[];
};

export type LegalDocument = {
  title: string;
  lead: string;
  sections: readonly LegalSection[];
};

export const legalMessages = defineMessages({
  ja: {
    version: "版の日付：{version}",
    // The link to the Malay notice, shown on the privacy page only while Malaysia is on.
    malayLink: "マレー語版（Bahasa Melayu）。マレー語を読める方の確認は、まだ済んでいません。",
    // Clerk's sign-up tick, kept with Clerk's link tokens. Clerk fills the links from its Legal settings.
    consentLabel:
      '私は{age}歳以上で、{{termsOfServiceLink || link("利用規約")}}と{{privacyPolicyLink || link("プライバシーポリシー")}}に同意します',
  },
  en: {
    version: "Version: {version}",
    malayLink: "Bahasa Melayu (Malay) version. A Malay speaker has not yet reviewed it.",
    consentLabel:
      'I am {age} or over and agree to the {{ termsOfServiceLink || link("Terms") }} and the {{ privacyPolicyLink || link("Privacy Notice") }}',
  },
});

export const legalDocuments: Readonly<
  Record<Locale, { terms: LegalDocument; privacy: LegalDocument }>
> = {
  ja: {
    terms: {
      title: "利用規約",
      lead: "この規約は、Noren のアカウントを作って使うときに適用されます。読むだけならアカウントは要りません。",
      sections: [
        {
          id: "who",
          heading: "運営者",
          paragraphs: [
            "Noren は、{region}の訪れる価値のある場所と、そこについて人々が語る物語を載せた無料の地図です。運営者：{operator}",
          ],
        },
        {
          id: "joining",
          heading: "参加できる人",
          paragraphs: [
            "アカウントを作れるのは{minimumAge}歳以上の方です。登録のときに、年齢を確認し、この規約とプライバシーポリシーに同意していただきます。",
            "アカウントはご本人につき一つです。上限を避けるために作った追加のアカウントは、閉じることがあります。",
          ],
        },
        {
          id: "name",
          heading: "表示名",
          paragraphs: [
            "共有するものの横に出る名前は、ご自身で決められます。最初に共有する前に、その名前を確認できます。本名でなくてもかまいません。メールアドレスを使ったり、他の人になりすましたりしないでください。",
          ],
        },
        {
          id: "public",
          heading: "共有したものは公開されます",
          paragraphs: [
            "共有した話とリンクは、あなたの名前とともに誰でも読めます。話とリンクは、いつでも削除できます。",
          ],
        },
        {
          id: "rights",
          heading: "あなたの権利と、運営者への許可",
          paragraphs: [
            "あなたが書いたものの権利は、あなたのものです。あなたは運営者に対し、それを保存し、あなたの名前とともに Noren に表示することを許可します。この許可は、あなたか運営担当者が削除するまで続きます。",
            "Noren とこの場所が Instagram で紹介してよいとチェックを入れた話については、Noren と、Noren に確認済みのその場所のオーナーが、本文と表示名を Instagram に投稿することも許可します。取り消す方法は、プライバシーポリシーに書いてあります。",
            {
              when: "aiReading",
              text: "「AI がこの話を私の名前とともに読むことを許可します」にチェックを入れた話については、プライバシーポリシーに書いたとおり、AI がその本文をあなたの名前とともに読むことも許可します。取り消す方法も、プライバシーポリシーに書いてあります。",
            },
            "追加した場所の名前とピンは、地図上の事実として扱います。アカウントを削除した後も、あなたの名前を外して地図に残ります。",
          ],
        },
        {
          id: "rules",
          heading: "共有してはいけないもの",
          paragraphs: [
            "行ったことのある場所について、自分が見たこと、聞いたこと、味わったことを書いてください。次のものは共有できません。",
          ],
          items: [
            "うそだとわかっている内容や、存在しない場所",
            "他の人の個人的な情報（自宅の住所、電話番号、健康のことなど）",
            "子どもを特定できる内容",
            "報酬を受けた宣伝で、そのことを明記していないもの",
            "法律や他の人の権利を侵害するもの（無断で写した文章など）",
            "スパムや、開いた人に害を与えるリンク",
          ],
          closing: [
            "Noren を見守る運営担当者は、このルールに反するものを非表示にできます。違反を繰り返すアカウントは閉じることがあります。",
            {
              when: "malaysia",
              text: "マレーシアの法律があなたに適用される場合、ここで共有するものには、この規約に加えてその法律も適用されます。",
            },
          ],
        },
        {
          id: "new-accounts",
          heading: "新しいアカウント",
          paragraphs: [
            "作成から{newAccountDays}日間は、1日に共有できる数が少なくなります。また、追加した場所は、運営担当者が確認するまで地図に載りません。",
          ],
        },
        {
          id: "collection",
          heading: "のれん、スタンプ、バッジ",
          paragraphs: [
            "のれん、スタンプ、バッジは遊びのためのもので、金銭的な価値はありません。内容が変わったり、終了したりすることがあります。",
          ],
        },
        {
          id: "removal",
          heading: "削除の依頼",
          paragraphs: [
            "アカウントの有無にかかわらず、どなたでも {contact} から削除を依頼できます。{acknowledgeHours}時間以内に受付を確認し、{decideDays}日以内に判断します。プライバシーや未成年者に関する依頼で場所のページを指定すると、運営担当者が確認する間、そのページをすぐに非表示にします。",
          ],
        },
        {
          id: "accuracy",
          heading: "AI と情報の正確さ",
          paragraphs: [
            "Noren の文章には AI が書いたものがあり、「Noren の AI が仕立てました」と表示しています。AI は投稿を読み違えることがあるので、元の投稿もお読みください。オープンデータから載せた場所は、情報が古いことがあります。お出かけの前にご確認ください。",
            {
              when: "facts",
              text: "事実の報告は、ご自身で見たことにしてください。聞いただけのこと、写したこと、推測は報告せず、他の人の代わりに報告もしないでください。",
            },
          ],
        },
        {
          id: "planner",
          when: "planner",
          heading: "一日のプラン",
          paragraphs: [
            "「一日のプラン」は、メンバーが書いた場所から立ち寄り先を無作為に選び、AI がその話から一文を選びます。文を書いたのはメンバーで、場所はその後に変わっているかもしれません。営業時間や決まりは、お出かけの前にご確認ください。保存したルールは場所選びに使いますが、Noren が確かめられるのは一部だけで、どれかは画面に表示します。アレルギーが大事な場合は、その場所にご自身でお尋ねください。",
            // The line below sits in the Plan my day section, so it shows only while both the planner
            // and the trip are on. Put it in "accuracy" if the trip may open without the planner.
            {
              when: "trip",
              text: "プランは、会員が書いた場所から引いた提案です。その場所が開いている、合っている、安全だという約束ではありません。出かける前に確かめ、医療・食事・安全に関わる必要のためにこれだけに頼らないでください。",
            },
          ],
        },
        {
          id: "walk",
          when: "walk",
          heading: "歩きモード",
          paragraphs: [
            "前を見て歩いてください。歩きモードは、顔を上げたまま歩けるように話しかけます。画面を読むときは立ち止まり、車や自転車の運転中は使わないでください。私有地に入らず、神社やお寺の決まりを守ってください。歩きモードが示す場所が閉まっていたり、そこへの道が安全でなかったりすることがあります。",
            "次に訪れる人への問いは、あなたの話の一部です。訪れた人が失礼なく聞ける問いにし、誰の個人情報も書かないでください。問いは、あなた自身、その場所のページを管理する人、または Noren が取り下げることがあります。",
          ],
        },
        {
          id: "connector",
          when: "connector",
          heading: "Noren のコネクタ",
          paragraphs: [
            "コネクタは無料で、内容の変更、制限、終了をすることがあります。AI アシスタントは Noren で読んだ内容から自分で答えを書くので、間違えることがあります。大事なことは、アシスタントが示す Noren のページでご確認ください。",
          ],
        },
        {
          id: "service",
          heading: "サービスの提供について",
          paragraphs: [
            "Noren は無料で、内容の変更、休止、終了をすることがあります。運営者は、情報の正確さや常に使えることを保証しません。法律で認められる範囲で、運営者は Noren の利用から生じた損害の責任を負いません。法律があなたに保障する権利のうち、放棄できないものは、この規約によって失われません。",
          ],
        },
        {
          id: "leaving",
          heading: "アカウントの削除",
          paragraphs: [
            "アカウントのページから、いつでもアカウントを削除できます。何が消え、何が残るかはプライバシーポリシーに書いています。クリエイター、店舗オーナー、運営担当者の方は、インタビューや同意の記録がこれらの役割に結びついているため、運営担当者に依頼してください。",
          ],
        },
        // For the lawyer: the governing law and the courts go here. The owner has not decided them.
        {
          id: "changes",
          heading: "変更と連絡先",
          paragraphs: [
            "この規約を変更すると、冒頭の版の日付も変わります。あなたに大きく関わる変更は、適用の前に Noren でお知らせします。連絡先：{contact}",
          ],
        },
      ],
    },
    privacy: {
      title: "プライバシーポリシー",
      lead: "このポリシーでは、Noren があなたについて何を保存し、ほかに誰が扱い、誰に何が見え、どう削除できるかを説明します。",
      sections: [
        {
          id: "responsible",
          heading: "責任者",
          paragraphs: ["個人情報の扱いの責任者：{operator}　連絡先：{contact}"],
        },
        {
          id: "keeps",
          heading: "Noren が保存するもの",
          items: [
            "ログインの情報：メールアドレスとパスワード。これらと、規約に同意した日時は Clerk が保存します。Noren のデータベースには Clerk の ID だけを保存し、メールアドレスは保存しません。",
            "あなたが決めた表示名と、アカウントの役割。",
            "共有したもの：話、リンクとそれに添えた一文、追加した場所とそのピン。",
            "「今もあります」を押した記録と、場所について送った報告（添えた文章を含む）。",
            "のれん集めの記録：「今ここにいます」を押した場所、その地区と枚目、日本時間の日付。そして、バッジ。",
            "歓迎の動画を閉じたかどうか。",
            "一つのアカウントによる大量の投稿を防ぐ、1日あたりの回数。アカウントの ID と数字だけを保存します。",
            "運営担当者の操作の記録（話の削除など）。",
          ],
        },
        {
          id: "location",
          heading: "位置情報",
          paragraphs: [
            "「今ここにいます」を押すと、端末が現在地を一度だけ読み、場所までの距離を端末の中で計算します。現在地は Noren に送りません。記録に座標や時刻は残りません。",
            "地図を現在地に合わせるボタンで読んだ現在地も、ブラウザの中だけで使います。",
            {
              when: "walk",
              text: "歩きモードは、開いている間、端末で現在地を追い、距離も端末の中で計算します。現在地は Noren に送りません（「歩きモード」をご覧ください）。",
            },
            {
              when: "planner",
              text: "「一日のプラン」の「現在地の近く」は、現在地を一度だけ読み、いちばん近い地区を端末の中で探します。Noren に送るのはその地区だけです。",
            },
          ],
        },
        {
          id: "who-sees",
          heading: "誰に何が見えるか",
          paragraphs: [
            "共有した話とリンクは、あなたの名前とともに誰でも読めます。メールアドレスがページに出ることはありません。",
            "追加した場所は地図に載りますが、ページにあなたの名前は出ません。",
            "のれん、スタンプ、バッジは、Noren 上であなた以外には見えません。一人ひとりの「今ここにいます」の記録を見せる運営担当者向けの画面や書き出しもありません。完成したのれんの画像は、ご自身で共有できます。",
            "Noren を見守る運営担当者には、表示名と役割、報告を送った人の表示名が見えます。",
          ],
        },
        {
          id: "story-pictures",
          heading: "話の画像と Noren の公式アカウント",
          paragraphs: [
            "自分の話ごとに「Instagram でシェアする」を選べます。Noren は、話が Noren で表示されている間に限り、本文、場所の名前、表示名、Noren のウェブアドレスから画像を作り（写真は使いません）、キャプションも書きます。Instagram には何も送りません。キャプションをコピーし、画像を保存して、ご自身で投稿します。",
            "話を書くときに「Noren とこの場所が、私の名前を添えて、この話を Instagram で紹介してもかまいません」にチェックを入れると、Noren の担当者、または Noren に確認済みのその場所のオーナーが、同じ画像とキャプションで、あなたの話（本文と表示名）を自分たちの Instagram アカウントに手で投稿することがあります。Noren が自動で投稿することはありません。チェックはご自身の選択で、入れない限りオフです。チェックを入れたこととその日時を Noren は記録します。いつでもご自身の話から「許可する」「許可をやめる」で変えられます。すでに投稿されたものは、投稿した方が削除するまで残ります。{contact} にご連絡いただければ、Noren が投稿したものは14日以内に削除し、場所のオーナーが投稿したものは削除を依頼します。",
          ],
        },
        {
          id: "services",
          heading: "データを扱うサービス",
          paragraphs: [
            "Noren は次のサービスを使って動いています。多くは日本国外にあるため、あなたのデータは他の国で保存され、処理されます。登録のときのチェックは、このことへの同意を含みます。",
          ],
          services: [
            {
              name: "Clerk",
              country: "米国",
              does: "ログインの情報を保存します。メールアドレス、パスワード、ログイン中の端末の情報（IP アドレスなど）です。ログイン用のコードをメールで送り、不正な登録を確認します。",
            },
            {
              name: "Cloudflare",
              country: "米国",
              does: "登録のときに Clerk が表示することのある、ロボットを防ぐ確認を動かします。IP アドレスとブラウザの情報が伝わります。",
            },
            {
              name: "Convex",
              country: "オーストラリア（シドニー）。運営会社は米国",
              does: "Noren のデータベースです。上の一覧のうち、ログインの情報を除くすべてを保存します。音声認識のために送ることを選んだ録音も、一時的に保存します。",
            },
            {
              name: "Vercel",
              country: "米国。Noren のページの処理は日本の東京で行います",
              does: "Noren のページを届けます。IP アドレスと開いたページが伝わり、Vercel の記録に一定期間残ります。",
            },
            {
              name: "Meta Platforms",
              country: "米国",
              does: "AI です。音声認識に同意した場合、録音を受け取り、文字にします。インタビューの録音も受け取ります。Noren の設定で Anthropic の代わりに使うことがあり、そのときは同じ文章を受け取ります。",
              more: [
                {
                  when: "planner",
                  text: "Noren の設定で「一日のプラン」に使う場合は、プランナーが送る内容（「一日のプランと、Noren が覚えていること」をご覧ください）も受け取ります。",
                },
              ],
            },
            {
              name: "Modal",
              country: "米国",
              does: "オープンウェイトの AI モデルを動かします。Noren の設定で翻訳と AI が書いた物語の確認に使うことがあり、そのときは店主が確認した発言、公開投稿の引用、それらの翻訳を受け取ります。",
            },
            {
              name: "Anthropic",
              country: "米国",
              does: "AI です。自分の投稿から一文の下書きを作るとき（下記）に、その投稿の文章を受け取ります。インタビューの文章と公開投稿の文章も受け取り、翻訳と AI が書いた物語を確かめます。",
              more: [
                {
                  when: "planner",
                  text: "Noren の設定で「一日のプラン」に使う場合は、プランナーが送る内容（「一日のプランと、Noren が覚えていること」をご覧ください）も受け取ります。",
                },
              ],
            },
            {
              name: "OpenAI",
              country: "米国",
              does: "音声の文字起こしです。Noren の設定で Meta Platforms の代わりに使うことがあり、そのときはインタビューの録音と、メンバーが音声認識のために送ることを選んだ録音を受け取ります。",
            },
            {
              name: "OpenStreetMap Foundation",
              country: "英国",
              does: "場所を追加するときに検索した言葉を受け取ります。Noren のサーバーから送るので、あなたを特定する情報は伝わりません。",
            },
            {
              name: "OpenFreeMap",
              country: "ハンガリー",
              does: "地図の画像をあなたのブラウザに直接届けるので、IP アドレスが伝わります。",
            },
          ],
        },
        {
          id: "ai",
          heading: "AI とあなたの言葉",
          paragraphs: [
            {
              unless: "aiReading",
              text: "Noren は、あなたが文字で入力した話、表示名、メールアドレスを AI サービスに送りません。",
            },
            {
              when: "aiReading",
              text: "Noren は、メールアドレスを AI サービスに送りません。文字で入力した話を表示名とともに送るのは、その話について許可した場合だけです（「AI が話を読むこと」をご覧ください）。",
            },
            "『体験を話す』を選び、音声認識に同意すると、Noren は録音をオーストラリアのシドニーにある Convex に一時的にアップロードし、米国の Meta Platforms に送って文字にします。自分の声だけを録音し、他の人の個人情報を話さないでください。",
            "文字にした内容は、確認して直せるように入力欄に戻ります。文字起こしの間、Noren は文章をサーバーに保存しません。共有前の文章は、ブラウザーに下書きとして保存されます。『共有』を押したときだけ、話として保存され、名前とともに公開されます。",
            "文字が戻ると、音声認識が成功しても失敗しても、Noren は保管した音声をすぐに削除します。その前にページを離れた場合は、1 時間ほどで削除します。Meta Platforms はこの録音をモデルの学習に使いません。安全確認などのために、Meta の規約が認める期間保存することがあります。",
            "自分の投稿だと示して下書きを頼むと、Noren はそのページから題名と文章を読み、場所の名前とともに米国の Anthropic に送ります。下書きはあなたに返され、「共有」を押すまで何も保存しません。Anthropic はこの文章をモデルの学習に使いません。",
            "インタビューは別の扱いです。店主には先に専用の同意書で同意していただき、そこで録音と文章を扱うサービスを示します。",
          ],
        },
        {
          id: "ai-reading",
          when: "aiReading",
          heading: "AI が話を読むこと",
          paragraphs: [
            "話を書くときに、「AI がこの話を私の名前とともに読むことを許可します」にチェックを入れられます。チェックを入れない限りオフです。チェックを入れたこととその日時を Noren は記録します。いつでもご自身の話から「許可する」「許可をやめる」で変えられます。",
            {
              when: "planner",
              text: "チェックを入れると、ほかのメンバーの散策のために AI が一文を選べるよう、「一日のプラン」が話の本文と表示名を、プランナーに使う AI サービスに送ることがあります。選ばれた文は、書かれたとおりに、あなたの名前とともに表示します。",
            },
            {
              when: "connector",
              text: "チェックを入れると、Claude や ChatGPT など、Noren につないだ AI アシスタントが、Noren のコネクタを通じて話の本文と表示名を読めます。読んだ内容は各アシスタントの会社が持ち、その会社の規約に従って使います。アシスタントがすでに読んだ内容を、Noren が削除することはできません。",
            },
            "許可をやめると、その時点から Noren はその話を送りません。チェックがなければ、Noren はあなたの話を AI に送らず、Noren のページには引き続きあなたの名前とともに表示します。",
          ],
        },
        {
          id: "planner",
          when: "planner",
          heading: "一日のプランと、Noren が覚えていること",
          paragraphs: [
            "「一日のプラン」は、ログインしているメンバーが使えます。質問すると、端末から Noren に、あなたのメッセージ、直前のいくつかのやりとり、出発する場所、今日の行き先、Noren が覚えているルールと好み、ページの言語が送られます。",
            "Noren は、メンバーが書いた場所から、好みに寄せ、確かめられるルールは守って、立ち寄り先を無作為に選びます。そして、あなたのメッセージ、直前のやりとり、今日の行き先、選んだ場所を、プランナーに使う AI サービス（上の一覧の Meta Platforms または Anthropic）に送ります。AI は、立ち寄り先ごとに表示する話の一文を選びます。",
            "保存したルールと好みは、その回答の場所を選ぶためだけに Noren のサーバーで使います。保存はせず、AI にも送りません。ただし、メッセージに入力したり話したりしたアレルギーや食事などは、メッセージとともに AI に届きます。",
            "Noren は、やりとりも回答も保存しません。上限を守るため、アカウントごとの質問の回数を数えます。また、各場所が週に何回選ばれたかを、誰のためかを含めずに数え、8週間で削除します。",
            "文字の代わりに話す場合、音声認識は「AI とあなたの言葉」に書いたとおりに動きます。",
            "「Noren が覚えていること」は、ルール、好み、今日の行き先を、この端末のブラウザに保存します。Noren のサーバーには保存しません。アレルギーは健康に関する情報であり、ハラールのような食事は信仰を示すことがあるため、日本の個人情報保護法では「要配慮個人情報」にあたる場合があります。追加するかどうかはご自身で決めてください。いつでも一つずつ消したり、「すべて忘れる」を押したりできます。ブラウザでこのサイトのデータを消しても削除されます。",
            "「一日のプラン」が使える間は、Noren で場所を開いたり保存したりすると、ログインしていなくても、この端末の好みに加わります。ご自身で伝えていない好みは、数週間で薄れていきます。今日の行き先は、残す操作をしない限り、日本時間の午前0時に消えます。",
          ],
        },
        {
          id: "walk",
          when: "walk",
          heading: "歩きモード",
          paragraphs: [
            "歩きモードは、開いている間、近くの場所とその方向を知らせるために、端末で現在地を追います。距離は端末の中で計算します。現在地は Noren に送らず、保存もしません。",
            "端末は、Noren から公開されている場所の一覧を一度だけ読み込み、「今日のおみくじ」を開くとそれも読み込みます。おみくじはその日、誰にとっても同じです。どちらにも現在地は含まれません。",
            "歩きモードは端末に入っている音声で話すので、話す内容は端末の外に出ません。",
            "今日のおみくじには問いが入っていて、その場所に着くまで封がしてあります。距離は端末が確かめ、封も端末が開けます。あなたがどこにいるかも、封が開いたことも、Noren には送られません。",
            "引いたおみくじは、この端末のこのブラウザーに、最大 7 枚まで保存されます。Noren のサーバーには保存されません。「しまった一枚を消す」を押すか、ブラウザーでこのサイトのデータを消去すると削除されます。",
            "話を書くとき、次に訪れる人への問いを残すことができます。問いは、あなたの話と名前とともに公開され、その場所の今日のおみくじの中にも表示されます。Noren は問いを翻訳せず、AI サービスにも送りません。問いはいつでも取り下げられます。",
          ],
        },
        {
          id: "connector",
          when: "connector",
          heading: "AI アシスタント向けの Noren のコネクタ",
          paragraphs: [
            "Claude や ChatGPT などの AI アシスタントは、誰でも Noren のコネクタにつなげます。つなぐと、アシスタントは Noren の場所とコレクションを検索し、ログインしていない人に Noren で見えるとおりに場所の情報を読み、散策ルートやおみくじを Noren に選ばせることができます。",
            "メンバーの話が本文と書いた人の名前とともにアシスタントに届くのは、書いた人が「AI がこの話を私の名前とともに読むことを許可します」にチェックを入れた場合だけです。それ以外は、その場所にいくつ話があり、Noren のどこで読めるかだけが伝わります。共有したリンクにメンバーが添えた一文は、アシスタントに届きません。",
            "コネクタはログインなしで使えるので、Noren には誰が尋ねているかわからず、質問の記録も残しません。残すのは、使われる回数を制限するための回数と、各場所が週に何回選ばれたかの回数だけで、後者は8週間で削除します。",
            "アシスタントが読んだ内容は、その会社が持ち、その会社の規約とプライバシーポリシーに従って扱います。",
          ],
        },
        // The three parts below are the draft in specs/005-trip-agent/notice-draft.md. Each shows only
        // while its switch is on, and the wording is the owner's to settle (T018). Turning any of them
        // on changes the published notice, so set a new documentsVersion in that change (R17).
        {
          id: "facts",
          when: "facts",
          heading: "場所についての事実の報告",
          items: [
            "会員は、段差のない入口や礼拝室など、その場所で見つけたことを報告できます。報告には会員の表示名と報告した日が表示されます。",
            "報告は会員が自分で見たことについての説明です。Noren はその人の言葉として表示し、評価や集計には使いません。",
            "表示名をまだ確認していない会員には、報告とともに表示名と日付を表示することへの同意を、報告の前に求めます。",
            "報告を取り消すと、その場所のページでは誰にも表示されなくなり、アカウントを削除するまで取り消し済みとして保管されます。",
            "監査記録には報告を投稿したことが残りますが、アカウントを削除すると名前は残りません。",
          ],
        },
        {
          id: "trip",
          when: "trip",
          heading: "プランと旅行",
          items: [
            "同行者の説明や旅行の情報、入力した名前や呼び名、受け取ったプランは、この端末のブラウザに保存されます。",
            "プランを作るか更新するとき、ブラウザは道順、日数、入力した日付やピン、年齢層、必要な配慮や好みなどを、オーストラリアにある Noren のサーバーに送ります。同行者の情報には識別用のキーを使い、名前や呼び名は送りません。Noren はこの情報で場所を選び、プランを返します。依頼の内容や結果のプランをデータベースには保存しません。",
            "「書いたことを読んでもらう」を押すと、Noren は提案を出すために、入力した言葉と言語を、変更時には日、枠、場所名、項目の種類を含む概要も、設定されたプラン作成用の AI に送ります。送り先はサービス一覧にある米国の Meta Platforms または Anthropic です。別の質問で入力した同行者の説明は送りません。この欄に書いた名前や必要な配慮は AI に届く場合があります。Noren の録音機能で音声を送るときは、「AI とあなたの言葉」にある音声認識への別の同意が必要です。",
            "食事や移動の配慮から、宗教上の信条や健康状態が分かることがあります。プランの作成・変更や AI への送信ボタンのそばに、送る内容と送り先を表示し、ボタンを押して同意するようお願いします。Noren は同意した日と同意文の版を記録し、アカウントを削除するとその記録も削除します。",
            "プランに必要なことだけを入力してください。同行者の個人情報を送る前に、本人の同意を得てください。18 歳未満の場合は、親、後見人、または親としての責任を負う方の同意を得てください。",
            "共有リンクを作ると、Noren はリンクのコード、アカウントの識別子、端末上の旅行の識別子と地域、共有する題名と旅程を保存します。旅程には日付、道順、立ち寄り先、ピンや誰の番かを示す呼び名、誰のためかは表示しない確認項目が含まれる場合があります。リンクを知っている人は誰でも見られます。リンクをオフにするかアカウントを削除すると、リンクの記録を削除します。リンクに自動で切れる期限はありません。",
            "不正利用を防ぐため、Noren はアカウントごとに、プランと AI への依頼を 1 分と 24 時間の枠で、共有リンクの作成・更新を 24 時間の枠で数えます。枠が終わった後の次の依頼で数え直し、アカウントを削除すると回数の記録も削除します。",
          ],
        },
        {
          id: "malaysia",
          when: "malaysia",
          heading: "マレーシアでの Noren",
          items: [
            "この項は、旅行プランを含む {region} のマレーシア向けサービスで Noren が取り扱う個人データに適用されます。",
            "Noren は、2024年個人データ保護改正法による改正後のマレーシアの2010年個人データ保護法が、マレーシア向けサービスに適用されるものとして従います。",
            "個人データの責任者は {operator} です。Noren はオーストラリアのシドニーにある Convex を使って、アカウントや投稿のデータを保存し、プランの依頼を処理します。任意の AI や音声機能では、国外のサービスにデータが送られることがあります。送り先と目的は、サービス一覧と「プランと旅行」をご覧ください。",
            "個人データを国外へ送るのは、同法第129条で認められる場合です。同意を根拠とするときは、別途同意を求めます。個人データの漏えいなどが起きた場合は、法律に従い、マレーシアの個人データ保護コミッショナーと影響を受けた方に必要な通知を行います。",
            "ご依頼は Noren のプライバシー窓口（{operator}）まで、{contact} からお寄せください。",
            "開示、訂正、利用の制限、同意の撤回を求められます。技術的に可能で形式に互換性がある場合は、Noren が持つご自身の個人データを指定した別の管理者に直接送るよう、電子的な書面でも依頼できます。",
            "英語版とマレー語版の内容が異なる場合は、英語版が優先されます。マレーシアの法律で認められた権利は引き続き適用されます。",
          ],
        },
        // Shown only while photos are on. Turning them on changes this notice, so set a new
        // documentsVersion in the same change.
        {
          id: "photos",
          when: "photos",
          heading: "追加した写真",
          paragraphs: [
            "話に添えた写真は、あなたの名前とともに公開されます。写真は日本の東京にある Amazon Web Services に保存し、Amazon CloudFront を通じて届けます。Noren は写真から位置情報を取り除きます。アカウントを削除すると、写真も削除します。",
          ],
        },
        {
          id: "browser",
          heading: "ブラウザが読み込むもの",
          paragraphs: [
            "Noren は Clerk のログイン用の Cookie を使います。広告や利用状況の分析のための Cookie は使いません。ブラウザは、地図の案内を閉じたことも覚えています。",
            "書きかけの文章と選んだ写真は、ページが読み込み直されても消えないよう、あなたの端末のブラウザに保存します。共有するか消すと削除され、ログアウトしたときや 1 週間たったときにも削除されます。ログインしていないときは、そのタブを閉じるまでです。この保存は端末の外に出ません。",
            "地図の画像は OpenFreeMap から、ピンを置く地図の航空写真は日本の国土地理院から、ブラウザが直接読み込みます。",
            "次のサービスの投稿は、その投稿の読み込みボタンを押すまで読み込まれません：{platforms}。押すと、そのサービスが Cookie を設定し、あなたの訪問を知ることがあります。",
            "リンクを貼ると、プレビューのために Noren のサーバーがそのページを開きます。相手のサイトに見えるのは Noren のサーバーで、あなたではありません。",
            {
              when: "planner",
              text: "「一日のプラン」が使える間は、Noren が覚えていることも、端末のブラウザに保存します（「一日のプランと、Noren が覚えていること」をご覧ください）。",
            },
          ],
        },
        {
          id: "deletion",
          heading: "アカウントを削除すると",
          paragraphs: [
            "アカウントのページから削除できます。クリエイター、店舗オーナー、運営担当者の方は、インタビューや同意の記録がこれらの役割に結びついているため、運営担当者に依頼してください。",
            "削除するもの：",
          ],
          items: [
            "「今ここにいます」の記録、のれん、バッジ、スタンプ",
            "書いた話",
            "「今もあります」の記録と、送った報告",
            "書いた訪問者メモとその翻訳",
            "Clerk にあるログインの情報",
            "表示名とログインとのつながり。アカウントの行は「Former member」という名前の空の行になり、あなたと結びつくものはなくなります。",
          ],
          closing: [
            "非表示にするもの：共有したリンクは、すべてのページから消えます。リンクの記録と添えた一文は、非表示のままデータベースに残ります。",
            "残るもの：追加した場所とそのピン、名前は、場所についての事実として残り、あなたの名前は出ません。運営担当者の操作の記録は残りますが、空の行を指すので、あなたを特定しません。1日あたりの回数の記録も残りますが、アカウントの ID しか持ちません。",
            "Noren の公式 SNS アカウントにすでに投稿したものは、Noren が削除するまで残ります。{contact} にご連絡いただければ、14 日以内に削除します。",
            {
              when: "planner",
              text: "「Noren が覚えていること」は、「すべて忘れる」を押すか、ブラウザでこのサイトのデータを消すまで、端末に残ります。",
            },
            "もう一度ログインしても、何も戻りません。",
          ],
        },
        {
          id: "how-long",
          heading: "保存する期間",
          paragraphs: [
            "アカウントと共有したものは、あなたか運営担当者が削除するまで、またはアカウントを削除するまで保存します。",
            "削除の依頼に書いた連絡先は、依頼を閉じるときに消します。Vercel と Clerk の記録は、それぞれのサービスが定める期間残ります。",
            "不具合の報告には、あなたが書いた内容、そのとき見ていたページ、ブラウザの名前と画面の大きさが保存されます。アカウントとは結び付けません。連絡先を書いた場合は、報告の対応が終わった時点で消去します。連絡先を除いた写しを、Noren の担当者だけが読める GitHub の非公開リポジトリに保存し、GitHub が担当者にメールで知らせます。",
            "音声認識のために送った録音は、「AI とあなたの言葉」に書いたとおり削除します。Noren の公式 SNS アカウントの投稿は、Noren が削除するまで残ります。",
          ],
        },
        {
          id: "public-posts",
          heading: "Noren が見つけた公開投稿",
          paragraphs: [
            "Noren は、場所について書かれた公開投稿を探し、Anthropic の AI で読みます。短い引用と投稿者の公開名を表示し、元の投稿へリンクします。AI が書いた物語には「Noren の AI が仕立てました」と表示します。あなたの投稿が載っていたら、アカウントがなくても {contact} から削除を依頼できます。",
            {
              when: "connector",
              text: "Noren につないだ AI アシスタントも、同じ引用、名前、リンクを読めます。",
            },
          ],
        },
        {
          id: "age",
          heading: "{minimumAge}歳未満の方",
          paragraphs: [
            "Noren のアカウントは{minimumAge}歳以上の方のものです。{minimumAge}歳未満の方のアカウントだと思われる場合は、{contact} からお知らせください。そのアカウントを削除します。",
          ],
        },
        {
          id: "choices",
          heading: "あなたにできること",
          paragraphs: [
            "表示名の変更、話とリンクの削除、アカウントの削除は、ご自身でできます。データの写しや訂正、利用の停止を求めるときは、{contact} からご連絡ください。",
            "Noren はあなたのデータを販売せず、広告も表示しません。",
          ],
        },
        {
          id: "changes",
          heading: "変更",
          paragraphs: [
            "このポリシーを変更すると、冒頭の版の日付も変わります。新しいサービスがあなたのデータを扱う前に、ここにそのサービスを記載します。",
          ],
        },
      ],
    },
  },
  en: {
    terms: {
      title: "Terms",
      lead: "These terms apply when you make a Noren account and use it. Reading Noren needs no account.",
      sections: [
        {
          id: "who",
          heading: "Who runs Noren",
          paragraphs: [
            "Noren is a free map of places worth visiting in {region}, with the stories people tell about them. Operator: {operator}",
          ],
        },
        {
          id: "joining",
          heading: "Who can join",
          paragraphs: [
            "You must be {minimumAge} or over to make an account. When you sign up, you confirm your age and accept these terms and the privacy notice.",
            "Make one account for yourself. An extra account made to get past a limit may be closed.",
          ],
        },
        {
          id: "name",
          heading: "Your name",
          paragraphs: [
            "You choose the name shown beside what you share, and you see it before your first share. It need not be your real name. Don't use an email address or pretend to be someone else.",
          ],
        },
        {
          id: "public",
          heading: "What you share is public",
          paragraphs: [
            "Anyone can read the stories and links you share, with your name beside them. You can remove a story or a link at any time.",
          ],
        },
        {
          id: "rights",
          heading: "What stays yours and what you allow",
          paragraphs: [
            "What you write stays yours. You allow the operator to store it and show it on Noren with your name, until you or a steward removes it.",
            "If you tick that Noren and this place may share a story on Instagram, you also allow Noren, and the verified owner of the place, to post its words and your name on Instagram. The privacy notice says how to take this back.",
            {
              when: "aiReading",
              text: "If you tick “Let AI read this story, with my name”, you also allow Noren to let AI read its words with your name, as the privacy notice describes. The notice also says how to take this back.",
            },
            "A place you add, with its name and pin, is a fact on the map. It stays on the map after you delete your account, without your name.",
          ],
        },
        {
          id: "rules",
          heading: "What you may not share",
          paragraphs: [
            "Write about places you have been to, and about what you saw, heard or tasted there. You may not share:",
          ],
          items: [
            "anything you know is false, or a place that does not exist",
            "another person's private details, such as a home address, a phone number or their health",
            "anything that could identify a child",
            "advertising you were paid for, unless you say so",
            "anything that breaks the law or another person's rights, such as text copied without permission",
            "spam, or a link that harms the person who opens it",
          ],
          closing: [
            "Stewards, the people who look after Noren, can hide what breaks these rules. An account that keeps breaking them may be closed.",
            {
              when: "malaysia",
              text: "Where Malaysian law applies to you, it applies to what you share here in addition to the rest of these terms.",
            },
          ],
        },
        {
          id: "new-accounts",
          heading: "New accounts",
          paragraphs: [
            "For its first {newAccountDays} days, an account has lower daily limits, and a place it adds waits for a steward before it goes on the map.",
          ],
        },
        {
          id: "collection",
          heading: "Panels, stamps and badges",
          paragraphs: [
            "Panels, stamps and badges are for fun and have no money value. They can change or end.",
          ],
        },
        {
          id: "removal",
          heading: "Asking to remove something",
          paragraphs: [
            "Anyone, with or without an account, can ask for something to be removed at {contact}. Each request is acknowledged within {acknowledgeHours} hours and decided within {decideDays} days. A request about privacy or a minor that names a place's page hides that page at once while a steward reviews it.",
          ],
        },
        {
          id: "accuracy",
          heading: "AI and accuracy",
          paragraphs: [
            "Some text on Noren is written by AI and marked “Stitched by Noren's AI”. AI can misread what people wrote, so go and read the original posts. A place from open data can be out of date. Check before you travel.",
            {
              when: "facts",
              text: "A report of a fact must be what you saw yourself. Do not report what you only heard, copied or guessed, and do not report for someone else.",
            },
          ],
        },
        {
          id: "planner",
          when: "planner",
          heading: "Plan my day",
          paragraphs: [
            "Plan my day picks stops at random from places members have written about, and its AI chooses lines from their stories. Members wrote those lines, and a place may have changed since, so check opening times and rules before you go. Your saved rules help choose places, but Noren can check only some of them, and the page says which. If an allergy matters, ask the place yourself.",
            {
              when: "trip",
              text: "A plan is a suggestion drawn from places members have written about. It is not a promise that a place is open, suitable or safe. Check before you go, and do not rely on it for a medical, dietary or safety need.",
            },
          ],
        },
        {
          id: "walk",
          when: "walk",
          heading: "Walk mode",
          paragraphs: [
            "Look where you are going. Walk mode speaks so you can keep your eyes up. Stop before you read the screen, and do not use it while driving or cycling. Keep off private land, and follow the rules of shrines and temples. A place walk mode points to may be closed, and the way to it may not be safe.",
            "A question you leave for the next visitor is part of your story. Write one a visitor could politely ask, with no one's personal details. You, the people who look after the place's page, or Noren may remove it.",
          ],
        },
        {
          id: "connector",
          when: "connector",
          heading: "Noren's connector",
          paragraphs: [
            "The connector is free, and it can change, be limited or stop. An AI assistant writes its own answers from what it reads on Noren and can get them wrong. Check what matters on the Noren page it links to.",
          ],
        },
        {
          id: "service",
          heading: "Noren as it is",
          paragraphs: [
            "Noren is free, and it can change, pause or close. The operator does not promise that it is accurate or always available. As far as the law allows, the operator is not liable for loss from using Noren. Nothing here takes away a right the law gives you that cannot be given up.",
          ],
        },
        {
          id: "leaving",
          heading: "Deleting your account",
          paragraphs: [
            "You can delete your account at any time on your account page. The privacy notice says what goes and what stays. A creator, shop owner or steward asks a steward instead, because interviews and consent records depend on those roles.",
          ],
        },
        // For the lawyer: the governing law and the courts go here. The owner has not decided them.
        {
          id: "changes",
          heading: "Changes and contact",
          paragraphs: [
            "If these terms change, the version date at the top changes too. A change that matters to you is announced on Noren before it applies. Contact: {contact}",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy Notice",
      lead: "This notice says what Noren keeps about you, who else handles it, who can see what, and how to remove it.",
      sections: [
        {
          id: "responsible",
          heading: "Who is responsible",
          paragraphs: ["Responsible for your data: {operator}. Contact: {contact}"],
        },
        {
          id: "keeps",
          heading: "What Noren keeps",
          items: [
            "Your sign-in: your email address and password. Clerk holds these, and the time you accepted the documents. Noren's own database holds only an ID from Clerk and never your email address.",
            "The name you choose, and your account's role.",
            "What you share: stories, links with the line you write about them, and places you add with their pins.",
            "Your “Still here” presses, and any report you send about a place with its note.",
            "Your collection: where you pressed “I'm here”, its set and panel, and the date in Japan. Also your badges.",
            "Whether you have closed the welcome film.",
            "Daily counts that stop one account flooding the map. They hold only your account's ID and a number.",
            "A record of what stewards do, such as removing a story.",
          ],
        },
        {
          id: "location",
          heading: "Your location",
          paragraphs: [
            "When you press “I'm here”, your phone reads its location once and works out the distance itself. Your location is not sent to Noren. The record holds no coordinates and no time of day.",
            "The button that moves the map to where you are reads your location for your browser's use alone.",
            {
              when: "walk",
              text: "Walk mode follows your location on your phone while it is open, and works out distances there too. It sends no location to Noren (see “Walk mode”).",
            },
            {
              when: "planner",
              text: "“Nearest to me” in Plan my day reads your location once and finds the nearest neighbourhood on your phone. Only that neighbourhood goes to Noren.",
            },
          ],
        },
        {
          id: "who-sees",
          heading: "Who can see what",
          paragraphs: [
            "Anyone can read the stories and links you share, with your name beside them. Your email address never appears on a page.",
            "A place you add shows on the map, and its page does not show your name.",
            "Nobody else on Noren can see your panels, stamps and badges. No steward screen or export shows one person's check-ins. You can share a finished picture yourself.",
            "Stewards, the people who look after Noren, can see names and roles, and the name on a report.",
          ],
        },
        {
          id: "story-pictures",
          heading: "Pictures of your story and Noren's own accounts",
          paragraphs: [
            "On each of your own stories you can choose “Share on Instagram”. Noren draws a picture from the words, the place name, your display name and our web address, never your photos, only while the story is shown on Noren, and writes a caption for it. Nothing is sent to Instagram: you copy the caption and save the picture, and post it yourself.",
            "If you tick “Noren and this place may share my story on Instagram, with my name” when you write a story, a person at Noren, or the place's verified owner on Noren, may post your story (its words and your display name) on their own Instagram account, using the same picture and caption. They post it by hand; Noren never posts by itself. Ticking is your choice and is off unless you tick it. Noren records that you ticked it and when. You can change it at any time from your own story: choose “Allow this” or “Stop allowing”. A post already made stays up until whoever made it takes it down. Ask us at {contact} and we will delete the ones Noren made within 14 days, and ask the place to remove theirs.",
          ],
        },
        {
          id: "services",
          heading: "Services that handle your data",
          paragraphs: [
            "Noren runs on the services below. Most are outside Japan, so your data is stored and used in other countries. The tick at sign-up includes your agreement to this.",
          ],
          services: [
            {
              name: "Clerk",
              country: "United States",
              does: "Holds your sign-in: your email address, your password and details of the devices you sign in on, including IP address. Sends sign-in codes by email and checks sign-ups for abuse.",
            },
            {
              name: "Cloudflare",
              country: "United States",
              does: "Runs the bot check Clerk can show during sign-up. It sees your IP address and browser details.",
            },
            {
              name: "Convex",
              country: "Australia (Sydney), run by a United States company",
              does: "Noren's database. It holds everything in the list above apart from your sign-in details. It also temporarily stores recordings you choose to send for speech recognition.",
            },
            {
              name: "Vercel",
              country: "United States, with Noren's pages running in Tokyo, Japan",
              does: "Delivers Noren's pages. It sees your IP address and the pages you open, and keeps them in its logs for a time.",
            },
            {
              name: "Meta Platforms",
              country: "United States",
              does: "An AI service. If you agree to speech recognition, it receives your voice recording and turns it into words. It also receives interview recordings. A Noren setting can use it in place of Anthropic, and it then receives the same words.",
              more: [
                {
                  when: "planner",
                  text: "If Noren's settings use it for Plan my day, it also receives what the planner sends (see “Plan my day and What Noren remembers”).",
                },
              ],
            },
            {
              name: "Modal",
              country: "United States",
              does: "Runs an open-weight AI model. A Noren setting can use it to check translations and AI-written stories, and it then receives statements an owner has confirmed, quotes from public posts and their translations.",
            },
            {
              name: "Anthropic",
              country: "United States",
              does: "An AI service. It receives your post's words when you ask for a draft from your own post (see below). It also receives interview transcripts and the words of public posts, and it checks translations and AI-written stories.",
              more: [
                {
                  when: "planner",
                  text: "If Noren's settings use it for Plan my day, it also receives what the planner sends (see “Plan my day and What Noren remembers”).",
                },
              ],
            },
            {
              name: "OpenAI",
              country: "United States",
              does: "Transcribes speech. A Noren setting can use it in place of Meta Platforms, and it then receives interview recordings and recordings members choose to send for speech recognition.",
            },
            {
              name: "OpenStreetMap Foundation",
              country: "United Kingdom",
              does: "Receives the words you type when you search for a place to add. Noren's server sends them, with nothing that identifies you.",
            },
            {
              name: "OpenFreeMap",
              country: "Hungary",
              does: "Sends map images straight to your browser, so it sees your IP address.",
            },
          ],
        },
        {
          id: "ai",
          heading: "AI and your words",
          paragraphs: [
            {
              unless: "aiReading",
              text: "Noren does not send stories you type, your display name or your email address to an AI service.",
            },
            {
              when: "aiReading",
              text: "Noren does not send your email address to an AI service. It sends a story you typed, with your display name, only if you allow it for that story (see “AI that reads stories”).",
            },
            "If you choose Speak your story and agree to speech recognition, Noren temporarily uploads your recording to Convex in Sydney, Australia, and sends it to Meta Platforms in the United States to turn it into words. Record only your own voice and avoid saying other people's personal information.",
            "The words return to your story box for you to check and edit. Noren does not save a transcript on its server during transcription. Your unsent words are kept in your browser as a draft. They are saved as a story and shown publicly with your name only when you press Share.",
            "Noren deletes its copy of the audio as soon as the words come back, whether speech recognition worked or not. If you leave the page before that, Noren deletes it within about an hour. Meta Platforms does not use the recording to train its models, and may keep it for as long as its own terms allow, for example for safety checks.",
            "If you tick that a post is your own and ask for a draft, Noren reads the post's title and words from its page and sends them, with the place's name, to Anthropic in the United States. The draft comes back to you, and nothing is kept until you press Share. Anthropic does not use these words to train its models.",
            "An interview works differently. A shop owner first agrees to a separate consent form, which names the services that handle the recording and the transcript.",
          ],
        },
        {
          id: "ai-reading",
          when: "aiReading",
          heading: "AI that reads stories",
          paragraphs: [
            "When you write a story, you can tick “Let AI read this story, with my name”. It is off unless you tick it. Noren records that you ticked it and when. You can change it at any time from your own story: choose “Allow this” or “Stop allowing”.",
            {
              when: "planner",
              text: "With the tick, Plan my day may send the story's words and your display name to the AI service it uses, so the AI can choose lines from it for another member's walk. The lines appear word for word, with your name.",
            },
            {
              when: "connector",
              text: "With the tick, AI assistants that people connect to Noren, such as Claude or ChatGPT, can read the story's words and your display name through Noren's connector. The company behind each assistant then holds what it read and uses it under its own terms. Noren cannot delete what an assistant has already read.",
            },
            "If you stop allowing it, Noren stops sending the story from then on. Without the tick, Noren does not send your story to AI, and its pages still show it with your name.",
          ],
        },
        {
          id: "planner",
          when: "planner",
          heading: "Plan my day and What Noren remembers",
          paragraphs: [
            "Plan my day is for members who are signed in. When you ask it something, your device sends Noren your message, the last few messages, where you want to start, today's trip, the rules and likes Noren remembers for you, and the page's language.",
            "Noren picks stops at random from places members have written about, leaning towards your likes and keeping to the rules it can check. It then sends your message, the last few messages, today's trip and the places it picked to the AI service Noren uses for the planner (Meta Platforms or Anthropic, listed above). The AI chooses lines from stories to show under each stop.",
            "Your saved rules and likes are used on Noren's server only to pick places for that answer. Noren does not keep them and does not send them to the AI. An allergy, a diet or anything else you type or say in your message does go to the AI with it.",
            "Noren keeps no copy of the conversation or the answer. It counts the questions each account asks, to keep within a limit. It also counts how often each place is picked each week, with nothing about who it was for, and deletes those counts after 8 weeks.",
            "If you speak instead of typing, speech recognition works as described under “AI and your words”.",
            "What Noren remembers keeps your rules, your likes and today's trip in this browser, on this device. Noren's server does not store them. An allergy is health information, and a diet such as halal can show a religious belief, so Japan's privacy law can treat them as special care-required personal information. Add them only if you want to. You can remove any of them, or press “Forget everything”, at any time. Clearing this site's data in your browser removes them too.",
            "While Plan my day is on, opening and saving places on Noren adds to your likes on this device, even when you are not signed in. Likes you did not tell Noren yourself fade over a few weeks. Today's trip clears at midnight Japan time unless you keep it.",
          ],
        },
        {
          id: "walk",
          when: "walk",
          heading: "Walk mode",
          paragraphs: [
            "Walk mode follows your location on your phone while it is open, to tell you which places are near and which way they are. Your phone works out the distances. Your location is not sent to Noren and is not kept.",
            "Your phone loads Noren's public list of places once, and today's omikuji when you open it. The omikuji is the same for everyone that day. Neither request includes your location.",
            "Walk mode speaks with a voice built into your phone, so what it says stays on your phone.",
            "Today's omikuji carries a question that stays sealed until you are at the place. Your phone checks the distance and opens the seal itself. Noren is not told where you are or that a seal opened.",
            "The slips you draw are kept in this browser, on this device, seven at most. Noren's server does not store them. “Clear kept slips” removes them, and so does clearing this site's data in your browser.",
            "When you write a story you can leave a question for the next visitor. It is shown publicly with your story and your name, and inside the day's omikuji for that place. Noren does not translate it and does not send it to an AI service. You can remove it at any time.",
          ],
        },
        {
          id: "connector",
          when: "connector",
          heading: "Noren's connector for AI assistants",
          paragraphs: [
            "Anyone can connect an AI assistant, such as Claude or ChatGPT, to Noren's connector. The assistant can then search Noren's places and collections, read a place as someone who is not signed in sees it on Noren, and ask Noren to pick a walk or an omikuji.",
            "A member's story reaches the assistant, with its words and the writer's name, only if the writer ticked “Let AI read this story, with my name”. Otherwise the assistant learns only how many stories a place has and where to read them on Noren. Notes members add to links they share do not reach assistants.",
            "The connector needs no sign-in, so Noren does not know who is asking, and it keeps no record of the questions. It keeps counts that limit how often the connector is used, and counts of how often each place is picked each week, which it deletes after 8 weeks.",
            "What an assistant reads is then held by the company behind it, under that company's own terms and privacy notice.",
          ],
        },
        // The three parts below are the draft in specs/005-trip-agent/notice-draft.md. Each shows only
        // while its switch is on, and the wording is the owner's to settle (T018). Turning any of them
        // on changes the published notice, so set a new documentsVersion in that change (R17).
        {
          id: "facts",
          when: "facts",
          heading: "Reports of a place's facts",
          items: [
            "A member can report what they found at a place, such as a step-free entrance or a prayer room. The report shows their display name and the day they made it.",
            "A report is the member's own account of what they saw. Noren displays it as their statement and does not use it as a rating or a count.",
            "Before a member whose display name is still unconfirmed can report, Noren asks them to agree to showing their name and the day with the report.",
            "When you remove your report, Noren hides it from everyone on the place page and keeps it marked as removed until you delete your account.",
            "An audit entry records that you submitted the report and no longer names you after account deletion.",
          ],
        },
        {
          id: "trip",
          when: "trip",
          heading: "Plans and trips",
          items: [
            "Your browser keeps the party description and your trips on this device, including names or labels you enter and the plan you receive.",
            "To make or update a plan, your browser sends Noren's server in Australia the route, days and any dates or pins, and group details such as age bands, rules and likes under traveller keys without their names or labels. Noren uses these details to choose places and returns the plan. The trip planner writes neither the request nor the resulting plan to its database.",
            "When you press Read what I wrote, Noren sends your words, the language and, for changes, a short outline with days, slots, place names and item types to its configured planning AI service for suggestions. Noren uses the planning service described in the service list, which can be Meta Platforms or Anthropic in the United States. The planner does not send the separate group description to that service. Any names or needs in the words you send can reach it. If you use Noren's recorder, the separate speech-recognition agreement covers sending the recording, as described under AI and your words.",
            "Dietary and access needs may reveal religious beliefs or health information. Beside the plan, change and AI buttons, Noren explains what each action sends and where, and asks you to agree by pressing the button. Noren records the date you agreed and which wording you agreed to, and deletes that record with your account.",
            "Include only what the plan needs. Get each traveller's agreement before sending their personal details. For a traveller under 18, get agreement from a parent, guardian or someone with parental responsibility.",
            "If you make a share link, Noren stores its code, your account ID, the trip's device ID and region, and the shared title and itinerary. The itinerary can include dates, routes, stops, labels for pins or whose turn it is, and checks shown at stops without saying who needs them. Anyone with the link can read it. Noren deletes the link record when you switch it off or delete the account. Links have no automatic expiry.",
            "To prevent abuse, Noren counts plan and AI requests per account in one-minute and 24-hour windows and share-link requests in 24-hour windows. Each count resets on the next request after its window ends. Noren deletes these counts when you delete your account.",
          ],
        },
        {
          id: "malaysia",
          when: "malaysia",
          heading: "Noren in Malaysia",
          items: [
            "This part covers personal data Noren processes in providing its Malaysian coverage in {region}, including trips.",
            "Noren treats Malaysia's Personal Data Protection Act 2010, as amended by the Personal Data Protection (Amendment) Act 2024, as applying to its Malaysian coverage and follows it.",
            "{operator} is responsible for your personal data. Noren uses Convex in Sydney, Australia, to store account and contribution data and process trip requests. The optional AI and speech features can send data to services abroad. See the service list and Plans and trips for who receives it and why.",
            "Personal data is transferred abroad only on a ground allowed by section 129. When Noren relies on consent for a transfer, it asks separately. Noren will notify the Malaysian Personal Data Protection Commissioner and people affected by a breach when required by law.",
            "Send requests to Noren’s Privacy contact, {operator}, at {contact}.",
            "You can ask to access or correct personal data, limit its use or withdraw consent. You can also ask in writing electronically for Noren to send personal data it holds about you directly to another controller you choose, where technically feasible and the formats are compatible.",
            "If the English and Malay notices differ, the English text governs. Your rights under Malaysian law still apply.",
          ],
        },
        // Shown only while photos are on. Turning them on changes this notice, so set a new
        // documentsVersion in the same change.
        {
          id: "photos",
          when: "photos",
          heading: "Photos you add",
          paragraphs: [
            "A photo you add to a story is public, with your name beside it. Noren stores photos with Amazon Web Services in Tokyo, Japan, and serves them through Amazon CloudFront. Noren removes location data from each photo. Deleting your account deletes your photos.",
          ],
        },
        {
          id: "browser",
          heading: "What your browser loads",
          paragraphs: [
            "Noren uses Clerk's sign-in cookies. It uses no cookies for advertising or for measuring visits. Your browser also remembers that you closed the map's guide.",
            "So that a page that reloads doesn't lose your work, your browser keeps what you were writing and any photos you picked, on your device. They go when you share or clear them, when you sign out, or after a week; when you're not signed in, when you close the tab. None of this leaves your device.",
            "Your browser gets map images directly from OpenFreeMap, and the aerial photos on a map for placing a pin directly from Japan's Geospatial Information Authority.",
            "Posts from these platforms load only when you press a post's load button: {platforms}. The platform may then set cookies and see your visit.",
            "When you paste a link, Noren's server opens that page to show a preview. The site sees Noren's server and does not see you.",
            {
              when: "planner",
              text: "While Plan my day is on, your browser also keeps what Noren remembers for you, on your device (see “Plan my day and What Noren remembers”).",
            },
          ],
        },
        {
          id: "deletion",
          heading: "When you delete your account",
          paragraphs: [
            "You can delete your account on your account page. A creator, shop owner or steward asks a steward instead, because interviews and consent records depend on those roles.",
            "These are deleted:",
          ],
          items: [
            "your check-ins, panels, badges and stamps",
            "the stories you wrote",
            "your “Still here” presses and the reports you sent",
            "any visitor notes you wrote, with their translations",
            "your sign-in at Clerk",
            "your name and the link to your sign-in. Your account becomes an empty row named “Former member”, and nothing in it points back to you.",
          ],
          closing: [
            "These are hidden: the links you shared come off every page. The record of each link, with the line you wrote, stays hidden in the database.",
            "These stay: places you added, with their pins and names, stay as facts about a place, and your name does not show. The record of what stewards did stays, and it points at the empty row, so it no longer identifies you. Daily counts stay too, and they hold only an account ID.",
            "A post already made on Noren's own social media accounts stays until Noren deletes it. Ask us at {contact} and we will delete it within 14 days.",
            {
              when: "planner",
              text: "What Noren remembers stays on your device until you press “Forget everything” or clear this site's data in your browser.",
            },
            "Signing in again brings nothing back.",
          ],
        },
        {
          id: "how-long",
          heading: "How long Noren keeps things",
          paragraphs: [
            "Your account and what you share stay until you or a steward removes them, or you delete the account.",
            "A contact detail written on a removal request is erased when the request closes. Logs at Vercel and Clerk last as long as each service sets.",
            "A problem report holds what you wrote, the page you were on, and your browser's name and screen size. It is not linked to your account. A contact detail written on it is erased when the report closes. A copy without the contact detail is filed in a private GitHub repository that only the Noren team can read, and GitHub emails the team about it.",
            "A recording you send for speech recognition is deleted as described under “AI and your words”. A post on Noren's own social media accounts stays until Noren deletes it.",
          ],
        },
        {
          id: "public-posts",
          heading: "Public posts Noren finds",
          paragraphs: [
            "Noren looks for public posts about places, and AI from Anthropic reads them. A page shows a short quote and the author's public name, with a link to the original. Stories AI writes from them are marked “Stitched by Noren's AI”. If a post of yours appears, you can ask for its removal at {contact}, with or without an account.",
            {
              when: "connector",
              text: "AI assistants connected to Noren can read the same quote, name and link.",
            },
          ],
        },
        {
          id: "age",
          heading: "People under {minimumAge}",
          paragraphs: [
            "Noren accounts are for people aged {minimumAge} or over. If you think an account belongs to someone younger, tell us at {contact} and we will delete it.",
          ],
        },
        {
          id: "choices",
          heading: "What you can do",
          paragraphs: [
            "You can change your name, remove a story or link and delete your account yourself. To ask for a copy of your data, a correction or for Noren to stop using it, write to {contact}.",
            "Noren does not sell your data and shows no advertising.",
          ],
        },
        {
          id: "changes",
          heading: "Changes",
          paragraphs: [
            "If this notice changes, the version date at the top changes too. A new service is named here before it handles your data.",
          ],
        },
      ],
    },
  },
};

/**
 * The full privacy notice in Malay (T038), a document of its own at /privacy/ms. Malay is
 * not an interface language: the site stays in Japanese and English and only this page is in Malay.
 * Section 7(3) of Malaysia's Act asks for a notice in the national language and in English, if the Act
 * reaches Noren (research.md, "Verify at build time" item 5).
 *
 * The Malay is machine-drafted from the English and no Malay speaker has read it. The page says so
 * until one has, as the Japanese did. When a Malay speaker has read it, change `unreviewed` and
 * record who read it and when.
 *
 * Each section and line follows the same switches as its English counterpart.
 */
export const malayPrivacy: {
  document: LegalDocument;
  /** The plain line saying the Malay has not been reviewed, in Malay and then in English. */
  unreviewed: { ms: string; en: string };
} = {
  unreviewed: {
    ms: "Teks Bahasa Melayu ini belum disemak oleh penutur Bahasa Melayu.",
    en: "A Malay speaker has not yet reviewed this Malay text.",
  },
  document: {
    title: "Notis Privasi Noren (Bahasa Melayu)",
    lead: "Ini ialah notis privasi Noren dalam bahasa Melayu. Penutur bahasa Melayu belum menyemaknya. Jika terdapat perbezaan antara versi bahasa Inggeris dengan versi bahasa Melayu, teks bahasa Inggeris terpakai.",
    sections: [
      {
        id: "responsible",
        heading: "Pihak yang bertanggungjawab",
        paragraphs: ["{operator} bertanggungjawab terhadap data anda. Anda boleh menghubunginya melalui {contact}."],
      },
      {
        id: "keeps",
        heading: "Maklumat yang disimpan oleh Noren",
        items: [
          "Clerk menyimpan maklumat log masuk anda, iaitu alamat e-mel dan kata laluan, serta masa anda menerima dokumen ini. Pangkalan data Noren hanya menyimpan ID daripada Clerk dan tidak menyimpan alamat e-mel anda.",
          "Nama yang anda pilih dan peranan akaun anda.",
          "Bahan yang anda kongsi, iaitu cerita, pautan berserta ayat yang anda tulis mengenainya, dan tempat yang anda tambah berserta pin masing-masing.",
          "Rekod apabila anda menekan “Still here” dan sebarang laporan yang anda hantar tentang sesuatu tempat, termasuk catatan yang disertakan.",
          "Koleksi anda, termasuk tempat anda menekan “I'm here”, set dan panelnya, tarikh mengikut waktu Jepun, serta lencana anda.",
          "Sama ada anda sudah menutup video alu-aluan.",
          "Kiraan harian untuk mengelakkan satu akaun membanjiri peta dengan hantaran. Setiap kiraan hanya menyimpan ID akaun anda dan satu angka.",
          "Rekod tindakan penjaga Noren, seperti memadamkan cerita.",
        ],
      },
      {
        id: "location",
        heading: "Lokasi anda",
        paragraphs: [
          "Apabila anda menekan “I'm here”, telefon anda membaca lokasi anda sekali dan mengira sendiri jarak ke tempat itu. Lokasi anda tidak dihantar kepada Noren. Rekod itu tidak menyimpan koordinat atau waktu anda berada di situ.",
          "Butang yang memusatkan peta pada kedudukan anda membaca lokasi anda untuk kegunaan pelayar anda sahaja.",
          {
            when: "walk",
            text: "Semasa mod berjalan kaki dibuka, telefon anda menjejaki lokasi anda dan mengira jarak pada telefon itu sendiri. Lokasi anda tidak dihantar kepada Noren (lihat “Mod berjalan kaki”).",
          },
          {
            when: "planner",
            text: "Pilihan “Nearest to me” dalam Plan my day membaca lokasi anda sekali dan mencari kawasan kejiranan terdekat pada telefon anda. Hanya maklumat tentang kawasan itu dihantar kepada Noren.",
          },
        ],
      },
      {
        id: "who-sees",
        heading: "Siapa yang boleh melihat maklumat anda",
        paragraphs: [
          "Sesiapa sahaja boleh membaca cerita dan pautan yang anda kongsi, bersama nama anda. Alamat e-mel anda tidak dipaparkan pada mana-mana halaman.",
          "Tempat yang anda tambah dipaparkan pada peta. Nama anda tidak dipaparkan pada halaman tempat itu.",
          "Hanya anda boleh melihat panel, cap dan lencana anda di Noren. Skrin dan fail eksport untuk penjaga Noren tidak memaparkan rekod daftar masuk individu. Anda sendiri boleh berkongsi gambar koleksi yang sudah siap.",
          "Penjaga Noren, iaitu orang yang mengurus Noren, boleh melihat nama dan peranan pengguna serta nama pada sesuatu laporan.",
        ],
      },
      {
        id: "story-pictures",
        heading: "Gambar cerita anda dan akaun media sosial Noren",
        paragraphs: [
          "Pada setiap cerita anda, anda boleh memilih “Share on Instagram”. Selagi cerita itu dipaparkan di Noren, Noren boleh menghasilkan gambar menggunakan teks cerita, nama tempat, nama paparan anda dan alamat laman web kami, serta menyediakan kapsyen. Foto anda tidak digunakan. Tiada apa-apa dihantar ke Instagram. Anda sendiri menyalin kapsyen, menyimpan gambar dan menyiarkan hantaran itu.",
          "Jika anda menandakan “Noren and this place may share my story on Instagram, with my name” semasa menulis cerita, petugas Noren atau pemilik tempat yang telah disahkan oleh Noren boleh menggunakan gambar dan kapsyen yang sama untuk menyiarkan cerita anda (teks dan nama paparan anda) pada akaun Instagram masing-masing. Mereka menyiarkannya sendiri. Noren tidak menyiarkan hantaran secara automatik. Kotak itu kosong sehingga anda sendiri memilih untuk menandakannya. Noren merekodkan pilihan itu dan masa anda membuatnya. Anda boleh mengubah pilihan pada cerita anda pada bila-bila masa dengan memilih “Allow this” atau “Stop allowing”. Hantaran yang sudah disiarkan kekal sehingga orang yang menyiarkannya memadamkannya. Jika anda menghubungi kami melalui {contact}, kami akan memadamkan hantaran Noren dalam masa 14 hari dan meminta pemilik tempat memadamkan hantaran mereka.",
        ],
      },
      {
        id: "services",
        heading: "Perkhidmatan yang mengendalikan data anda",
        paragraphs: [
          "Noren menggunakan perkhidmatan yang disenaraikan di bawah. Kebanyakannya beroperasi di luar Jepun, jadi data anda disimpan dan digunakan di negara lain. Apabila anda menandakan kotak semasa mendaftar, anda turut bersetuju dengan perkara ini.",
        ],
        services: [
          {
            name: "Clerk",
            country: "Amerika Syarikat",
            does: "Menyimpan maklumat log masuk anda, iaitu alamat e-mel, kata laluan dan butiran peranti yang anda gunakan untuk log masuk, termasuk alamat IP. Clerk menghantar kod log masuk melalui e-mel dan menyemak pendaftaran untuk mengesan penyalahgunaan.",
          },
          {
            name: "Cloudflare",
            country: "Amerika Syarikat",
            does: "Mengendalikan semakan untuk mengesan bot yang mungkin dipaparkan oleh Clerk semasa pendaftaran. Cloudflare dapat melihat alamat IP dan butiran pelayar anda.",
          },
          {
            name: "Convex",
            country: "Australia (Sydney), dikendalikan oleh syarikat dari Amerika Syarikat",
            does: "Menyediakan pangkalan data Noren. Convex menyimpan semua maklumat yang disenaraikan di atas kecuali butiran log masuk anda. Convex juga menyimpan buat sementara waktu rakaman yang anda pilih untuk dihantar bagi tujuan pengecaman suara.",
          },
          {
            name: "Vercel",
            country: "Amerika Syarikat, dengan halaman Noren diproses di Tokyo, Jepun",
            does: "Menyampaikan halaman Noren kepada pelayar anda. Vercel dapat melihat alamat IP anda dan halaman yang anda buka serta menyimpan maklumat itu dalam lognya untuk suatu tempoh.",
          },
          {
            name: "Meta Platforms",
            country: "Amerika Syarikat",
            does: "Menyediakan perkhidmatan AI. Jika anda bersetuju dengan pengecaman suara, Meta Platforms menerima rakaman suara anda dan menukarkannya kepada teks. Meta Platforms juga menerima rakaman temu bual. Jika tetapan Noren menggunakan perkhidmatan ini sebagai ganti Anthropic, perkhidmatan ini menerima teks yang sama.",
            more: [
              {
                when: "planner",
                text: "Jika tetapan Noren menggunakan perkhidmatan ini untuk Plan my day, perkhidmatan ini turut menerima maklumat yang dihantar oleh perancang (lihat “Plan my day dan maklumat yang diingati oleh Noren”).",
              },
            ],
          },
          {
            name: "Modal",
            country: "Amerika Syarikat",
            does: "Menjalankan model AI yang pemberatnya tersedia secara terbuka. Jika tetapan Noren menggunakan Modal untuk menyemak terjemahan dan cerita yang ditulis oleh AI, Modal menerima kenyataan yang telah disahkan oleh pemilik, petikan daripada hantaran awam dan terjemahannya.",
          },
          {
            name: "Anthropic",
            country: "Amerika Syarikat",
            does: "Menyediakan perkhidmatan AI. Anthropic menerima teks hantaran anda apabila anda meminta draf berdasarkan hantaran anda sendiri (lihat di bawah). Anthropic juga menerima transkrip temu bual dan teks hantaran awam serta menyemak terjemahan dan cerita yang ditulis oleh AI.",
            more: [
              {
                when: "planner",
                text: "Jika tetapan Noren menggunakan perkhidmatan ini untuk Plan my day, perkhidmatan ini turut menerima maklumat yang dihantar oleh perancang (lihat “Plan my day dan maklumat yang diingati oleh Noren”).",
              },
            ],
          },
          {
            name: "OpenAI",
            country: "Amerika Syarikat",
            does: "Menukarkan pertuturan kepada teks. Jika tetapan Noren menggunakan OpenAI sebagai ganti Meta Platforms, OpenAI menerima rakaman temu bual dan rakaman yang ahli pilih untuk dihantar bagi tujuan pengecaman suara.",
          },
          {
            name: "OpenStreetMap Foundation",
            country: "United Kingdom",
            does: "Menerima perkataan yang anda taip apabila mencari tempat untuk ditambah. Pelayan Noren menghantar perkataan itu tanpa sebarang maklumat yang mengenal pasti anda.",
          },
          {
            name: "OpenFreeMap",
            country: "Hungary",
            does: "Menghantar imej peta terus kepada pelayar anda dan oleh itu dapat melihat alamat IP anda.",
          },
        ],
      },
      {
        id: "ai",
        heading: "AI dan kata-kata anda",
        paragraphs: [
          {
            unless: "aiReading",
            text: "Noren tidak menghantar cerita yang anda taip, nama paparan anda atau alamat e-mel anda kepada perkhidmatan AI.",
          },
          {
            when: "aiReading",
            text: "Noren tidak menghantar alamat e-mel anda kepada perkhidmatan AI. Cerita yang anda taip hanya dihantar bersama nama paparan anda jika anda membenarkannya untuk cerita itu (lihat “AI yang membaca cerita”).",
          },
          "Jika anda memilih “Speak your story” dan bersetuju dengan pengecaman suara, Noren memuat naik rakaman anda buat sementara waktu ke Convex di Sydney, Australia, dan menghantarnya kepada Meta Platforms di Amerika Syarikat untuk ditukarkan kepada teks. Rakam suara anda sendiri sahaja dan elakkan daripada menyebut maklumat peribadi orang lain.",
          "Teks itu dikembalikan ke ruangan cerita untuk anda semak dan sunting. Noren tidak menyimpan transkrip pada pelayannya semasa rakaman ditukarkan kepada teks. Teks yang belum anda hantar disimpan sebagai draf dalam pelayar anda. Hanya apabila anda menekan “Share”, teks itu disimpan sebagai cerita dan dipaparkan kepada umum bersama nama anda.",
          "Noren memadamkan salinan audionya sebaik sahaja proses pengecaman suara selesai, sama ada proses itu berjaya atau gagal. Jika anda meninggalkan halaman itu lebih awal, Noren memadamkannya dalam masa kira-kira sejam. Meta Platforms tidak menggunakan rakaman itu untuk melatih modelnya dan mungkin menyimpannya selama yang dibenarkan oleh termanya sendiri, contohnya untuk semakan keselamatan.",
          "Jika anda menandakan bahawa sesuatu hantaran ialah hantaran anda sendiri dan meminta draf, Noren membaca tajuk dan teks pada halaman hantaran itu lalu menghantarnya bersama nama tempat kepada Anthropic di Amerika Syarikat. Draf dikembalikan kepada anda dan tiada apa-apa disimpan sehingga anda menekan “Share”. Anthropic tidak menggunakan teks ini untuk melatih modelnya.",
          "Bagi temu bual, pemilik kedai terlebih dahulu memberikan persetujuan melalui borang berasingan yang menyatakan perkhidmatan yang mengendalikan rakaman dan transkrip.",
        ],
      },
      {
        id: "ai-reading",
        when: "aiReading",
        heading: "AI yang membaca cerita",
        paragraphs: [
          "Semasa menulis cerita, anda boleh menandakan “Let AI read this story, with my name”. Pilihan ini hanya diaktifkan jika anda menandakannya. Noren merekodkan pilihan itu dan masa anda membuatnya. Anda boleh mengubahnya pada bila-bila masa pada cerita anda dengan memilih “Allow this” atau “Stop allowing”.",
          {
            when: "planner",
            text: "Jika anda menandakan kotak itu, Plan my day boleh menghantar teks cerita dan nama paparan anda kepada perkhidmatan AI yang digunakannya. AI boleh memilih petikan untuk laluan berjalan kaki ahli lain. Petikan dipaparkan sama seperti yang anda tulis, bersama nama anda.",
          },
          {
            when: "connector",
            text: "Jika anda menandakan kotak itu, pembantu AI seperti Claude atau ChatGPT yang disambungkan oleh pengguna kepada Noren boleh membaca teks cerita dan nama paparan anda melalui penyambung Noren. Syarikat yang menyediakan pembantu itu kemudiannya menyimpan maklumat yang dibaca dan menggunakannya mengikut termanya sendiri. Noren tidak dapat memadamkan maklumat yang telah dibaca oleh pembantu itu.",
          },
          "Jika anda menarik balik kebenaran, Noren berhenti menghantar cerita itu sejak saat tersebut. Tanpa tanda pada kotak itu, Noren tidak menghantar cerita anda kepada AI. Cerita itu tetap dipaparkan bersama nama anda pada halaman Noren.",
        ],
      },
      {
        id: "planner",
        when: "planner",
        heading: "Plan my day dan maklumat yang diingati oleh Noren",
        paragraphs: [
          "Plan my day tersedia untuk ahli yang telah log masuk. Apabila anda mengemukakan soalan, peranti anda menghantar mesej anda, beberapa mesej terakhir, tempat anda ingin bermula, perjalanan hari ini, syarat dan kegemaran yang diingati oleh Noren untuk anda, serta bahasa halaman kepada Noren.",
          "Noren memilih tempat singgah secara rawak daripada tempat yang pernah diceritakan oleh ahli. Pilihan itu mengambil kira kegemaran anda dan mematuhi syarat yang dapat disemak. Noren kemudian menghantar mesej anda, beberapa mesej terakhir, perjalanan hari ini dan tempat yang dipilih kepada perkhidmatan AI yang digunakan oleh perancang Noren (Meta Platforms atau Anthropic, seperti yang disenaraikan di atas). AI memilih petikan cerita untuk dipaparkan di bawah setiap tempat singgah.",
          "Pelayan Noren menggunakan syarat dan kegemaran yang anda simpan hanya untuk memilih tempat bagi jawapan itu. Noren tidak menyimpan maklumat itu atau menghantarnya kepada AI. Walau bagaimanapun, apa-apa yang anda taip atau sebut dalam mesej anda, termasuk alahan atau keperluan pemakanan, dihantar kepada AI bersama mesej itu.",
          "Noren tidak menyimpan salinan perbualan atau jawapan. Untuk mengehadkan penggunaan, Noren mengira bilangan soalan daripada setiap akaun. Noren juga mengira berapa kali setiap tempat dipilih setiap minggu tanpa merekodkan untuk siapa tempat itu dipilih. Kiraan mingguan itu dipadamkan selepas 8 minggu.",
          "Jika anda memilih untuk bercakap, pengecaman suara berfungsi seperti yang diterangkan dalam bahagian “AI dan kata-kata anda”.",
          "Ciri “What Noren remembers” menyimpan syarat, kegemaran dan perjalanan hari ini dalam pelayar ini pada peranti ini. Pelayan Noren tidak menyimpannya. Alahan ialah maklumat kesihatan dan amalan pemakanan seperti makan makanan halal boleh menunjukkan kepercayaan agama. Oleh itu, undang-undang privasi Jepun boleh menganggapnya sebagai maklumat peribadi yang memerlukan perhatian khusus. Masukkannya hanya jika anda mahu. Anda boleh memadamkan mana-mana butiran atau menekan “Forget everything” pada bila-bila masa. Memadamkan data laman ini dalam pelayar anda juga memadamkan butiran itu.",
          "Apabila Plan my day diaktifkan, membuka atau menyimpan tempat di Noren menambah maklumat tentang kegemaran anda pada peranti ini, walaupun anda belum log masuk. Kegemaran yang disimpulkan daripada tindakan anda beransur hilang dalam beberapa minggu. Perjalanan hari ini dipadamkan pada tengah malam waktu Jepun kecuali jika anda memilih untuk menyimpannya.",
        ],
      },
      {
        id: "walk",
        when: "walk",
        heading: "Mod berjalan kaki",
        paragraphs: [
          "Semasa mod berjalan kaki dibuka, telefon anda menjejaki lokasi anda untuk menunjukkan tempat yang berdekatan dan arahnya. Telefon anda sendiri mengira jarak. Lokasi anda tidak dihantar kepada Noren atau disimpan.",
          "Telefon anda memuatkan senarai awam tempat di Noren sekali sahaja dan memuatkan omikuji hari itu apabila anda membukanya. Semua orang menerima omikuji yang sama pada hari tersebut. Kedua-dua permintaan itu tidak menyertakan lokasi anda.",
          "Mod berjalan kaki menggunakan suara terbina dalam telefon anda untuk membaca teks dengan lantang. Apa yang dibacakan kekal pada telefon anda.",
          "Omikuji hari ini mengandungi soalan yang dirahsiakan sehingga anda tiba di tempat tersebut. Telefon anda sendiri menyemak jarak dan membuka soalan itu. Noren tidak diberitahu tentang lokasi anda atau bahawa soalan itu telah dibuka.",
          "Sehingga tujuh keping omikuji yang anda cabut disimpan dalam pelayar ini pada peranti ini. Pelayan Noren tidak menyimpannya. Anda boleh memadamkannya dengan memilih “Clear kept slips” atau memadamkan data laman ini dalam pelayar anda.",
          "Semasa menulis cerita, anda boleh meninggalkan soalan untuk pengunjung seterusnya. Soalan itu dipaparkan kepada umum bersama cerita dan nama anda, serta dalam omikuji hari itu bagi tempat tersebut. Noren tidak menterjemahkannya atau menghantarnya kepada perkhidmatan AI. Anda boleh memadamkannya pada bila-bila masa.",
        ],
      },
      {
        id: "connector",
        when: "connector",
        heading: "Penyambung Noren untuk pembantu AI",
        paragraphs: [
          "Sesiapa sahaja boleh menyambungkan pembantu AI seperti Claude atau ChatGPT kepada penyambung Noren. Pembantu itu kemudian boleh mencari tempat dan koleksi di Noren, membaca halaman tempat seperti yang dilihat oleh pengunjung yang belum log masuk, serta meminta Noren memilih laluan berjalan kaki atau omikuji.",
          "Pembantu hanya menerima teks cerita ahli dan nama penulis jika penulis menandakan “Let AI read this story, with my name”. Tanpa kebenaran itu, pembantu hanya mengetahui bilangan cerita tentang sesuatu tempat dan di mana cerita itu boleh dibaca di Noren. Catatan ahli pada pautan yang mereka kongsi tidak dihantar kepada pembantu.",
          "Penyambung boleh digunakan tanpa log masuk, jadi Noren tidak mengetahui siapa yang bertanya dan tidak menyimpan rekod soalan. Noren menyimpan kiraan untuk mengehadkan kekerapan penyambung digunakan. Noren juga mengira berapa kali setiap tempat dipilih setiap minggu dan memadamkan kiraan mingguan itu selepas 8 minggu.",
          "Syarikat yang menyediakan pembantu AI kemudiannya menyimpan maklumat yang dibaca oleh pembantu itu mengikut terma dan notis privasi syarikat tersebut.",
        ],
      },
      {
        id: "facts",
        when: "facts",
        heading: "Laporan fakta tentang sesuatu tempat",
        items: [
          "Ahli boleh melaporkan apa yang mereka temui di sesuatu tempat, seperti pintu masuk tanpa tangga atau bilik solat. Nama paparan ahli dan hari laporan dibuat dipaparkan bersama laporan.",
          "Laporan ialah kenyataan ahli tentang apa yang dilihatnya sendiri. Noren memaparkannya sebagai kenyataan ahli dan tidak menggunakannya sebagai penilaian atau kiraan.",
          "Jika ahli belum mengesahkan nama paparannya, Noren meminta persetujuan sebelum ahli boleh melapor supaya nama dan hari itu dipaparkan bersama laporan.",
          "Apabila anda menarik balik laporan, Noren menyembunyikannya daripada semua orang di halaman tempat itu dan menyimpannya dengan tanda ditarik balik sehingga anda memadamkan akaun.",
          "Catatan audit merekodkan penghantaran laporan itu dan tidak lagi memaparkan nama anda selepas akaun dipadamkan.",
        ],
      },
      {
        id: "trip",
        when: "trip",
        heading: "Rancangan dan perjalanan",
        items: [
          "Pelayar pada peranti ini menyimpan penerangan kumpulan dan perjalanan anda, termasuk nama atau gelaran yang anda masukkan dan rancangan yang anda terima.",
          "Untuk membuat atau mengemas kini rancangan, pelayar anda menghantar laluan, bilangan hari, tarikh atau pin yang dimasukkan, serta butiran kumpulan seperti julat umur, keperluan dan kegemaran kepada pelayan Noren di Australia. Butiran kumpulan menggunakan pengecam tanpa nama atau gelaran. Noren menggunakan butiran ini untuk memilih tempat dan memulangkan rancangan. Perancang perjalanan tidak menyimpan permintaan atau hasil rancangan dalam pangkalan datanya.",
          "Apabila anda menekan butang untuk membaca tulisan anda, Noren menghantar kata-kata anda dan bahasa kepada AI perancang untuk mendapatkan cadangan. Jika anda meminta perubahan, Noren turut menghantar ringkasan yang mengandungi hari, slot, nama tempat dan jenis item. Perkhidmatan yang ditetapkan boleh jadi Meta Platforms atau Anthropic di Amerika Syarikat, seperti dalam senarai perkhidmatan. Penerangan kumpulan daripada soalan lain tidak dihantar kepada AI itu. Nama atau keperluan dalam kata-kata yang anda hantar boleh diterima oleh AI itu. Jika anda menggunakan perakam Noren, penghantaran rakaman memerlukan persetujuan berasingan untuk pengecaman suara seperti yang diterangkan dalam bahagian AI dan kata-kata anda.",
          "Keperluan makanan dan akses boleh mendedahkan kepercayaan agama atau maklumat kesihatan. Di sebelah butang untuk membuat atau mengubah rancangan dan menghantar kata-kata kepada AI, Noren menerangkan apa yang dihantar dan ke mana, lalu meminta anda bersetuju dengan menekan butang itu. Noren merekodkan tarikh anda bersetuju dan versi teks yang anda persetujui, lalu memadamkan rekod itu apabila anda memadamkan akaun.",
          "Masukkan hanya maklumat yang diperlukan untuk rancangan. Dapatkan persetujuan setiap orang sebelum menghantar butiran peribadi mereka. Bagi orang di bawah umur 18 tahun, dapatkan persetujuan ibu bapa, penjaga atau orang yang mempunyai tanggungjawab ibu bapa.",
          "Jika anda membuat pautan kongsi, Noren menyimpan kod pautan, ID akaun, ID perjalanan pada peranti dan rantau, serta tajuk dan jadual perjalanan yang dikongsi. Jadual itu boleh mengandungi tarikh, laluan, tempat singgah, label pin atau giliran seseorang, serta semakan di tempat singgah tanpa menyatakan siapa yang memerlukannya. Sesiapa yang mempunyai pautan boleh membacanya. Noren memadamkan rekod pautan apabila anda mematikannya atau memadamkan akaun. Pautan tidak luput secara automatik.",
          "Untuk mencegah penyalahgunaan, Noren mengira permintaan rancangan dan AI bagi setiap akaun dalam tempoh satu minit dan 24 jam, serta permintaan pautan kongsi dalam tempoh 24 jam. Setiap kiraan bermula semula pada permintaan pertama selepas tempohnya tamat. Noren memadamkan kiraan ini apabila anda memadamkan akaun.",
        ],
      },
      {
        id: "malaysia",
        when: "malaysia",
        heading: "Noren di Malaysia",
        items: [
          "Bahagian ini meliputi data peribadi yang diproses oleh Noren untuk liputan Malaysia di {region}, termasuk perancangan perjalanan.",
          "Noren menganggap Akta Perlindungan Data Peribadi 2010 Malaysia, sebagaimana dipinda oleh Akta Perlindungan Data Peribadi (Pindaan) 2024, terpakai kepada liputannya di Malaysia dan mematuhinya.",
          "{operator} bertanggungjawab terhadap data peribadi anda. Noren menggunakan Convex di Sydney, Australia, untuk menyimpan data akaun dan sumbangan serta memproses permintaan perjalanan. Ciri AI dan suara yang anda pilih boleh menghantar data kepada perkhidmatan di luar negara. Lihat senarai perkhidmatan dalam notis ini dan bahagian Rancangan dan perjalanan untuk mengetahui penerima dan tujuannya.",
          "Data peribadi dipindahkan ke luar negara hanya atas dasar yang dibenarkan oleh seksyen 129. Jika Noren bergantung pada persetujuan untuk pemindahan, Noren memintanya secara berasingan. Noren akan memaklumkan Pesuruhjaya Perlindungan Data Peribadi Malaysia dan orang yang terjejas oleh pelanggaran data apabila dikehendaki oleh undang-undang.",
          "Sila kemukakan permintaan anda kepada Pegawai hubungan privasi Noren, {operator}, melalui {contact}.",
          "Anda boleh meminta akses kepada data peribadi anda, membetulkannya, mengehadkan penggunaannya atau menarik balik persetujuan. Anda juga boleh membuat permintaan bertulis secara elektronik supaya Noren menghantar data peribadi anda terus kepada pengawal data lain pilihan anda, jika boleh dilaksanakan secara teknikal dan format data serasi.",
          "Jika terdapat perbezaan antara notis bahasa Inggeris dan bahasa Melayu, teks bahasa Inggeris terpakai. Hak anda di bawah undang-undang Malaysia tetap terpakai.",
        ],
      },
      {
        id: "photos",
        when: "photos",
        heading: "Foto yang anda tambah",
        paragraphs: [
          "Foto yang anda tambah pada cerita dipaparkan kepada umum bersama nama anda. Noren menyimpan foto di Amazon Web Services di Tokyo, Jepun dan menyampaikannya melalui Amazon CloudFront. Noren membuang data lokasi daripada setiap foto. Apabila anda memadamkan akaun, foto anda turut dipadamkan.",
        ],
      },
      {
        id: "browser",
        heading: "Kandungan yang dimuatkan oleh pelayar anda",
        paragraphs: [
          "Noren menggunakan kuki log masuk Clerk. Noren tidak menggunakan kuki untuk pengiklanan atau untuk mengukur jumlah kunjungan. Pelayar anda juga mengingati bahawa anda telah menutup panduan peta.",
          "Pelayar menyimpan tulisan yang sedang anda karang dan foto yang anda pilih pada peranti anda supaya kerja anda tidak hilang jika halaman dimuatkan semula. Bahan ini dipadamkan apabila anda berkongsi atau mengosongkannya, apabila anda log keluar atau selepas seminggu. Jika anda belum log masuk, bahan itu dipadamkan apabila anda menutup tab tersebut. Bahan yang disimpan dengan cara ini kekal pada peranti anda.",
          "Pelayar anda mendapatkan imej peta terus daripada OpenFreeMap. Untuk peta yang digunakan bagi meletakkan pin, pelayar mendapatkan foto udara terus daripada Geospatial Information Authority of Japan.",
          "Hantaran daripada platform berikut hanya dimuatkan apabila anda menekan butang untuk memuatkan hantaran tersebut: {platforms}. Platform itu kemudian mungkin menyimpan kuki dan mengetahui bahawa anda telah berkunjung.",
          "Apabila anda menampal pautan, pelayan Noren membuka halaman itu untuk menyediakan pratonton. Laman tersebut hanya melihat pelayan Noren dan tidak melihat anda.",
          {
            when: "planner",
            text: "Apabila Plan my day diaktifkan, pelayar anda turut menyimpan maklumat yang diingati oleh Noren untuk anda pada peranti anda (lihat “Plan my day dan maklumat yang diingati oleh Noren”).",
          },
        ],
      },
      {
        id: "deletion",
        heading: "Apabila anda memadamkan akaun",
        paragraphs: [
          "Anda boleh memadamkan akaun pada halaman akaun anda. Pencipta, pemilik kedai dan penjaga Noren perlu meminta penjaga Noren memadamkan akaun mereka kerana temu bual dan rekod persetujuan terikat pada peranan tersebut.",
          "Maklumat berikut dipadamkan:",
        ],
        items: [
          "rekod daftar masuk di tempat yang anda kunjungi, panel, lencana dan cap anda",
          "cerita yang anda tulis",
          "rekod apabila anda menekan “Still here” dan laporan yang anda hantar",
          "catatan pengunjung yang anda tulis berserta terjemahannya",
          "maklumat log masuk anda di Clerk",
          "nama anda dan pautan ke maklumat log masuk anda. Yang tinggal daripada akaun anda hanyalah baris kosong bernama “Former member”, tanpa sebarang maklumat yang boleh dikaitkan dengan anda.",
        ],
        closing: [
          "Pautan yang anda kongsi dikeluarkan daripada semua halaman. Rekod setiap pautan dan ayat yang anda tulis mengenainya kekal tersembunyi dalam pangkalan data.",
          "Tempat yang anda tambah, berserta pin dan namanya, kekal sebagai fakta tentang tempat itu. Nama anda tidak dipaparkan. Rekod tindakan penjaga Noren juga kekal. Rekod itu merujuk kepada baris kosong tadi dan tidak lagi mengenal pasti anda. Kiraan harian turut kekal dan hanya menyimpan ID akaun.",
          "Hantaran yang telah disiarkan pada akaun media sosial Noren kekal sehingga Noren memadamkannya. Jika anda menghubungi kami melalui {contact}, kami akan memadamkannya dalam masa 14 hari.",
          {
            when: "planner",
            text: "Maklumat yang diingati oleh Noren kekal pada peranti anda sehingga anda menekan “Forget everything” atau memadamkan data laman ini dalam pelayar anda.",
          },
          "Log masuk semula tidak akan memulihkan apa-apa yang telah dipadamkan.",
        ],
      },
      {
        id: "how-long",
        heading: "Tempoh penyimpanan maklumat",
        paragraphs: [
          "Akaun anda dan bahan yang anda kongsi disimpan sehingga anda atau penjaga Noren memadamkannya, atau sehingga anda memadamkan akaun.",
          "Butiran hubungan yang anda sertakan dalam permintaan pemadaman dipadamkan apabila permintaan itu ditutup. Vercel dan Clerk masing-masing menetapkan tempoh penyimpanan log mereka.",
          "Laporan masalah menyimpan apa yang anda tulis, halaman yang anda buka ketika itu, nama pelayar dan saiz skrin anda. Laporan itu tidak dipautkan kepada akaun anda. Jika anda menyertakan butiran hubungan, butiran itu dipadamkan apabila laporan ditutup. Salinan tanpa butiran hubungan disimpan dalam repositori GitHub persendirian yang hanya boleh dibaca oleh pasukan Noren. GitHub memaklumkan pasukan itu melalui e-mel.",
          "Rakaman yang anda hantar untuk pengecaman suara dipadamkan seperti yang diterangkan dalam bahagian “AI dan kata-kata anda”. Hantaran pada akaun media sosial Noren kekal sehingga Noren memadamkannya.",
        ],
      },
      {
        id: "public-posts",
        heading: "Hantaran awam yang ditemui oleh Noren",
        paragraphs: [
          "Noren mencari hantaran awam tentang sesuatu tempat dan menggunakan AI daripada Anthropic untuk membacanya. Halaman tempat memaparkan petikan pendek dan nama awam penulis berserta pautan ke hantaran asal. Cerita yang ditulis oleh AI berdasarkan hantaran itu dilabelkan “Stitched by Noren's AI”. Jika hantaran anda dipaparkan, anda boleh meminta supaya hantaran itu dikeluarkan melalui {contact}, walaupun anda tiada akaun.",
          {
            when: "connector",
            text: "Pembantu AI yang disambungkan kepada Noren boleh membaca petikan, nama dan pautan yang sama.",
          },
        ],
      },
      {
        id: "age",
        heading: "Mereka yang berumur di bawah {minimumAge} tahun",
        paragraphs: [
          "Akaun Noren adalah untuk mereka yang berumur {minimumAge} tahun ke atas. Jika anda berpendapat bahawa sesuatu akaun dimiliki oleh seseorang yang belum mencapai umur tersebut, maklumkan kepada kami melalui {contact} dan kami akan memadamkan akaun itu.",
        ],
      },
      {
        id: "choices",
        heading: "Pilihan anda",
        paragraphs: [
          "Anda sendiri boleh menukar nama, membuang cerita atau pautan dan memadamkan akaun anda. Untuk meminta salinan data anda, meminta pembetulan atau meminta Noren berhenti menggunakannya, hubungi kami melalui {contact}.",
          "Noren tidak menjual data anda dan tidak memaparkan iklan.",
        ],
      },
      {
        id: "changes",
        heading: "Perubahan pada notis ini",
        paragraphs: [
          "Jika notis ini berubah, tarikh versi di bahagian atas turut berubah. Mana-mana perkhidmatan baharu akan disenaraikan di sini sebelum perkhidmatan itu mengendalikan data anda.",
        ],
      },
    ],
  },
};

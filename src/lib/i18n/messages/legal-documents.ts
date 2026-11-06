import { defineMessages, type Locale } from "../index";

// The terms and the privacy notice (FR-126). These are DRAFTS for the owner and a lawyer to read, and a
// person has not reviewed the Japanese (T059). Both pages answer 404 until documentsVersion is set.
//
// Every {placeholder} is filled from regions/<id>.json by src/components/legal/documents.ts, so the
// operator, the contact, the minimum age and the takedown times are never typed here.
//
// The services below were traced from the code at commit 0a0891b. Check them again before setting
// documentsVersion, because the notice must match what the code uses on that day (FR-126).

export type LegalService = {
  /** The same in every language, so a test can hold the list against the code. */
  name: string;
  country: string;
  does: string;
};

export type LegalSection = {
  /** The same in every language, and the heading's anchor. */
  id: string;
  heading: string;
  /** Shown before the list, if there is one. */
  paragraphs?: readonly string[];
  items?: readonly string[];
  services?: readonly LegalService[];
  /** Shown after the list. */
  closing?: readonly string[];
};

export type LegalDocument = {
  title: string;
  lead: string;
  sections: readonly LegalSection[];
};

export const legalMessages = defineMessages({
  ja: {
    version: "版の日付：{version}",
    // Clerk's sign-up tick, kept with Clerk's link tokens. Clerk fills the links from its Legal settings.
    consentLabel:
      '私は{age}歳以上で、{{termsOfServiceLink || link("利用規約")}}と{{privacyPolicyLink || link("プライバシーポリシー")}}に同意します',
  },
  en: {
    version: "Version: {version}",
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
            "ログインの情報：メールアドレス、または Google でログインする場合は Google のアカウント。これらと、規約に同意した日時は Clerk が保存します。Noren のデータベースには Clerk の ID だけを保存し、メールアドレスは保存しません。",
            "あなたが決めた表示名と、アカウントの役割。",
            "共有したもの：話、リンクとそれに添えた一文、追加した場所とそのピン。",
            "「今もあります」を押した記録と、場所について送った報告（添えた文章を含む）。",
            "のれん集めの記録：「今ここにいます」を押した場所、その地区と枚目、日本時間の日付。そして、バッジ。",
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
          id: "services",
          heading: "データを扱うサービス",
          paragraphs: [
            "Noren は次のサービスを使って動いています。多くは日本国外にあるため、あなたのデータは他の国で保存され、処理されます。登録のときのチェックは、このことへの同意を含みます。",
          ],
          services: [
            {
              name: "Clerk",
              country: "米国",
              does: "ログインの情報を保存します。メールアドレス、Google でログインする場合は Google から届く名前と画像、ログイン中の端末の情報（IP アドレスなど）です。ログイン用のコードをメールで送り、不正な登録を確認します。",
            },
            {
              name: "Cloudflare",
              country: "米国",
              does: "登録のときに Clerk が表示することのある、ロボットを防ぐ確認を動かします。IP アドレスとブラウザの情報が伝わります。",
            },
            {
              name: "Google",
              country: "米国",
              does: "Google でのログインを選んだ場合のみ使います。Google は名前、メールアドレス、画像を Clerk に伝え、あなたが Noren にログインしたことを知ります。",
            },
            {
              name: "Convex",
              country: "オーストラリア（シドニー）。運営会社は米国",
              does: "Noren のデータベースです。上の一覧のうち、ログインの情報を除くすべてを保存します。",
            },
            {
              name: "Vercel",
              country: "米国。Noren のページの処理は日本の東京で行います",
              does: "Noren のページを届けます。IP アドレスと開いたページが伝わり、Vercel の記録に一定期間残ります。",
            },
            {
              name: "Meta Platforms",
              country: "米国",
              does: "AI です。自分の投稿から一文の下書きを作るとき（下記）に、その投稿の文章を受け取ります。インタビューの録音と文章、公開投稿の文章も受け取ります。",
            },
            {
              name: "Modal",
              country: "米国",
              does: "オープンウェイトの AI モデルを動かし、翻訳と AI が書いた物語を確かめます。店主が確認した発言、公開投稿の引用、それらの翻訳を受け取ります。",
            },
            {
              name: "Anthropic",
              country: "米国",
              does: "AI です。Noren の設定で Meta Platforms の代わりに使うことがあり、そのときは同じ文章を受け取ります。",
            },
            {
              name: "OpenAI",
              country: "米国",
              does: "音声の文字起こしです。Noren の設定で Meta Platforms の代わりに使うことがあり、そのときはインタビューの録音を受け取ります。",
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
            "Noren は、あなたが書いた話、表示名、メールアドレスを AI サービスに送りません。",
            "自分の投稿だと示して下書きを頼むと、Noren はそのページから題名と文章を読み、場所の名前とともに Meta Platforms に送ります。下書きはあなたに返され、「共有」を押すまで何も保存しません。Meta が受け取った内容で学習するモデルは、Noren の設定で拒否しています。",
            "インタビューは別の扱いです。店主には先に専用の同意書で同意していただき、そこで録音と文章を扱うサービスを示します。",
          ],
        },
        // Owner: keep or drop this section. Photos ship switched off, and the section stands alone, so
        // dropping it removes Amazon Web Services and Amazon CloudFront from the notice.
        {
          id: "photos",
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
            "地図の画像は OpenFreeMap から、ピンを置く地図の航空写真は日本の国土地理院から、ブラウザが直接読み込みます。",
            "次のサービスの投稿は、その投稿の読み込みボタンを押すまで読み込まれません：{platforms}。押すと、そのサービスが Cookie を設定し、あなたの訪問を知ることがあります。",
            "リンクを貼ると、プレビューのために Noren のサーバーがそのページを開きます。相手のサイトに見えるのは Noren のサーバーで、あなたではありません。",
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
            "残るもの：追加した場所とそのピン、名前は、場所についての事実として残り、あなたの名前は出ません。運営担当者の操作の記録は残りますが、空の行を指すので、あなたを特定しません。1日あたりの回数はアカウントの ID だけを持ち、やがて期限が切れます。",
            "もう一度ログインしても、何も戻りません。",
          ],
        },
        {
          id: "how-long",
          heading: "保存する期間",
          paragraphs: [
            "アカウントと共有したものは、あなたか運営担当者が削除するまで、またはアカウントを削除するまで保存します。",
            "削除の依頼に書いた連絡先は、依頼を閉じるときに消します。Vercel と Clerk の記録は、それぞれのサービスが定める期間残ります。",
          ],
        },
        {
          id: "public-posts",
          heading: "Noren が見つけた公開投稿",
          paragraphs: [
            "Noren は、場所について書かれた公開投稿を探し、Meta Platforms と Modal の AI で読みます。短い引用と投稿者の公開名を表示し、元の投稿へリンクします。AI が書いた物語には「Noren の AI が仕立てました」と表示します。あなたの投稿が載っていたら、アカウントがなくても {contact} から削除を依頼できます。",
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
            "Your sign-in: your email address, or your Google account if you sign in with Google. Clerk holds these, and the time you accepted the documents. Noren's own database holds only an ID from Clerk and never your email address.",
            "The name you choose, and your account's role.",
            "What you share: stories, links with the line you write about them, and places you add with their pins.",
            "Your “Still here” presses, and any report you send about a place with its note.",
            "Your collection: where you pressed “I'm here”, its set and panel, and the date in Japan. Also your badges.",
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
          id: "services",
          heading: "Services that handle your data",
          paragraphs: [
            "Noren runs on the services below. Most are outside Japan, so your data is stored and used in other countries. The tick at sign-up includes your agreement to this.",
          ],
          services: [
            {
              name: "Clerk",
              country: "United States",
              does: "Holds your sign-in: your email address, the name and picture Google sends if you sign in with Google, and details of the devices you sign in on, including IP address. Sends sign-in codes by email and checks sign-ups for abuse.",
            },
            {
              name: "Cloudflare",
              country: "United States",
              does: "Runs the bot check Clerk can show during sign-up. It sees your IP address and browser details.",
            },
            {
              name: "Google",
              country: "United States",
              does: "Used only if you choose to sign in with Google. It sends Clerk your name, email address and picture, and it knows you signed in to Noren.",
            },
            {
              name: "Convex",
              country: "Australia (Sydney), run by a United States company",
              does: "Noren's database. It holds everything in the list above apart from your sign-in details.",
            },
            {
              name: "Vercel",
              country: "United States, with Noren's pages running in Tokyo, Japan",
              does: "Delivers Noren's pages. It sees your IP address and the pages you open, and keeps them in its logs for a time.",
            },
            {
              name: "Meta Platforms",
              country: "United States",
              does: "An AI service. It receives your post's words when you ask for a draft from your own post (see below). It also receives interview recordings and transcripts, and the words of public posts.",
            },
            {
              name: "Modal",
              country: "United States",
              does: "Runs an open-weight AI model that checks translations and AI-written stories. It receives statements an owner has confirmed, quotes from public posts and their translations.",
            },
            {
              name: "Anthropic",
              country: "United States",
              does: "An AI service. A Noren setting can use it in place of Meta Platforms, and it then receives the same words.",
            },
            {
              name: "OpenAI",
              country: "United States",
              does: "Transcribes speech. A Noren setting can use it in place of Meta Platforms, and it then receives interview recordings.",
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
            "Noren does not send the stories you write, your name or your email address to an AI service.",
            "If you tick that a post is your own and ask for a draft, Noren reads the post's title and words from its page and sends them, with the place's name, to Meta Platforms. The draft comes back to you, and nothing is kept until you press Share. Noren's settings refuse the Meta models that train on what they receive.",
            "An interview works differently. A shop owner first agrees to a separate consent form, which names the services that handle the recording and the transcript.",
          ],
        },
        // Owner: keep or drop this section. Photos ship switched off, and the section stands alone, so
        // dropping it removes Amazon Web Services and Amazon CloudFront from the notice.
        {
          id: "photos",
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
            "Your browser gets map images directly from OpenFreeMap, and the aerial photos on a map for placing a pin directly from Japan's Geospatial Information Authority.",
            "Posts from these platforms load only when you press a post's load button: {platforms}. The platform may then set cookies and see your visit.",
            "When you paste a link, Noren's server opens that page to show a preview. The site sees Noren's server and does not see you.",
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
            "These stay: places you added, with their pins and names, stay as facts about a place, and your name does not show. The record of what stewards did stays, and it points at the empty row, so it no longer identifies you. Daily counts hold only an account ID, and they expire.",
            "Signing in again brings nothing back.",
          ],
        },
        {
          id: "how-long",
          heading: "How long Noren keeps things",
          paragraphs: [
            "Your account and what you share stay until you or a steward removes them, or you delete the account.",
            "A contact detail written on a removal request is erased when the request closes. Logs at Vercel and Clerk last as long as each service sets.",
          ],
        },
        {
          id: "public-posts",
          heading: "Public posts Noren finds",
          paragraphs: [
            "Noren looks for public posts about places, and AI from Meta Platforms and Modal reads them. A page shows a short quote and the author's public name, with a link to the original. Stories AI writes from them are marked “Stitched by Noren's AI”. If a post of yours appears, you can ask for its removal at {contact}, with or without an account.",
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

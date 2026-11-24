# Notice and terms for the trip agent (T016, T018)

Wording updated on 24 November 2026 for the public release that enables Malaysian coverage, reports and the trip agent for every signed-in member.

## How these parts fit the existing document

`src/lib/i18n/messages/legal-documents.ts` carries the English and Japanese terms and notices and the Malay notice. `src/components/legal/documents.ts` supplies the three switches and fills `{operator}`, `{region}`, `{contact}` and `{minimumAge}` from configuration. Malay is a notice language.

- **English** is the governing text if it differs from the Malay text.
- **Japanese (日本語)** awaits a native speaker's review.
- **Malay (Bahasa Melayu)** is machine-drafted and awaits review by a Malay speaker. The Malay page and its link use the existing unreviewed labels.

---

## Part 1. `malaysia`

Switch on when `malaysia-west` is enabled. Privacy notice, section id `malaysia`.

### English

**Heading: Noren in Malaysia**

- This part covers personal data Noren processes in providing its Malaysian coverage in {region}, including trips.
- Noren treats Malaysia's Personal Data Protection Act 2010, as amended by the Personal Data Protection (Amendment) Act 2024, as applying to its Malaysian coverage and follows it.
- {operator} is responsible for your personal data. Noren uses Convex in Sydney, Australia, to store account and contribution data and process trip requests. The optional AI and speech features can send data to services abroad. See the service list and Plans and trips for who receives it and why.
- Personal data is transferred abroad only on a ground allowed by section 129. When Noren relies on consent for a transfer, it asks separately. Noren will notify the Malaysian Personal Data Protection Commissioner and people affected by a breach when required by law.
- Contact {contact} for privacy requests. You can ask to access or correct personal data, limit its use or withdraw consent. You can also ask in writing electronically for Noren to send personal data it holds about you directly to another controller you choose, where technically feasible and the formats are compatible.
- If the English and Malay notices differ, the English text governs. Your rights under Malaysian law still apply.

### 日本語（ネイティブ確認待ち）

**見出し：マレーシアでの Noren**

- この項は、旅行プランを含む {region} のマレーシア向けサービスで Noren が取り扱う個人データに適用されます。
- Noren は、2024年個人データ保護改正法による改正後のマレーシアの2010年個人データ保護法が、マレーシア向けサービスに適用されるものとして従います。
- 個人データの責任者は {operator} です。Noren はオーストラリアのシドニーにある Convex を使って、アカウントや投稿のデータを保存し、プランの依頼を処理します。任意の AI や音声機能では、国外のサービスにデータが送られることがあります。送り先と目的は、サービス一覧と「プランと旅行」をご覧ください。
- 個人データを国外へ送るのは、同法第129条で認められる場合です。同意を根拠とするときは、別途同意を求めます。個人データの漏えいなどが起きた場合は、法律に従い、マレーシアの個人データ保護コミッショナーと影響を受けた方に必要な通知を行います。
- 個人データに関する依頼は {contact} までお寄せください。開示、訂正、利用の制限、同意の撤回を求められます。技術的に可能で形式に互換性がある場合は、Noren が持つご自身の個人データを指定した別の管理者に直接送るよう、電子的な書面でも依頼できます。
- 英語版とマレー語版の内容が異なる場合は、英語版が優先されます。マレーシアの法律で認められた権利は引き続き適用されます。

### Bahasa Melayu (draf mesin; belum disemak oleh penutur Bahasa Melayu)

**Tajuk: Noren di Malaysia**

- Bahagian ini meliputi data peribadi yang diproses oleh Noren untuk liputan Malaysia di {region}, termasuk perancangan perjalanan.
- Noren menganggap Akta Perlindungan Data Peribadi 2010 Malaysia, sebagaimana dipinda oleh Akta Perlindungan Data Peribadi (Pindaan) 2024, terpakai kepada liputannya di Malaysia dan mematuhinya.
- {operator} bertanggungjawab terhadap data peribadi anda. Noren menggunakan Convex di Sydney, Australia, untuk menyimpan data akaun dan sumbangan serta memproses permintaan perjalanan. Ciri AI dan suara yang anda pilih boleh menghantar data kepada perkhidmatan di luar negara. Lihat senarai perkhidmatan dalam notis bahasa Inggeris dan bahagian Rancangan dan perjalanan untuk mengetahui penerima dan tujuannya.
- Data peribadi dipindahkan ke luar negara hanya atas dasar yang dibenarkan oleh seksyen 129. Jika Noren bergantung pada persetujuan untuk pemindahan, Noren memintanya secara berasingan. Noren akan memaklumkan Pesuruhjaya Perlindungan Data Peribadi Malaysia dan orang yang terjejas oleh pelanggaran data apabila dikehendaki oleh undang-undang.
- Hubungi {contact} bagi semua permintaan privasi. Anda boleh meminta akses kepada data peribadi anda, membetulkannya, mengehadkan penggunaannya atau menarik balik persetujuan. Anda juga boleh membuat permintaan bertulis secara elektronik supaya Noren menghantar data peribadi anda terus kepada pengawal data lain pilihan anda, jika boleh dilaksanakan secara teknikal dan format data serasi.
- Jika terdapat perbezaan antara notis bahasa Inggeris dan bahasa Melayu, teks bahasa Inggeris terpakai. Hak anda di bawah undang-undang Malaysia tetap terpakai.

### Terms line for `malaysia` (section `rules`, shown while on)

- **English**: Where Malaysian law applies to you, it applies to what you share here in addition to the rest of these terms.
- **日本語**：マレーシアの法律があなたに適用される場合、ここで共有するものには、この規約に加えてその法律も適用されます。
- **Bahasa Melayu (draf mesin)**: Jika undang-undang Malaysia terpakai kepada anda, ia terpakai kepada apa yang anda kongsi di sini sebagai tambahan kepada syarat-syarat ini.

---

## Part 2. `facts`

Switch on when `features.facts` is on. Privacy notice, section id `facts`.

### English

**Heading: Reports of a place's facts**

- A member can report what they found at a place, such as a step-free entrance or a prayer room. The report shows their display name and the day they made it.
- A report is the member's own account of what they saw. Noren displays it as their statement and does not use it as a rating or a count.
- Before a member whose display name is still unconfirmed can report, Noren asks them to agree to showing their name and the day with the report.
- When you remove your report, Noren hides it from everyone on the place page and keeps it marked as removed until you delete your account.
- An audit entry records that you submitted the report and no longer names you after account deletion.

### 日本語（ネイティブ確認待ち）

**見出し：場所についての事実の報告**

- 会員は、段差のない入口や礼拝室など、その場所で見つけたことを報告できます。報告には会員の表示名と報告した日が表示されます。
- 報告は会員が自分で見たことについての説明です。Noren はその人の言葉として表示し、評価や集計には使いません。
- 表示名をまだ確認していない会員には、報告とともに表示名と日付を表示することへの同意を、報告の前に求めます。
- 報告を取り消すと、その場所のページでは誰にも表示されなくなり、アカウントを削除するまで取り消し済みとして保管されます。
- 監査記録には報告を投稿したことが残りますが、アカウントを削除すると名前は残りません。

### Bahasa Melayu (draf mesin; belum disemak oleh penutur Bahasa Melayu)

**Tajuk: Laporan fakta tentang sesuatu tempat**

- Ahli boleh melaporkan apa yang mereka temui di sesuatu tempat, seperti pintu masuk tanpa tangga atau bilik solat. Nama paparan ahli dan hari laporan dibuat dipaparkan bersama laporan.
- Laporan ialah kenyataan ahli tentang apa yang dilihatnya sendiri. Noren memaparkannya sebagai kenyataan ahli dan tidak menggunakannya sebagai penilaian atau kiraan.
- Jika ahli belum mengesahkan nama paparannya, Noren meminta persetujuan sebelum ahli boleh melapor supaya nama dan hari itu dipaparkan bersama laporan.
- Apabila anda menarik balik laporan, Noren menyembunyikannya daripada semua orang di halaman tempat itu dan menyimpannya dengan tanda ditarik balik sehingga anda memadamkan akaun.
- Catatan audit merekodkan penghantaran laporan itu dan tidak lagi memaparkan nama anda selepas akaun dipadamkan.

### Terms line for `facts` (section `accuracy`, shown while on)

- **English**: A report of a fact must be what you saw yourself. Do not report what you only heard, copied or guessed, and do not report for someone else.
- **日本語**：事実の報告は、ご自身で見たことにしてください。聞いただけのこと、写したこと、推測は報告せず、他の人の代わりに報告もしないでください。
- **Bahasa Melayu (draf mesin)**: Laporan fakta mestilah apa yang anda lihat sendiri. Jangan laporkan apa yang anda hanya dengar, salin atau agak, dan jangan melapor bagi pihak orang lain.

---

## Part 3. `trip`

Switch on when `features.trip` is `"open"`. Privacy notice, section id `trip`.

### English

**Heading: Plans and trips**

- Your browser keeps the party description and your trips on this device, including names or labels you enter and the plan you receive.
- To make or update a plan, your browser sends Noren's server in Australia the route, days and any dates or pins, and group details such as age bands, rules and likes under traveller keys without their names or labels. Noren uses these details to choose places and returns the plan. The trip planner writes neither the request nor the resulting plan to its database.
- When you press Read what I wrote, Noren sends your words, the language and, for changes, a short outline with days, slots, place names and item types to its configured planning AI service for suggestions. Noren uses the planning service described in the service list, which can be Meta Platforms or Anthropic in the United States. The planner does not send the separate group description to that service. Any names or needs in the words you send can reach it. If you use Noren's recorder, the separate speech-recognition agreement covers sending the recording, as described under AI and your words.
- Dietary and access needs may reveal religious beliefs or health information. Beside the plan, change and AI buttons, Noren explains what each action sends and where, and asks you to agree by pressing the button. Noren records the date you agreed and which wording you agreed to, and deletes that record with your account.
- Include only what the plan needs. Get each traveller's agreement before sending their personal details. For a traveller under 18, get agreement from a parent, guardian or someone with parental responsibility.
- If you make a share link, Noren stores its code, your account ID, the trip's device ID and region, and the shared title and itinerary. The itinerary can include dates, routes, stops, labels for pins or whose turn it is, and checks shown at stops without saying who needs them. Anyone with the link can read it. Noren deletes the link record when you switch it off or delete the account. Links have no automatic expiry.
- To prevent abuse, Noren counts plan and AI requests per account in one-minute and 24-hour windows and share-link requests in 24-hour windows. Each count resets on the next request after its window ends. Noren deletes these counts when you delete your account.

### 日本語（ネイティブ確認待ち）

**見出し：プランと旅行**

- 同行者の説明や旅行の情報、入力した名前や呼び名、受け取ったプランは、この端末のブラウザに保存されます。
- プランを作るか更新するとき、ブラウザは道順、日数、入力した日付やピン、年齢層、必要な配慮や好みなどを、オーストラリアにある Noren のサーバーに送ります。同行者の情報には識別用のキーを使い、名前や呼び名は送りません。Noren はこの情報で場所を選び、プランを返します。依頼の内容や結果のプランをデータベースには保存しません。
- 「書いたことを読んでもらう」を押すと、Noren は提案を出すために、入力した言葉と言語を、変更時には日、枠、場所名、項目の種類を含む概要も、設定されたプラン作成用の AI に送ります。送り先はサービス一覧にある米国の Meta Platforms または Anthropic です。別の質問で入力した同行者の説明は送りません。この欄に書いた名前や必要な配慮は AI に届く場合があります。Noren の録音機能で音声を送るときは、「AI とあなたの言葉」にある音声認識への別の同意が必要です。
- 食事や移動の配慮から、宗教上の信条や健康状態が分かることがあります。プランの作成・変更や AI への送信ボタンのそばに、送る内容と送り先を表示し、ボタンを押して同意するようお願いします。Noren は同意した日と同意文の版を記録し、アカウントを削除するとその記録も削除します。
- プランに必要なことだけを入力してください。同行者の個人情報を送る前に、本人の同意を得てください。18 歳未満の場合は、親、後見人、または親としての責任を負う方の同意を得てください。
- 共有リンクを作ると、Noren はリンクのコード、アカウントの識別子、端末上の旅行の識別子と地域、共有する題名と旅程を保存します。旅程には日付、道順、立ち寄り先、ピンや誰の番かを示す呼び名、誰のためかは表示しない確認項目が含まれる場合があります。リンクを知っている人は誰でも見られます。リンクをオフにするかアカウントを削除すると、リンクの記録を削除します。リンクに自動で切れる期限はありません。
- 不正利用を防ぐため、Noren はアカウントごとに、プランと AI への依頼を 1 分と 24 時間の枠で、共有リンクの作成・更新を 24 時間の枠で数えます。枠が終わった後の次の依頼で数え直し、アカウントを削除すると回数の記録も削除します。

### Bahasa Melayu (draf mesin; belum disemak oleh penutur Bahasa Melayu)

**Tajuk: Rancangan dan perjalanan**

- Pelayar pada peranti ini menyimpan penerangan kumpulan dan perjalanan anda, termasuk nama atau gelaran yang anda masukkan dan rancangan yang anda terima.
- Untuk membuat atau mengemas kini rancangan, pelayar anda menghantar laluan, bilangan hari, tarikh atau pin yang dimasukkan, serta butiran kumpulan seperti julat umur, keperluan dan kegemaran kepada pelayan Noren di Australia. Butiran kumpulan menggunakan pengecam tanpa nama atau gelaran. Noren menggunakan butiran ini untuk memilih tempat dan memulangkan rancangan. Perancang perjalanan tidak menyimpan permintaan atau hasil rancangan dalam pangkalan datanya.
- Apabila anda menekan butang untuk membaca tulisan anda, Noren menghantar kata-kata anda dan bahasa kepada AI perancang untuk mendapatkan cadangan. Jika anda meminta perubahan, Noren turut menghantar ringkasan yang mengandungi hari, slot, nama tempat dan jenis item. Perkhidmatan yang ditetapkan boleh jadi Meta Platforms atau Anthropic di Amerika Syarikat, seperti dalam senarai perkhidmatan. Penerangan kumpulan daripada soalan lain tidak dihantar kepada AI itu. Nama atau keperluan dalam kata-kata yang anda hantar boleh diterima oleh AI itu. Jika anda menggunakan perakam Noren, penghantaran rakaman memerlukan persetujuan berasingan untuk pengecaman suara seperti yang diterangkan dalam bahagian AI dan kata-kata anda.
- Keperluan makanan dan akses boleh mendedahkan kepercayaan agama atau maklumat kesihatan. Di sebelah butang untuk membuat atau mengubah rancangan dan menghantar kata-kata kepada AI, Noren menerangkan apa yang dihantar dan ke mana, lalu meminta anda bersetuju dengan menekan butang itu. Noren merekodkan tarikh anda bersetuju dan versi teks yang anda persetujui, lalu memadamkan rekod itu apabila anda memadamkan akaun.
- Masukkan hanya maklumat yang diperlukan untuk rancangan. Dapatkan persetujuan setiap orang sebelum menghantar butiran peribadi mereka. Bagi orang di bawah umur 18 tahun, dapatkan persetujuan ibu bapa, penjaga atau orang yang mempunyai tanggungjawab ibu bapa.
- Jika anda membuat pautan kongsi, Noren menyimpan kod pautan, ID akaun, ID perjalanan pada peranti dan rantau, serta tajuk dan jadual perjalanan yang dikongsi. Jadual itu boleh mengandungi tarikh, laluan, tempat singgah, label pin atau giliran seseorang, serta semakan di tempat singgah tanpa menyatakan siapa yang memerlukannya. Sesiapa yang mempunyai pautan boleh membacanya. Noren memadamkan rekod pautan apabila anda mematikannya atau memadamkan akaun. Pautan tidak luput secara automatik.
- Untuk mencegah penyalahgunaan, Noren mengira permintaan rancangan dan AI bagi setiap akaun dalam tempoh satu minit dan 24 jam, serta permintaan pautan kongsi dalam tempoh 24 jam. Setiap kiraan bermula semula pada permintaan pertama selepas tempohnya tamat. Noren memadamkan kiraan ini apabila anda memadamkan akaun.

### Terms line for `trip` (section `planner`, shown while on)

- **English**: A plan is a suggestion drawn from places members have written about. It is not a promise that a place is open, suitable or safe. Check before you go, and do not rely on it for a medical, dietary or safety need.
- **日本語**：プランは、会員が書いた場所から引いた提案です。その場所が開いている、合っている、安全だという約束ではありません。出かける前に確かめ、医療・食事・安全に関わる必要のためにこれだけに頼らないでください。
- **Bahasa Melayu (draf mesin)**: Rancangan ialah cadangan yang diambil daripada tempat yang ditulis oleh ahli. Ia bukan jaminan bahawa sesuatu tempat dibuka, sesuai atau selamat. Semak sebelum anda pergi, dan jangan bergantung padanya untuk keperluan perubatan, diet atau keselamatan.

---

## Position and sources

Official sources checked for the 24 November 2026 decision.

- **Coverage and commencement.** Noren applies Act 709 to its Malaysian coverage. Sections 2 and 4 cover personal data in respect of commercial transactions, including matters relating to supply of services. Statutory coverage for this free service has no confirmed ruling here. Amendment Act A1727 took effect in three groups. Sections 7, 11, 13 and 14 took effect on 1 January 2025. Sections 2–5, 8, 10 and 12 took effect on 1 April 2025, including the change to outbound transfers. Sections 6 and 9 took effect on 1 June 2025, including DPO appointment, breach notification and portability. [Act 709](https://www.pdp.gov.my/en/akta/pdp-act-2010-en/) · [Act A1727](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf) · [Gazette P.U. (B) 522](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf)
- **Notice, choices and contact.** Section 7(1)–(3) requires the statutory notice and necessary means to exercise choices in Malay and English. English governs differences as Noren's editorial position, subject to statutory rights. The existing contact receives every request. Regulation 4 also calls for the contact person's role and a phone number. The contact can be the operator role, but the current takedown link supplies neither a published phone number nor Malay choice flows. The three Malay sections expressly refer readers to English for the rest. Full bilingual coverage of section 7(1), a reachable bilingual request path and the required contact particulars need verification or completion before release. [Act 709, s. 7](https://www.pdp.gov.my/en/akta/pdp-act-2010-en/) · [2013 Regulations, reg. 4](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/07/Peraturan-peraturan-Perlindungan-Data-Peribadi.pdf)
- **DPO.** Noren's position is that appointment is not currently required on the stated scale and observed processing. Section 12A and Circular 1/2025 require a DPO for processing involving more than 20,000 people, sensitive personal data including financial information involving more than 10,000 people, or regular and systematic monitoring at any scale. The trip runs on request and the server's account counters limit use. The guidance distinguishes basic loyalty-account operation from monitoring behaviour for recommendations. Reassess across all processing, including analytics, tracking or profiling. Live telemetry and the full subject counts are UNVERIFIED. [DPO Circular](https://www.pdp.gov.my/wp-content/uploads/2025/02/Pekeliling-DPO.pdf) · [DPO guideline, §§4.2–4.5](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_DPO_ENG.pdf)
- **Registration.** Noren's position is that a free trip-planning site with the stated activities falls outside the scheduled classes. The tourism and hospitality class covers the specified licensed tourism operators and registered tourist accommodation. The 2016 amendment added other classes and named entities and left tourism unchanged. The 2026 circular confirms that registration follows the two orders and revokes the 2024 circular from 1 June 2026. The test is the controller's class. [Act 709, ss. 13–15 and Schedule item 5](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/07/Perintah-Perlindungan-Data-Peribadi-.pdf) · [2016 order](https://www.pdp.gov.my/wp-content/uploads/2024/07/PerintahPindaan2016.pdf) · [Registration Circular 1/2026](https://www.pdp.gov.my/wp-content/uploads/2026/06/Pekeliling-Pesuruhjaya-Bil.1-2026.pdf)
- **Breaches.** Section 12B(1) uses a reason-to-believe trigger and requires notice as soon as practicable. Circular 2/2025 and the guideline set the Commissioner's reporting criteria and 72-hour timeframe. Significant harm includes compromised sensitive data, risk of identity fraud or other serious harm, or significant scale (more than 1,000 affected). Under section 12B(2), notify those facing actual or likely significant harm without unnecessary delay and within seven days of the initial Commissioner notice. The notification duties apply at any controller size. Use the guideline's timing examples and keep a breach register, including breaches below the notification threshold, for at least two years. [Act A1727, s. 6](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf) · [Breach Circular](https://www.pdp.gov.my/wp-content/uploads/2025/02/Pekeliling-DBN.pdf) · [Breach guideline, §§5–10 and 14](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_DBN_ENG.pdf)
- **Portability.** Section 43A applies at any size. Send electronic written requests through the existing contact for direct transmission to a controller of the person's choice, subject to technical feasibility and format compatibility. A prescribed deadline beyond the Act's reference to one is UNVERIFIED. [Act A1727, s. 9](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf)
- **Overseas transfers.** Amended section 129 removed the ministerial whitelist and paragraph (3)(h). Subsection (2) permits transfers to places with substantially similar law or at least equivalent protection. Subsection (3)(a)–(g) retains consent, the two narrowly applicable contract grounds, legal proceedings or rights, limited unavoidable adverse-action cases, reasonable precautions and due diligence, and vital interests. Consent requires prior notice and a maintained record. Noren's position is to document the ground and receiver for each transfer. The [transfer register](transfer-register.md) records the flows and the release evidence still to confirm. Continuing to use the service supplies no consent. [Act A1727, s. 12](https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf) · [Transfer guideline, §§4, 7, 12, 15–16](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf)
- **Sensitive data and children.** Sections 4 and 40(1)(a) cover identifiable health and belief data and require explicit consent on the consent basis. The new disclosures pair the data, destination and purpose with the action that sends it, including voice before the existing speech-recognition checkbox. The organiser's press is affirmative for their own data. Regulation 3 requires maintainable proof from the data subject or, for anyone under 18, their parent, guardian or person with parental responsibility. The trip actions record the organiser’s first acceptance time for the current wording and delete that receipt with the account. The existing voice checkbox is local. Evidence of consent from companions and from the responsible adults for minors remains UNVERIFIED. [Act 709, ss. 4 and 40](https://www.pdp.gov.my/en/akta/pdp-act-2010-en/) · [2013 Regulations, reg. 3](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/07/Peraturan-peraturan-Perlindungan-Data-Peribadi.pdf)
- **Retention.** Sections 10(1)–(2) require keeping personal data only as long as needed and taking reasonable steps to delete it when that need ends. Trip counters and the consent record are deleted with the account. Report audit entries remain and point to the emptied person row. A justified retention period for the audit entry remains UNVERIFIED. [Act 709, s. 10](https://www.pdp.gov.my/en/akta/pdp-act-2010-en/)

Before enabling the three switches together, confirm the open release checks above, verify the transcription recipient and document the applicable transfer grounds, and set the release's new `legal.documentsVersion`. The Malay and Japanese review labels stay in place while those reviews are pending.

# Instagram sharing: opt-in and share kit

**Feature branch**: `instagram-share-kit`

**Written**: 9 Nov 2026, from the owner's decisions of 8 Nov 2026.

**Status**: Phase 1 built and checked on the dev deployment. **Not deployed**: it changes the words the live terms and privacy notice quote, so the owner has to approve the notice first (see "The notice has to change with it"). Phase 2 is a plan only.

This folder shares the number 003 with `specs/003-story-photos`, as the owner asked for the path. Rename it if the clash matters.

## The owner's decisions (8 Nov 2026)

- Noren's own Instagram may post only stories written on Noren whose writer opted in. Never found posts (Google reviews, Instagram, blogs), which belong to their writers.
- Phase 1 is the share kit. Phase 2 adds a steward approval queue and automatic posting through Instagram's API, once the owner has a Business account and a Meta app.

## What was already there

The share work of 7 Nov (commit d19a983) already had: the picture route `/api/share/<story>` (1080 x 1350 feed and 1080 x 1920 story sizes), a tick on the write form stored as `story.shareConsentAt`, a steward page that lists ticked stories for hand posting with "Mark as posted", and a section in the terms and privacy notice describing it. Phase 1 builds on that. It adds no second opt-in.

**Deviation from the brief:** the opt-in is stored as the existing `shareConsentAt` (the time the writer ticked it; absent means not opted in), not as a new boolean. A boolean beside it would have been a second source of truth for the same choice. Stories written before the tick, and every story on prod today (0 of 9 are ticked), count as not opted in.

## Phase 1 as built

### The opt-in

- An unticked box on the write-a-story form, only while the region offers it (`sharing.norenAccount`).
  - English: **Noren and this place may share my story on Instagram, with my name.**
  - Japanese (unreviewed): **Noren とこの場所が、私の名前を添えて、この話を Instagram で紹介してもかまいません。**
  - Under it, in plain words: it is optional and off unless ticked; "this place" means its verified owner on Noren; they copy the story with the name and post it by hand; Noren never posts by itself; it can be changed on the story at any time.
- The writer changes it later, on their own story, from the same place as the kit: "Allow this" and "Stop allowing" (「許可する」「許可をやめる」). It is `storyShare.setShareConsent({ storyId, on })`, writer only. A page opened before the change that still calls `storyShare.withdraw` keeps working.
- Every real change is audited (`story.share_consent_given`, `story.share_consent_withdrawn`, with `diff: { shareConsent }`), including the tick made in the form. Asking for the state a story is already in changes and records nothing. Turning it on needs a live story and a region that offers it; turning it off is always allowed.
- Errors reach the page as `ConvexError` codes (`forbidden`, `conflict`, `invalid_input`), because prod Convex redacts messages.

### The kit ("Share on Instagram")

| Viewer | Sees the kit on a story |
| --- | --- |
| The story's writer | Always, for their own story, ticked or not |
| The place's verified owner | Only while the writer's tick is on |
| A steward | Only while the writer's tick is on |
| Anyone else, a visitor, the place's pin-adder | Never |

The rule lives in one place, `kitViewer` in `convex/storyShare.ts`, behind the query `storyShare.kit`, which returns nothing to anyone the rule excludes. The story feed asks only for the viewer's own stories, or for every story when the viewer manages the place. A linked post, and a post found in public words, is not a story row and never asks.

What the kit gives:

- **Picture:** 1080 x 1350, the existing feed size (the 1080 x 1920 story size stays a second choice). Drawn without the story's photos, because faces may be in them (`?photo=0`; the route still includes a photo where it is not asked to leave it out, as the steward queue does).
- **Caption:** the story in its own language; the other language only where a translation passed its check; "Story by <name> on Noren", or 「<name> さんの物語（Noren より）」 for a Japanese story; the place in English with the Japanese beside it; `noren.yooi.me` as plain text; hashtags: the town in both languages (`#長崎 #Nagasaki` or `#島原 #Shimabara`), the place's name made hashtag-safe, in English and in Japanese, and `#Noren`. It is held under 2,200 characters and 30 hashtags: if room runs out, the translation goes first, then the end of the story, so the credit and the hashtags always stay.
- **Buttons:** "Copy caption" and "Save picture". Where the browser can send a picture file to the share sheet (`navigator.canShare({ files })`), also "Share from this phone", so Instagram can be picked.
- Noren calls neither Instagram nor Meta, and adds no outside service or script.

Town comes from new `towns` data in `regions/nagasaki.json` (Nagasaki and Shimabara, 15 km circles; the nearest circle holding the pin; the region's own name where none does). The existing `neighbourhoods` were too small for this: Shimabara station is outside the castle-town circle.

The steward queue now uses the same caption builder and carries the town, so a hand-posted story reads the same as a kit one.

### Known limits

- Written stories have no translations yet (only found posts and interview statements do), so a kit caption is in one language today. The caption builder takes a checked translation when one exists.
- The steward queue's picture links still include the story's first photo, as the notice says. The owner may want them photo-free like the kit.
- A demo story, a hidden story and a place that is not public get no kit.

### Tests

Convex (`convex/storyShare.test.ts`): who may change the tick; audit entries; the kit's viewer matrix with a verified owner, an owner of another place, a steward, the pin-adder, another member and a visitor; opt-in default off; a story written before the tick; no kit for a found post; the town. Unit: the caption builder (both languages, credit, hashtags, both limits, translation dropped first), the kit panel (copy, save, share sheet, consent control per viewer, both languages), the feed (which stories ask), the picture route without photos. Dev flow: real signed-in members on the dev deployment (writer, owner, steward, another member, a visitor), through the real components, at 390 px and desktop.

## The notice has to change with it

`src/lib/i18n/messages/legal-documents.ts` says to change its words and `documentsVersion` in the same change as anything that makes the sharing section wrong. Phase 1 does, and this work was told not to touch that file or `documentsVersion`. The live notice and terms:

- quote the old words “Share as a picture”, “Noren may share this on its own accounts, credited to you” and “Take back”;
- say only "a person at Noren" posts a ticked story, not the place's owner;
- say the picture carries the first photo (still true of the steward queue, no longer of the writer's own picture).

Proposed replacement for the privacy notice's second and third paragraphs of "Pictures of your story and Noren's own accounts", for the owner to approve (the Japanese is unreviewed):

> On each of your own stories you can choose “Share on Instagram”. Noren draws a picture from the words, the place name, your display name and our web address, never your photos, only while the story is shown on Noren, and writes a caption for it. Nothing is sent to Instagram: you copy the caption and save the picture, and post it yourself.
>
> If you tick “Noren and this place may share my story on Instagram, with my name” when you write a story, a person at Noren, or the place's verified owner on Noren, may post your story (its words and your display name) on their own Instagram account, using the same picture and caption. They post it by hand; Noren never posts by itself. Ticking is your choice and is off unless you tick it. Noren records that you ticked it and when. You can change it at any time from your own story: choose “Allow this” or “Stop allowing”. A post already made stays up until whoever made it takes it down. Ask us at {contact} and we will delete the ones Noren made within 14 days, and ask the place to remove theirs.

> 自分の話ごとに「Instagram でシェアする」を選べます。Noren は、話が Noren で表示されている間に限り、本文、場所の名前、表示名、Noren のウェブアドレスから画像を作り（写真は使いません）、キャプションも書きます。Instagram には何も送りません。キャプションをコピーし、画像を保存して、ご自身で投稿します。
>
> 話を書くときに「Noren とこの場所が、私の名前を添えて、この話を Instagram で紹介してもかまいません」にチェックを入れると、Noren の担当者、または Noren に確認済みのその場所のオーナーが、同じ画像とキャプションで、あなたの話（本文と表示名）を自分たちの Instagram アカウントに手で投稿することがあります。Noren が自動で投稿することはありません。チェックはご自身の選択で、入れない限りオフです。チェックを入れたこととその日時を Noren は記録します。いつでもご自身の話から「許可する」「許可をやめる」で変えられます。すでに投稿されたものは、投稿した方が削除するまで残ります。{contact} にご連絡いただければ、Noren が投稿したものは14日以内に削除し、場所のオーナーが投稿したものは削除を依頼します。

The terms' line "you also allow the operator to post its words, your first photo and your name there" would read "you also allow Noren, and the verified owner of the place, to post its words and your name on Instagram".

Order to ship: the owner approves this wording, the file and `documentsVersion` change in one change, then phase 1 is merged and deployed.

## Phase 2 plan (not built)

1. **Steward queue.** The existing queue (`storyShare.queue`) gains an approve step: a steward approves a ticked story, and only approved stories are queued for posting. A story whose tick is turned off, or that is hidden, leaves the queue before it is posted.
2. **Publishing.** An internal action calls Instagram's content API (Instagram API with Instagram login): create a media container (`image_url`, `caption`), wait for its status to read finished, then publish it. It needs the permission `instagram_business_content_publish` (and `instagram_business_basic`).
3. **The image** is hosted as a public JPEG, because Instagram fetches it from our address and takes JPEG only for a feed post. The picture route's PNG goes through `sharp` (already a dependency) at 1080 x 1350, 4:5, without photos. The same caption builder gives the caption.
4. **The token** is a long-lived Instagram user token, valid 60 days. It is kept in Convex env and refreshed before the 60 days run out (the refresh call needs a token at least a day old and not yet expired), by a cron that runs weekly. A Convex function cannot change an environment variable, so the refreshed token and its expiry would sit in an internal table no client query returns, with the env variable seeding it. This differs a little from "kept in env" and is for the owner to confirm.
5. **The daily cap** is never typed into the code. Before each post the action reads `content_publishing_limit` (`quota_usage` against `config.quota_total`) and holds the post until the window has room.
6. **Audit and takedown.** Every post is audited with the story, the steward and the Instagram media id. A tick turned off, or a takedown, shows in the queue as "posted, delete by hand" until deletion through the API is built.
7. Check Meta's current documentation while building: names, versions and limits there change.

## The owner's setup steps (phase 2)

1. Turn Noren's Instagram account into a **Business** (professional) account, and link nothing else to it.
2. In Meta for Developers, make an app and add the **Instagram** product with **Instagram login** ("API setup with Instagram login"). Ask for `instagram_business_basic` and `instagram_business_content_publish`.
3. Add the Instagram account as an **Instagram tester** under the app's roles, and accept the invitation in the Instagram app. While only accounts with a role use the app, it can stay in development mode.
4. Generate the long-lived token for that account in the app dashboard, and **set it yourself**, leaving the value off the command so it is typed in or piped from the clipboard and stays out of your shell history: `npx convex env set INSTAGRAM_ACCESS_TOKEN --prod`. Never paste it into a chat, a file or a commit message, and if you pipe it use `printf "%s"`, not `echo`, so no newline is stored with it.
5. Tell the session the Instagram account's numeric id (not a secret) and the app id, so they go in the region config.

## Proposed line for the privacy page, phase 2

For the owner to approve; `legal-documents.ts` is not touched here. It belongs under "Pictures of your story and Noren's own accounts", once Noren posts through Instagram's own interface and not only by hand:

> When a person at Noren has approved a story you ticked, Noren may post it, with your display name, on its own Instagram account through Instagram's own interface, so Instagram receives the picture, the caption and Noren's account details. Untick it on your story and Noren will not post it; a post already made stays up until we delete it, which we do within 14 days of your asking at {contact}.

> あなたがチェックを入れた話を Noren の担当者が承認すると、Noren は Instagram の公式の仕組みを通じて、あなたの表示名を添えて Noren の Instagram アカウントに投稿することがあります。その際、Instagram には画像、キャプション、Noren のアカウント情報が送られます。ご自身の話でチェックを外せば投稿しません。すでに投稿されたものは、{contact} に依頼いただいてから14日以内に Noren が削除するまで残ります。

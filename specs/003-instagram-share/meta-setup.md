# Connecting Noren to Instagram: the steps only the owner can do

About 30 minutes, once. Every step is from Meta's current documentation unless it says **not confirmed**. Meta changes its screens often; if a name differs, look for the closest one. Never paste the token into a chat, a file, a commit or a ticket.

Pages used (checked 18 Nov 2026):
developers.facebook.com/docs/instagram-platform/content-publishing,
.../instagram-api-with-instagram-login/get-started,
.../instagram-api-with-instagram-login/business-login.

## Before you start

- Automatic posting goes out under Noren's Instagram account, with the writer's name, only for stories whose writers ticked the box and a steward approved. The notice and terms must say so first (see "Proposed wording" in the build report). Do not do step 8 before that is live.

## Steps

1. **Make the account professional.** In the Instagram app, switch Noren's account to a professional account (Business or Creator both appear in Meta's docs as valid). The menu path in the Instagram app is **not confirmed** here.
2. **No Facebook Page is needed for this route.** Meta's setup guide for "Instagram API with Instagram login" does not mention a Page. (The other route, "with Facebook login", does need one; Noren does not use it.)
3. **Make the app.** Go to developers.facebook.com, My Apps, Create app. Choose the **Business** app type (the guide says to use it; make a new app if yours is another type).
4. **Open the Instagram setup.** In the app dashboard go to **Instagram > API setup with Instagram business login**. The permissions Noren needs are `instagram_business_basic` and `instagram_business_content_publish`.
5. **Add the Instagram account** to the app in that same screen. Meta says Standard Access is enough for an account you own and have added to the app; **you do not need App Review** for that. (The same page only says App Review is needed for Advanced Access, for other people's accounts.) Whether the account must also be given a role such as Instagram tester first is **not confirmed**; if the dashboard asks for it, accept the invitation in the Instagram app.
6. **Generate the token.** Next to the account, click **Generate token**, log in to Instagram, and copy the token. A token made this way lasts **60 days**.
7. **Get the account id** (a number, not secret) and **set both values**, in a terminal, from the project folder. The token is read without echo and piped in, so it never reaches your shell history; `printf "%s"` stores no trailing newline.

   ```
   read -rs IG_TOKEN
   curl -sG "https://graph.instagram.com/v23.0/me" \
     --data-urlencode "fields=user_id,username" \
     --data-urlencode "access_token=$IG_TOKEN"
   ```

   Look for `user_id` in the answer (Meta: it is the professional account's id) and check `username` is Noren's account. Then:

   ```
   printf "%s" "$IG_TOKEN" | npx convex env set INSTAGRAM_ACCESS_TOKEN --prod
   printf "%s" "PASTE_THE_USER_ID_HERE" | npx convex env set INSTAGRAM_ACCOUNT_ID --prod
   unset IG_TOKEN
   ```

   Piping into `npx convex env set NAME` is documented by `npx convex env set --help`.
8. **Turn the switch on.** In `regions/nagasaki.json`, under `sharing`, set `"autoPost": true`. Optional pacing, same place: `"autoPostSchedule": { "perDay": 2, "hourJst": 10 }` (at most 2 a day, none before 10:00 Japan time; leave it out to post at once). Land it as a normal change.
9. **Try it** on a story you are happy to see on the account: on the steward page, "Stories to share", press **Approve and post to Instagram**. It should show "Posted" with a link within a minute or two. If the page says Instagram is not connected, one of the two values is missing or the account id is not a plain number.
10. **Renew every 50 days or so.** The token lasts 60 days and Noren cannot renew it itself (a Convex function cannot change its own environment values, and the token is never stored in the database). Repeat steps 6 and 7 for the token only. The steward screen warns from 14 days before the end, counted from the day a new token is first seen. Meta also documents a refresh call (`https://graph.instagram.com/refresh_access_token`, `grant_type=ig_refresh_token`, token at least 24 hours old and not expired); regenerating in the dashboard is simpler.

## Things not confirmed from the docs

- The exact Instagram app menu for switching to a professional account.
- Whether an Instagram tester role is required for your own account in a development-mode app.
- Whether Instagram's servers can fetch pictures through Vercel's bot protection; see the build report. Test with step 9.
- The pinned API version `v23.0` in `convex/lib/instagramApi.ts`; Meta's pages show no version for these calls.
- Meta's pages disagree on the daily publishing limit (100 in one place, 50 in another). Noren asks Instagram's `content_publishing_limit` before each post and holds the post when it is full, so it does not depend on either number.
- Instagram does not let this route delete a post: deleting is documented only for the Facebook-login route. A post that has to come down shows as a task on the steward page with its link.

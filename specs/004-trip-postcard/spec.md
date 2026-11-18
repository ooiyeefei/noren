# Trip postcard (version 1: e-postcard)

Behind `features.postcard` in the region file (off by default, off in `regions/nagasaki.json`).

## What it does
- A signed-in member picks one to eight of their own moments (a live story they wrote, or a place they hold a stamp for), one per place, says who it is for, and writes a message. "Help me write it" drafts a start; the member edits it or writes alone. What is sent is the member's final text.
- The member gets a private link, `/{lang}/postcard/{24-character random code}`. Anyone with it reads the card with no account: front composed from the member's own live photos, the places' stamps, the town and the day; the message; "from"; each place linking to its public page.
- The member lists their cards and deletes one; its link stops working in the same transaction. Account deletion deletes their cards.

## Rules
- The card copies nothing: each read works out what still shows (story live and shown, photo live, place public and real). A removed story or photo leaves the card at once. The message is the sender's own text and stays until they delete the card.
- AI (Principle V): the draft uses the model that drafts a member's line from their own post (AI_MODEL_WRITE_STORY), the "draft" daily pool and a five-a-minute limit. It is sent the place names, who it is for, the member's few words, and the words of a story only when its writer ticked "allow AI to read" (story.connectorAllowedAt). The draft is checked in code (no link or contact, no number the input did not hold) and fails closed to writing by hand. A card whose message began as a draft says so.
- Pages are noindex (`PRIVATE_SECTIONS`), the link preview picture carries names only, and the referrer is withheld from the photo host.

## Later: print and post (not built)
A separate table pointing at `postcard` (postcardId, delivery address held only until posted, status, provider reference), a consent and payment step, and an address-erasure rule. `postcard` needs no change.

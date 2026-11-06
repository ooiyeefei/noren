# Feature Specification: Photos on a written story

**Feature Branch**: `story-photos`

**Created**: 2026-11-06

**Status**: Built and switched off (`photos.enabled: false`). See [plan.md](./plan.md).

**Input**: Owner, 6 Nov 2026: Google Maps reviews offer stars, text and photos or videos. Noren wants the photos. Stars stay out (FR-015). Videos are not part of this.

Requirements here start at FR-201 so they don't collide with `specs/001-noren-mvp` or `specs/002-noren-collection`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add photos to a story (Priority: P1)

A member writes what they tasted at a place and adds two photos from their phone. The story shows on the place's page with their photos and their name.

**Why this priority**: This is the feature.

**Independent Test**: As an established member, write a story with one iPhone photo. See it on the place's page while signed out, and open the served file to find no location or camera data in it.

**Acceptance Scenarios**:

1. **Given** the feature is on and a signed-in member is writing a story, **When** they pick up to 4 photos and share, **Then** the story shows with those photos in the order they picked them.
2. **Given** a photo with GPS and camera data, **When** it is stored, **Then** the stored file holds no metadata of any kind.
3. **Given** a member with no text in the story, **When** they press Share with photos picked, **Then** the form asks for the text and nothing is shared.
4. **Given** the feature is off or the storage settings are missing, **When** anyone uses Noren, **Then** no photo control shows, the routes refuse, and everything else works as before.

---

### User Story 2 - A new member's photos wait for a steward (Priority: P2)

A member who joined this week adds a photo. They see it on their story marked as waiting. Nobody else does until a steward approves it.

**Why this priority**: Open sign-up lets anyone in. A stranger's first upload should not reach the public unseen.

**Independent Test**: With an account under 7 days old, add a photo. Check it is missing when signed out, then approve it from the steward page and see it appear.

**Acceptance Scenarios**:

1. **Given** a `user` within `collection.newAccount.days` of joining, **When** they attach a photo, **Then** only they and stewards see it.
2. **Given** a waiting photo, **When** a steward approves it, **Then** everyone who can read the story sees it, and the approval is in the audit log.
3. **Given** any other member, **When** they attach a photo, **Then** it is live at once.

---

### User Story 3 - A removal is real (Priority: P1)

A person asks for a photo of them to be taken down. A steward removes it, and the file leaves storage. The link stops working within the cache time.

**Why this priority**: A takedown that only hides a row is not a takedown.

**Independent Test**: Remove a photo. See it gone from the page at once, then see the object gone from the bucket within a minute, and the served link answer with an error after an hour.

**Acceptance Scenarios**:

1. **Given** a photo, **When** its writer, the place's editor or a steward removes it, **Then** it leaves the page at once and its object is deleted from storage.
2. **Given** a story with photos, **When** the story is removed, **Then** its photos are removed the same way.
3. **Given** storage is failing, **When** a photo is removed, **Then** the deletion is kept and retried, and stewards see that it is still pending.
4. **Given** anyone else, **When** they try to remove a photo, **Then** they are refused.

---

### User Story 4 - Respect an owner who asks for no photos (Priority: P2)

An owner has confirmed "Owner asks for no photography" for their place. Members writing a story there see no photo control.

**Independent Test**: Give a place a confirmed `no_photography` caution. See the control gone, and see the upload route refuse a direct call.

**Acceptance Scenarios**:

1. **Given** a place with that caution owner-confirmed, published or disputed, **When** a member writes a story there, **Then** no photo control shows and the server refuses at every step.
2. **Given** photos already on the place when the caution arrives, **When** anyone looks, **Then** only each photo's writer and stewards still see it, and they can remove it.

### Edge Cases

- A member picks photos, then cancels: the rows stay unattached and a cron removes them with their objects after about a day.
- A file renamed to `.jpg` that holds SVG, GIF, PNG, WebP or anything else: the second route refuses it because only a real JPEG passes.
- A JPEG with more pixels than `maxInputPixels`: refused before it is decoded in full.
- A rotated phone photo: the rotation is applied to the pixels before the metadata goes, so it stays upright.
- A bypassed browser step that sends a large image: the server shrinks it to `maxEdgePixels` anyway.
- A member calls Convex directly to mark an upload finished: the row can only point at a final key Convex chose, which only the server can write, so at worst their own story shows a missing image.
- The same upload finished twice: the second call changes nothing and never deletes the stored file.
- A photo row removed while the second route is still working: the route deletes what it just wrote.
- A demo account: refused. A fictional place: refused.
- A waiting photo's address is unguessable but not private. Anyone who is given the link can open it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-201**: A photo MUST belong to a written story. The story's text stays required. A story holds at most `photos.maxPerStory` photos.
- **FR-202**: All numbers MUST live in the region's `photos` block. When `enabled` is false or the server's storage settings are missing, no photo control shows and the routes refuse.
- **FR-203**: The browser MUST shrink each picture to at most `maxEdgePixels` and JPEG before sending it, and refuse SVG and GIF files.
- **FR-204**: A signed-in route MUST give a short-lived upload permit for one random `incoming/` key, with a size limit and a JPEG content type. The client never names a key.
- **FR-205**: A second route MUST check the uploaded file is a real JPEG within the pixel limit, re-encode it with all metadata removed, write it under `photos/` at a random key, delete the incoming object, and record it. No check made in the browser counts.
- **FR-206**: `stories.add` MUST take optional `photoIds` and attach only the caller's own finished, unattached photos of that place. Unattached photos MUST be removed by a bounded cron after `unattachedHours`.
- **FR-207**: A `user` within `collection.newAccount.days` of joining MUST have photos stored as waiting, seen only by them and stewards until a steward approves in the waiting section of the steward page. Other members' photos go live at once.
- **FR-208**: The writer, the place's editor or a steward MUST be able to remove a photo. Removing a story MUST remove its photos. A steward removing someone else's photo, and every approval, MUST be audited.
- **FR-209**: A daily `photo` limit MUST apply: `collection.newAccount.perDay.photo` for a new member, `photos.perDay` otherwise, none for a steward. Demo accounts MUST NOT upload.
- **FR-210**: On a place carrying the region's `photos.refusingCaution`, the control MUST be hidden and the server MUST refuse. Photos already there show only to their writer and stewards.
- **FR-211**: The form MUST say, in both languages: photos are shown publicly with your name, add only photos you took, and ask people before showing their faces.
- **FR-212**: Removal MUST delete the object from storage, retrying until it succeeds, and stewards MUST see when a deletion has failed. A served object MUST expire from the cache within `cacheSeconds`.
- **FR-213**: Photos MUST be served from a configured public address. Convex stores keys and never full addresses. A photo's file MUST carry the same "hidden from search" header as every page (FR-021).
- **FR-214**: A story card MUST show photos with lazy loading, fixed dimensions and alt text, and look right at 390 px. No star, score, count or ranking comes with them (FR-015).
- **FR-215**: A helper MUST remove all of one person's photos, for account deletion (T063 in `specs/002-noren-collection/tasks.md`).
- **FR-216**: Uploads MUST refuse when Convex lacks the storage settings, so a photo is never accepted that could not be deleted.

### Key Entities

- **Story photo**: one photo. Which place and story, who added it, its status (`uploading`, `unattached`, `waiting`, `live`), its two storage keys and its size in pixels.
- **Object removal**: one storage key still to be deleted, with its attempts and next attempt time. It outlives the photo row, which is what makes deletion reliable.

## Success Criteria *(mandatory)*

- **SC-201**: With the feature off, a member cannot tell photos exist, and every existing test passes unchanged.
- **SC-202**: A stored photo holds no EXIF, GPS, IPTC, XMP or ICC data, checked by a test that uploads a file carrying each.
- **SC-203**: After removal, the object is gone from the bucket within a minute when storage is healthy, and the link stops working within an hour.
- **SC-204**: A photo taken on an iPhone goes from pick to shown story in under 30 seconds on a phone connection.
- **SC-205**: At 390 px a story with 1 to 4 photos causes no sideways scroll and no layout shift.

## Constitution impact

See [plan.md](./plan.md). The privacy bullet needs an owner decision before this is switched on.

# Feature Specification: Neighbourhood noren collection

**Feature Branch**: none yet (uncommitted; feature directory `specs/002-noren-collection`)

**Created**: 2026-11-05

**Status**: Planned. See [plan.md](./plan.md). Nothing is built yet.

**Input**: Owner, 5 Nov 2026: make exploring more encouraging and help local business and tourism get more spend, through a collection that fills in as people visit places, with proof of visit by GPS, and with rewards later run by local teams. The owner chose private progress and GPS with badges first. Rewards, QR codes and local-team programs stay a labelled mock for pitching to local communities.

**Mock**: `.scratch/gamify/noren-collection.html`

Requirements here start at FR-101 so they don't collide with `specs/001-noren-mvp`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fill a neighbourhood's noren by visiting (Priority: P1)

A visitor in Shinchi opens their book and sees the neighbourhood's noren split into six panels, with the places that give each panel listed beside it. They walk to one, press "I'm here", and that panel dyes while the place's hanko is pressed into their stamp book.

**Why this priority**: This is the whole loop. Without a visit turning into visible progress there is nothing to collect.

**Independent Test**: Stand at a place in a set, press "I'm here" on a phone browser, and see that one panel dye. Press it again from 300 m away at another place and see it refuse.

**Acceptance Scenarios**:

1. **Given** a person within the check-in limit of a place in a set, **When** they press "I'm here", **Then** that place's panel dyes and its stamp appears in their book.
2. **Given** a person outside the limit, **When** they press "I'm here", **Then** nothing is recorded and they see how far away they are and how close they must come.
3. **Given** location is off or refused, **When** they press "I'm here", **Then** nothing is recorded and they see how to turn it on.
4. **Given** a panel already dyed, **When** they check in at a place for that panel, **Then** the panel stays as it is and no extra piece is given.
5. **Given** any person's progress, **When** anyone else looks, **Then** they see nothing about it.

---

### User Story 2 - Finish a set and keep the badge (Priority: P1)

A visitor dyes the sixth panel. The whole picture shows for the first time, and the finished noren goes on their badge shelf with the date.

**Why this priority**: The hidden picture and the badge are the reason to keep going, and they are the only reward in this version.

**Independent Test**: Complete all six panels of one set and see the full picture and a dated badge. Reload and see it still there.

**Acceptance Scenarios**:

1. **Given** five dyed panels, **When** the sixth dyes, **Then** the full picture shows and a badge with the date is added.
2. **Given** fewer than six dyed panels, **When** the person looks at the noren, **Then** undyed panels show none of the picture.
3. **Given** a finished badge, **When** a place in that set later closes or the set changes, **Then** the badge stays.
4. **Given** a finished picture, **When** the person chooses to share it, **Then** only the picture goes out, with no progress numbers about them.

---

### User Story 3 - Know where to go next (Priority: P2)

After a check-in, or on opening the book, a visitor sees their nearest undyed panel, how far away it is and one line that makes it worth the walk.

**Why this priority**: This is the pull. It turns one visit into a second one, and a second visit is what the pilot needs to prove.

**Independent Test**: Check in at one place and see the nearest undyed panel named with a distance and a real line from that place's story.

**Acceptance Scenarios**:

1. **Given** undyed panels remain, **When** a check-in finishes, **Then** the nearest one is shown with its straight-line distance.
2. **Given** a panel with two or three places, **When** it is shown, **Then** each place is offered and either one fills the panel.
3. **Given** a place with no live story line, **When** it is the next panel, **Then** only its name and distance are shown, and nothing is invented.

---

### User Story 4 - What to order, and one line for the next person (Priority: P2)

Right after checking in, a visitor sees what people mention at this place. Noren then asks "What did you have?" and offers to add their answer to the place's page under their name.

**Why this priority**: This is where the visit turns into spend and into a new story. It feeds Noren's story method, which the owner has said must stay first.

**Independent Test**: Check in at a place with a picked line and see it. Add a line while signed in and see it on the place page under that member's name.

**Acceptance Scenarios**:

1. **Given** a place with a picked line, **When** check-in finishes, **Then** that line shows with the same AI label it has on the place page.
2. **Given** a place with no picked line, **When** check-in finishes, **Then** Noren asks only "What did you have?" and shows no guess.
3. **Given** a person who types an answer and presses to add it, **When** they are a signed-in member, **Then** it follows the existing member story path (FR-033 in spec 001).
4. **Given** a person who skips, **When** they carry on, **Then** nothing is shared and their panel still counts.
5. **Given** a person at the place, **When** they press "Still here", **Then** it records a normal confirmation (FR-030 in spec 001). A check-in alone records none.

---

### User Story 5 - A mock proposal to show local teams (Priority: P3)

The owner shows a shopping street or local association how this could grow: a gift for finishing, a QR code at the till, a local team building its own set, and what a shop would see. Every screen says plainly that it is a mock.

**Why this priority**: Rewards need local partners who aren't on board yet. The pitch can go ahead while the badge version is built.

**Independent Test**: Read every proposal screen and find the mock label on each, sample names only, and a statement that nobody has agreed yet.

**Acceptance Scenarios**:

1. **Given** any proposal screen, **When** it shows, **Then** it carries the 見本 Mock label.
2. **Given** any proposal screen, **When** it shows a shop, gift, number or team, **Then** it is a sample, and no real place appears beside a reward.
3. **Given** the proposal, **When** it is read in full, **Then** it says that no shop or local body has agreed.

---

### User Story 6 - Anyone 16 or over can join, and can leave (Priority: P3)

A first-time visitor presses "I'm here", makes a free account, and comes back to the same place. They choose the name shown beside what they share. If they change their mind, they delete the account and everything tied to it goes.

**Why this priority**: Real visitors can't play until accounts open, but opening comes last, after the walk test and the protections.

**Independent Test**: Sign up as a new test person, confirm the tick states 16 or over, hit a daily limit, add a place that waits for a steward, then delete the account and find nothing left.

**Acceptance Scenarios**:

1. **Given** accounts are open and a person is signed out, **When** they press "I'm here", **Then** they are asked to make a free account and return to the same place afterwards, with no location read yet.
2. **Given** the sign-up form, **When** it shows by email or through Google, **Then** it asks the person to confirm they are 16 or over and accept the terms and privacy notice before the account exists.
3. **Given** an account in its first 7 days, **When** it reaches a daily limit, **Then** it is refused, and a place it adds stays off the public map until a steward approves it.
4. **Given** a person who hasn't confirmed their name, **When** they try to share, **Then** they see the name first and can change it.
5. **Given** a member who deletes their account, **When** it finishes, **Then** no check-in, panel, badge, name or sign-in identity remains, and their stories and links no longer show.

### Edge Cases

- **Shops very close together**: in Shinchi, real places sit 15 to 85 m apart. A wide limit would let someone dye most of a set from one spot. Sets spread their places out, and the limit is 50 m (FR-104).
- **Inside a building or a narrow street**: GPS gets worse. The phone's reported error, up to 30 m, is allowed for. If it still fails, the person sees the distance and can try at the door.
- **A pin in the wrong place**: pins from open data can be off. The person can report it through the existing report path, and a steward can move the pin or swap the place.
- **A closed shop**: a panel can hold up to three places, so one closed day doesn't block a set. Noren has no reliable opening hours, so it doesn't claim a place is open.
- **A place hidden during a set**: people who dyed that panel keep it. A steward gives the panel another place.
- **A faked location**: possible, and accepted while no prize exists. GPS shows someone came near and nothing more. The QR code in the proposal is what would tie a stamp to a purchase.
- **Old stamps**: stamps earned from anywhere before this feature stay in the book. They don't dye panels.
- **A neighbourhood with no art yet**: its set stays unavailable until its art exists.

## Requirements *(mandatory)*

### Functional Requirements

**Sets and pieces**

- **FR-101**: Each neighbourhood in the region's configuration MAY have one set: six panels of one original picture, each panel held by one to three public places. The number of panels per set MUST be a setting.
- **FR-102**: A place MUST always give the same panel, and the person MUST be able to see which before they go. Chance MUST NOT decide which panel a person gets, or who gets a badge. A cosmetic surprise with no value, such as ink colour, MAY use chance.
- **FR-103**: An undyed panel MUST show none of the picture. The picture MUST show in full only when all panels are dyed.
- **FR-114**: Places in a set MUST be public places that pass FR-031 in spec 001 (no errands, no chains), and places within a set SHOULD sit at least 50 m apart. A steward MUST be able to swap a place.
- **FR-115**: Each set's art MUST be original. It MUST NOT copy any game, character, mascot or logo. A local mascot MAY be used only with its owner's written permission.

**Check-in**

- **FR-104**: Pressing "I'm here" MUST read the location once. It passes when the distance to the place's pin, less the phone's reported error up to 30 m, is within 50 m. Both numbers MUST be settings.
- **FR-105**: A check-in MUST record only the place, the date and the person, and MUST keep one record per person per place, the first. Coordinates and the time of day MUST NOT be stored or logged. Location MUST NOT be read in the background or at any other moment.
- **FR-106**: A failed check-in MUST record nothing and MUST say what to do next.
- **FR-107**: A check-in MUST add the place's stamp to the stamp book if it isn't already there. Stamps from other actions MUST NOT dye panels.
- **FR-113**: Checking in MUST need an account, so progress follows the person across phones. Reading pages, the map and a set's panels MUST stay open with no account. Noren MUST ask a person to sign up at their first "I'm here" and MUST bring them back to the same place afterwards.

**Open sign-up**

- **FR-125**: Anyone aged 16 or over MUST be able to create an account without an invitation. This replaces the invite-only part of FR-021 in spec 001 and needs the constitution change below.
- **FR-126**: Sign-up MUST NOT open until a privacy notice and terms exist in Japanese and English. The notice MUST name every service outside Japan that holds or processes account data. Sign-up MUST ask the person to confirm they are 16 or over and accept both.
- **FR-127**: Opening sign-up MUST NOT change the other launch rules: pages stay hidden from search engines, `pilot` visibility stays unavailable, and real businesses stay under the same draft rule.
- **FR-128**: For its first 7 days, an account MUST have lower daily limits: 5 stories, 3 places, 5 links, 20 link previews, 3 AI drafts, 10 "Still here" presses and 3 reports. After 7 days an account MUST have limits on "Still here" and reports too, which today have none: 100 and 20 a day. These numbers are settings and starting guesses.
- **FR-129**: During those 7 days, a place the account adds MUST stay in `draft` until a steward approves it. Its stories MUST go live at once under its name, with the existing removal path beside them.
- **FR-130**: A member MUST be able to delete their account from Noren. Deleting it MUST remove their check-ins, panels, badges and name, and hide the stories and links they shared. A creator, business owner or steward MUST ask a steward instead, because interviews and consents depend on those roles. No steward screen or export MAY show one person's check-ins.
- **FR-131**: A person MUST be able to choose the name shown beside what they share, and MUST see that name before their first share. It need not be their real name, and a name that came from a sign-in provider MUST NOT go public until they have seen it.

**Progress and badges**

- **FR-108**: A person's panels and badges MUST be visible to that person alone. Nothing MAY compare, rank or list people, or read one person's progress on behalf of another. A person MAY share their finished picture, which carries no progress numbers.
- **FR-109**: The set MAY show the person's own progress, such as "2 of 6". The stamp book keeps its existing rule of no total, and neighbourhood missions stay shared and unchanged.
- **FR-110**: Finishing a set MUST add a dated badge that stays even if the set or its places change later.
- **FR-111**: Badges MUST have no cash value and MUST NOT be exchangeable for anything. Points, ranks, leaderboards and streaks MUST NOT be added. Any reward MUST go through a new spec and a check of Japan's prize rules first.

**The pull, spend and stories**

- **FR-116**: The book and the check-in result MUST name the nearest undyed panel, its straight-line distance and, where one exists, one live line from the place's story.
- **FR-117**: After check-in, a place MAY show one line about what to order or look for. A steward MUST pick it from sentences already live on that place's page, and it MUST carry the same AI label. Nothing new is generated for this feature, and no line is ever invented.
- **FR-118**: After check-in, Noren MUST ask "What did you have?". An answer MUST be shared only when the person presses to share it, in their own words under their own name, through the existing member story path.
- **FR-119**: After check-in, "Still here" MUST be offered as its own press and records a normal confirmation.

**Proposal**

- **FR-120**: Rewards, QR codes, local-team set building and shop totals MUST exist only as a mock proposal in this version, separate from the working product.
- **FR-121**: Every proposal screen MUST carry the label 見本 Mock, use sample names and example numbers, and show no real place beside a reward. The proposal MUST say that no shop or local body has agreed.
- **FR-122**: The proposal MUST state that shops would see totals and never see who visited, in line with FR-024 in spec 001.

**Access and language**

- **FR-123**: All of this MUST work in a phone browser with no app. All copy MUST be in Japanese and English, and a person MUST review the Japanese before release. Progress MUST also be available as text to a screen reader, and motion MUST respect the reduced motion setting.
- **FR-124**: Sets MUST be defined per region, so another city can add its own without a code change.

### Key Entities

- **Set**: one neighbourhood's collection: its picture, panels and name.
- **Panel**: one slice of the picture, held by one to three places.
- **Check-in**: a place, a date and a person. It never holds coordinates or a time of day.
- **Badge**: a finished set and its date, belonging to one person.
- **Picked line**: a pointer to one sentence already live in a place's story, chosen by a steward.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: In a walk test of 10 real places on real phones, at least 9 check-ins pass on the first press when the person is inside or at the door.
- **SC-102**: With location already allowed, a check-in takes under 15 seconds from press to dyed panel.
- **SC-103**: A review of stored records and logs after that walk test finds zero coordinates.
- **SC-104**: A test as a second person finds no way to see another person's panels or badges.
- **SC-105**: Before any pilot talk, at least 30% of people who check in once also check in at a second place on the same or the next day, measured as totals that identify nobody. The owner should confirm this bar, which is a starting guess.
- **SC-106**: A read of every proposal screen finds the mock label on all of them and no real place beside a reward.
- **SC-107**: After a test member deletes their account, a search of stored records finds no check-in, panel, badge, name or sign-in identity for that person, and their stories and links no longer show.
- **SC-108**: Before sign-up opens, a test account in its first 7 days is refused at each daily limit, and a place it adds stays off the public map until a steward approves it.

## Assumptions

- Phone browsers can read location over HTTPS after the person allows it, so this needs no app and no shop to sign up. iOS app plans are separate.
- 50 m is a starting number. Nobody has tested it in Shinchi's streets yet, so it needs a walk test on the ground.
- Six panels suit a visitor with one afternoon. The owner's first idea was ten, and it stays a setting.
- All eight neighbourhoods have enough places with stories for a set: live data on 5 Nov 2026 shows 12 to 48 per neighbourhood.
- Art for the first set is the original picture in the mock. Art for other sets, possibly by local artists, is still open.
- The owner chose open sign-up on 5 Nov 2026. `launchPackComplete` stays off, because turning it on would also allow `pilot` visibility and lift the real-business draft rule.
- Check-ins, panels and badges are first tested with invited accounts in Shinchi. Sign-up opens last, once FR-126 and FR-128 to FR-130 are in place.
- Asking for sign-up at the first "I'm here" may lose some visitors. If the walk test shows that, a later change could let someone dye their first panel before signing up.
- No new AI provider or new AI processing is involved.

## Why pieces are fixed

Japan's Consumer Affairs Agency bans "card matching" at any prize value: a prize for showing a specific combination of different tokens, handed out through a method based on chance or on being right or better at something ([Q5](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/card/), Q85 in the [premium Q&A](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/assets/representation_cms220_250620_01.pdf)). A completed picture made from random pieces fits that wording, and the value of the prize doesn't change it. A digital badge with no value is no prize, so random pieces would be allowed today, but they would block the rewards the owner wants later.

Fixed pieces take chance out. The agency's own stamp rally example (Q70) has 3 stamps from 3 shops, with a gift for everyone who finishes, and treats it as a capped gift: ¥1,000 at each shop allows up to ¥600. A gift for visiting alone is capped at ¥200 ([Q111](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/not_lotteries)). This is the project's reading of those pages and needs confirming with the agency or the prefecture before any pilot.

## Constitution impact

- **Principle I needs an amendment**, which the owner approved on 5 Nov 2026. Wording, version 2.3.0, added as the first build step: "A person's own collection progress, for example 2 of 6 panels, MAY be shown to that person alone. It MUST NOT be shown to anyone else, compared between people, ranked or turned into points."
- **The invite-only rule needs an amendment**, in "Privacy, Consent and Legal Constraints", which today keeps accounts invite-only until the whole launch pack exists. The owner approved this wording on 5 Nov 2026, also part of version 2.3.0: "Accounts MAY open to anyone aged 16 or over once a privacy notice and terms exist in Japanese and English and a takedown workflow is live. Every page stays hidden from search engines, and real businesses stay under the draft rule, until the full launch pack exists."
- **Principle II**: real places and real story lines only in the working product. The proposal uses samples and is labelled.
- **Principle III**: the pin stays the authority for where a place is.
- **Principle IV and V**: no new third-party content and no new AI processing. Picked lines are sentences already live.
- **Principle VI**: Japanese and English, with the Japanese reviewed by a person.
- **Principle VII**: sets are defined per region.

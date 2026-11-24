# Feature Specification: Trip agent

**Feature Branch**: `trip-agent`

**Created**: 2026-11-23

**Status**: Draft. Nothing is built. Clarification comes next.

**Input**: Noren plans a multi-day road trip around who is travelling and why, starting with west Peninsular Malaysia as new coverage on the same map. It asks who is going, what each person needs and what the trip is for, then gives a plan that fits that party and no other, and changes the plan on the road. Locals exploring their own country count as much as visitors. A "family-friendly" label is not enough, because two parties should not get the same trip.

Requirements here start at FR-301 so they don't collide with the earlier specs.

## What exists and what this adds

Noren already has Plan my day (one person, one town, a few stops on foot, drawn at random and never ranked), What Noren remembers (a person's hard rules, likes and today's trip, kept on their own device) and walk mode. This feature takes the same rules to a party of several people, several days and a car.

Words used below:

- **Organiser**: the signed-in member who plans the trip.
- **Traveller**: a person on the trip. The organiser is one. A traveller needs no account.
- **Party**: the travellers together, plus how they like to travel.
- **Hard rule**: something a traveller must avoid or must have, such as no stairs or no pork. It removes places.
- **Like**: something a traveller enjoys. It only tilts the draw.
- **Turn**: a stop chosen with one traveller's likes in mind.
- **Pin**: a place or time the organiser fixes, such as a relative's house at 3 pm.

## What the research found (23 Nov 2026)

Three files in `research/` back this spec. Items marked UNVERIFIED there stay unverified.

- No planner we could read keeps a description of a traveller who has no account, keeps hard rules apart from likes, says whose stop each one is, or asks what the trip is for. Mindtrip comes nearest: it merges the saved tastes of the account holders in a group chat. Nobody has tried it by hand for us yet. (`10-trip-planner-landscape.md`)
- The complaint people repeat most about AI planners is a place that is wrong, shut or made up. (`10`)
- In 2026 tests, AI models make a workable plan for one traveller, but fewer than 12 in 100 of their group plans were valid, 99 in 100 of their valid plans were tiring, and they change a plan badly once a trip is under way. So rules, pace, turns and times belong in Noren's own checks, and the model words the answer. (`11-trip-agent-design.md`)
- People describe themselves badly in one sitting. Asking in small parts, showing a draft and letting people correct it works better. (`11`)
- Nothing we found proves that a deeper set of questions makes a party happier with the trip. Real trips are the test. (`11`)
- Between Kuala Lumpur and Alor Setar the open listings are plentiful and bare. Opening hours are on 3 to 27 in 100 food places. About 100 places in the whole stretch carry any wheelchair note. Halal is marked on 5 to 9 in 100. There is no official list of OKU-friendly places. So most checks of a party's rules will say "not checked" until people report what they found. (`12-malaysia-road-trip-ground.md`)

## Clarifications

### Session 2026-11-23

- Q: Should the trip agent be built inside Noren now, or kept back for the 5 December hackathon? → A: Build it in Noren now.
- Q: What is the sample route for tests? → A: Kuala Lumpur, Alor Setar, George Town, Ipoh and back to Kuala Lumpur, five days.
- Q: When someone in the party has a must-have, such as no stairs or halal food, what may Noren use to check a place against it? → A: A fact the place's owner confirmed, a member's own report from a fixed list, and what visitors wrote in public posts, quoted with the source.
- Q: Who should be able to use the trip agent when it is first switched on? → A: First a private trial for the owner and the people the owner invites; on 24 Nov 2026 the owner decided there is no trial (see the tasks), so it opens to every signed-in member in the release that switches Malaysia on.
- Q: Who should see the Malaysian places and the stories and reports members add there? → A: Everyone, from the start.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Say who is going and why, and get a plan that fits (Priority: P1)

The organiser says where the trip starts and ends, how many days it has, where the party sleeps each night if they know, and in their own words what the trip is for: what would make it a good one and what would spoil it. They describe each traveller: a label they choose ("Grandma", "the youngest"), a rough age, what that person must avoid or must have, and what they enjoy. They say how the party travels: how long in the car at a stretch, how full a day should be, when they eat and rest. Noren answers with a plan for each day: the drives and how long each takes, the stops in order, meals, rests and spare time.

**Why this priority**: This is the feature.

**Independent Test**: Enter the sample route (Kuala Lumpur, Alor Setar, George Town, Ipoh, Kuala Lumpur, five days) for two made-up parties, one with a grandparent who avoids stairs and a child who naps, one of four adults. Compare the two plans.

**Acceptance Scenarios**:

1. **Given** a start, an end and a number of days and nothing else, **When** the organiser asks for a plan, **Then** Noren gives one and says it knows nothing about the party yet.
2. **Given** a traveller who must avoid stairs, **When** a plan is made, **Then** no stop that traveller is at is a place Noren's records show has steps, and every other stop says whether Noren could check.
3. **Given** a party that said two hours in the car at a stretch is the most, **When** a plan is made, **Then** no drive runs longer than that without a stop.
4. **Given** two parties on the same route and dates with different travellers, **When** each gets a plan, **Then** each difference between the plans is explained on the page by something that party said or is marked as the draw.
5. **Given** a traveller who rests after lunch, **When** a plan is made, **Then** each day that traveller is on has a rest after lunch.
6. **Given** an organiser who stops halfway through the questions, **When** they come back on the same phone, **Then** what they said is still there and they can go on or plan at once.
7. **Given** a route that cannot be driven in the days given within the party's driving limits, **When** the organiser asks for a plan, **Then** Noren says so first and offers to drop a town, add a day or raise the limit.
8. **Given** a party that set no driving limit or rest times, **When** a plan is made, **Then** Noren uses its starting guesses, says they are guesses, and lets the organiser change them.

---

### User Story 2 - See why each stop is there, for whom, and what Noren could not check (Priority: P1)

Under each stop the organiser sees whose turn it is or which need it serves, in the labels they chose; what people wrote there, quoted with the source; which of the party's rules Noren checked and which it could not; and a button to draw another.

**Why this priority**: A plan nobody can question is a plan nobody trusts. It is also what sets Noren apart: reasons and sources where others show stars, and a plain "not checked" where others guess.

**Independent Test**: Open any plan and check every stop for the three parts: who it is for, what people wrote, what was and was not checked.

**Acceptance Scenarios**:

1. **Given** any stop, **When** it is shown, **Then** it carries one of: for a named traveller, a need (meal, rest, prayers, fuel, time to work), a pin, or "Wild card — not picked for you".
2. **Given** a stop with stories, **When** it is shown, **Then** up to two quotes appear with who wrote them or where they came from, and a link to the place's page.
3. **Given** a stop nobody has written about, **When** it is shown, **Then** it says so and invites the party to tell the first story.
4. **Given** a rule Noren has no record to check, such as halal at a place with no record either way, **When** the stop is shown, **Then** the rule is listed as not checked with the plain reason. It is never passed in silence, and a missing record is never read as "no".
5. **Given** any sentence about a place in a plan, **When** it is read, **Then** it is a quote with its source or a fact from Noren's own records. Nothing else is said about a place.
6. **Given** a stop, **When** the organiser presses draw another, **Then** that stop changes to another that fits the same slot and the same turn, and the rest of the day keeps its stops with new times.
7. **Given** a day that falls on a public holiday, a school holiday or in a fasting month that Noren's region records list, **When** the day is shown, **Then** it says so beside the weekday.
8. **Given** a rule Noren did check, **When** the stop is shown, **Then** it says what the check rests on: the owner's word, a member's report with their name and the date, or a visitor's own words with the source.

---

### User Story 3 - Change the plan by saying what changed (Priority: P2)

Before the trip or on the road the organiser says or taps what changed: "quieter", "shorter walks", "more for the children", "we're tired", "it's raining", "skip the museum", "we want longer in Taiping", "add a relative's house in Sungai Petani at 3". Noren changes what has to change, keeps what is done and what is pinned, and shows what moved.

**Why this priority**: People correct a draft better than they describe themselves, and a party's day rarely goes to plan. A plan that cannot bend is dropped on the first morning.

**Independent Test**: Take a four-day plan, mark two stops of day 2 as done, say "we're tired", and check what changed and what stayed.

**Acceptance Scenarios**:

1. **Given** a first plan, **When** the organiser taps "quieter" or "shorter walks", **Then** the plan changes in that direction, stays as close to the first plan as it can, and Noren lists each change.
2. **Given** day 2 is under way with two stops done, **When** the organiser says they are tired, **Then** the done stops stay, the rest of day 2 gets lighter, later days change only where something no longer fits, and Noren lists each change.
3. **Given** a pin, **When** anything else changes, **Then** the pin keeps its place and time unless the organiser moves it.
4. **Given** a change that would break a hard rule or a driving limit, **When** it is asked for, **Then** Noren refuses, says which rule, and offers choices. It never loosens a hard rule by itself.
5. **Given** a change just made, **When** the organiser presses undo, **Then** the plan is as it was.
6. **Given** a stop that has closed for good or been taken off Noren since the plan was made, **When** the plan is opened, **Then** the stop is marked as gone and another is offered.

---

### User Story 4 - Everyone gets a turn (Priority: P2)

Noren does not blend the party's wishes into a plan for nobody. Each traveller with likes gets stops chosen for them, spread over the trip, and the plan says whose each one is. Hard rules are never traded: one person's wish cannot put another at a place they must avoid. An adult traveller can answer the questions about themselves on their own phone.

**Why this priority**: This is what a "family-friendly" label cannot do. It needs User Story 1 first.

**Independent Test**: Plan for three travellers with different likes and check that each has stops marked for them on each full day.

**Acceptance Scenarios**:

1. **Given** three travellers with different likes, **When** a plan is made, **Then** on each full day each of them has at least one stop marked as theirs, or, on a day with fewer stops than travellers, the ones left out go first the next day.
2. **Given** one traveller who loves temples and one who is bored by them, **When** a plan is made, **Then** each gets a turn, and where Noren can it puts something for the other within a short walk of each turn.
3. **Given** a traveller who has gone a whole day without a turn, **When** the organiser opens that day, **Then** Noren says so in words and offers to change it. It shows no count, score or ranking of travellers.
4. **Given** an adult traveller invited by a private link, **When** they open it, **Then** they see only the questions about themselves, and their answers reach the party only when the organiser accepts them.
5. **Given** a traveller who joins or leaves part way, **When** a plan is made, **Then** their rules and turns apply only to the days and stops they are at.
6. **Given** the page the party reads, **When** it lists what was checked, **Then** it does not say which traveller a hard rule belongs to. Only the organiser sees that.

---

### User Story 5 - Plan a part of the country Noren barely knows (Priority: P2)

A local party plans a trip through towns where nobody has written on Noren yet. Noren says so, plans with the listings it has, labels them as not yet confirmed, and treats each stop as a story waiting for its first teller. What the party writes on the road shows on those places' pages like any member's story.

**Why this priority**: On a first trip every town is like this. Without it the feature has nothing to say outside Nagasaki.

**Independent Test**: Make a plan through a town with listings and no stories. Check the labels, then write a story at one stop and see it on the plan and on the place's page.

**Acceptance Scenarios**:

1. **Given** a town with no stories, **When** it is in a plan, **Then** the plan says in one line that nobody has written about this town on Noren yet and that its stops come from open listings.
2. **Given** a stop from an open listing nobody has confirmed, **When** it is shown, **Then** it carries the "Not yet confirmed" label and the "Still here" button, as on the map.
3. **Given** a traveller with an account who writes a story at a stop, **When** they share it, **Then** the plan shows that stop as told by them and the story is on the place's page.
4. **Given** a traveller with an account at a stop, **When** they tick what they found there (three steps at the door, high chairs, a halal sign shown), **Then** the place carries it with their name and the date, and the next plan that checks that rule there says so.

---

### User Story 6 - Keep the trip, the party and what was learnt (Priority: P3)

After the trip the organiser can keep the plan as a private record, keep the party for the next trip, and read what Noren noticed ("you skipped three museums") as suggestions to accept or decline. They can delete any of it, or all of it.

**Why this priority**: It makes the second trip better, but the first trip works without it. The record of what the party changed is also how the owner can judge whether the plan was a fit or generic.

**Independent Test**: Finish a trip, accept one suggestion, start a new trip with the kept party and check the suggestion is in it.

**Acceptance Scenarios**:

1. **Given** a finished trip, **When** the organiser opens it, **Then** they see what was planned, done, skipped and changed, and the stories the party wrote.
2. **Given** something Noren noticed from what the party did, **When** it is shown, **Then** nothing about the party changes until the organiser says yes.
3. **Given** a kept party, **When** the organiser starts a new trip, **Then** the travellers are there to pick from and to edit.
4. **Given** the organiser deletes a trip, **When** it is gone, **Then** its plan, its private link and its copy of the party are gone with it.

---

### Edge Cases

- A party of one, or of two adults: everything works, and nothing assumes children.
- No place in a town passes every rule Noren can check: Noren says so, shows the places with what it could and could not check, and the organiser chooses.
- Almost nothing can be checked, which is the usual case in a new region: the plan says so once at the top, and still lists the unchecked rules under each stop.
- The organiser types a health detail ("one of us has a bad knee"): Noren offers only the practical rule ("short walks, no stairs") to keep, and does not keep the condition.
- Two reports about a place disagree, or the only report is over a year old: the stop shows them with their dates and the rule reads as not met or not checked (FR-347).
- A visitor's post is about a person's health, or does not clearly say what a rule needs: nothing is taken from it.
- A child is described by an adult. A child is never sent a link and never has an account (Noren's age rule is unchanged).
- A state's weekly rest day differs from its neighbours', or a holiday changes opening times: each day shows what Noren's region records hold. Where Noren does not hold a place's hours it says "hours not known, check before you go".
- A busy travel day, such as the first day of a school holiday: Noren says its driving times are for an ordinary day and that this is not one.
- A story is removed by its writer or hidden by a steward: its quote leaves every plan at once.
- A pin that is not a public place, such as a home: it stays private to the trip and never becomes a place on Noren.
- No signal on the road: the last plan loaded can still be read. Changes wait for a connection.
- The wording step fails: the plan still shows, built from Noren's records, with plain fixed wording.
- The organiser's phone is lost or its storage cleared: the party's details are gone with it. A plan shared by link can still be read.
- A very long drive is the only way between two nights: Noren splits it with rest stops and says the day is mostly driving.

## Requirements *(mandatory)*

### Functional Requirements

**The trip and the questions**

- **FR-301**: A signed-in member MUST be able to start a trip with a start, an end, a number of days or dates, and, if they wish, the town for each night.
- **FR-302**: Noren MUST ask what the trip is for, what would make it a good one and what would spoil it, and keep the organiser's own words. It MAY suggest settings from them (for example lighter days for a trip to rest), each shown for the organiser to accept or change.
- **FR-303**: The organiser MUST be able to describe each traveller with a label they choose, an age band, hard rules, likes and daily rhythm (for example an afternoon rest, an early night, two hours of work each morning).
- **FR-304**: A traveller's needs MUST be chosen from plain practical choices, such as no stairs, short walks only, somewhere to sit often, quiet places, a toilet close by, no pork, vegetarian, halal. Noren MUST NOT ask for a traveller's legal name, date of birth, a diagnosis, or the medical or religious reason behind a rule.
- **FR-305**: The organiser MUST be able to set, for the party: the longest drive without a stop, the most driving in a day, how full a day should be, usual meal times, and times kept for prayers, rest or work. Where they set none, Noren MUST use starting guesses, say that they are guesses, and let the organiser change them.
- **FR-306**: The questions MUST be answerable by tapping, typing or speaking, in any order, and every one MUST be skippable. A plan MUST be possible from FR-301 alone.
- **FR-307**: Every question Noren asks MUST be one whose answer can change the plan. A question that changes nothing is not asked.
- **FR-308**: Noren MAY ask up to three further questions drawn from the answers, each about a concrete case ("a ten-minute walk uphill to a lookout: fine for everyone?").
- **FR-309**: Whatever Noren takes from typed or spoken words about a traveller MUST be shown back as a suggestion, beside the words it rests on, and kept only when the organiser says yes.
- **FR-310**: Before the first plan, Noren MUST read the party's hard rules back on one plain screen for the organiser to confirm or correct.
- **FR-311**: The organiser MUST be able to see, change and delete everything Noren holds about the trip and the party, in one place, at any time.
- **FR-312**: Hard rules and likes MUST be kept apart. A hard rule removes places. A like never removes one.

**The plan**

- **FR-313**: A plan MUST show, for each day: the weekday and date, any holiday or fasting month the region's records list for it, each drive with its estimated time and distance, the stops in order with an estimated time at each, meals, rests, spare time, and the day's total driving.
- **FR-314**: Every stop MUST be a real place on Noren's map or a pin the organiser added. Noren MUST NOT invent a place or a fact about one.
- **FR-315**: A place that fails a hard rule Noren can check, for any traveller who is there, MUST NOT be offered. A missing record MUST be treated as "not known", never as a pass or a fail.
- **FR-316**: Each stop MUST show which of the party's rules Noren checked, what the check rests on, and which rules it could not check and why.
- **FR-317**: The party's driving limits and rest times MUST hold in every plan and after every change. When a route cannot meet them, Noren MUST say so before planning and offer choices.
- **FR-318**: Among the places that pass the rules and fit the slot, the choice MUST be a draw as in Plan my day: likes tilt the odds, quiet places get their turn, and ratings, reviews, popularity and the number of stories are never used. Nothing is ranked.
- **FR-319**: Each stop MUST be marked as a traveller's turn, a need, a pin or a wild card. A wild card keeps the wording Plan my day uses.
- **FR-320**: Turns MUST be spread evenly: over a trip, no traveller with likes has had two turns fewer than another who was there for the same days.
- **FR-321**: Noren MUST NOT show a count, score or ranking of travellers or of their turns.
- **FR-322**: Times MUST be shown as estimates for an ordinary day. A place's opening hours MUST be shown only when Noren holds them with a source; otherwise the stop says the hours are not known.
- **FR-323**: Words about a place in a plan MUST be quotes with their source or facts from Noren's records. Text an AI helped word MUST be labelled as such. A member's story is read by AI only with its writer's tick, as today.
- **FR-324**: The organiser MUST be able to pin a place or a time, draw another for one stop, remove a stop and add one from the map.
- **FR-325**: The organiser MUST be able to say which travellers are on which days.
- **FR-326**: A plan MUST hand each drive to the person's own maps app for directions and live traffic. Noren gives no turn-by-turn directions.

**Changing it**

- **FR-327**: The organiser MUST be able to change a plan in words or by tapping, including quick changes such as "quieter", "shorter walks" and "more for the children". Noren MUST change only what has to change, stay as close to the plan before as it can, keep done stops and pins, and list what moved.
- **FR-328**: The organiser MUST be able to mark a stop done or skipped, and to undo the last change.
- **FR-329**: A change that cannot be made within the hard rules, the driving limits and the rest times MUST be refused with the reason and choices. Noren MUST NOT loosen a hard rule by itself.
- **FR-330**: Noren MUST keep, for the organiser, the list of changes made to a plan, so they can see afterwards where the first plan did not fit.

**Sharing with the party**

- **FR-331**: The organiser MUST be able to make a private link that lets the party read the plan with no account, and to switch the link off. The page is hidden from search and does not say which traveller a hard rule belongs to.
- **FR-332**: The organiser MUST be able to invite an adult traveller to answer the questions about themselves. Their answers join the party only when the organiser accepts them, they do not see the other travellers' answers, and Noren does not keep the answers once they are handed over.
- **FR-333**: A child's details MUST come only from an adult in the party.

**Privacy**

- **FR-334**: A trip and its party are private to the organiser and to the people they share the link with. They MUST NOT appear on any public page, in search, in the connector's answers or in any export, and MUST NOT change what anyone else is shown.
- **FR-335**: The party's details MUST be kept on the organiser's device, as What Noren remembers is. When the organiser makes a private link, Noren keeps a copy of the plan for that link (stops, times and the labels on the turns) until the link is switched off or the trip deleted.
- **FR-336**: Hard rules MUST be applied by Noren's own checks, not by an AI service's judgement. An AI service is sent what the organiser types or says in the chat and the outcome of Noren's checks, not the party's description. The privacy notice MUST say so, and the organiser MUST be told once before they first type about a traveller.
- **FR-337**: Deleting a trip MUST delete its plan, its link and its copy of the party. Deleting an account MUST delete every trip Noren holds for it.
- **FR-338**: What Noren noticed about a party from a trip (User Story 6) MUST reach the party only as suggestions the organiser accepts or declines.

**Places and regions**

- **FR-339**: A trip MUST be able to pass through several towns of a region, with stops in the towns and between them.
- **FR-340**: Where Noren has few stories or none, it MUST say so, plan with the listings it has under their labels, and invite the party to write the first story.
- **FR-341**: A party's rule MUST be checked against three kinds of record and no other: a fact the place's owner confirmed; what a member who went there reported from the region's fixed list, with their name and the date; and what a visitor wrote in a public post, shown as their own words with the source. Each check shown in a plan MUST say which of these it rests on.
- **FR-342**: The feature MUST sit behind a switch in the region file. It MUST NOT open to members until the notice and terms that describe it are live. It opens to every signed-in member in the same release that switches Malaysia on (owner, 24 Nov 2026: no trial); the trial value of the switch stays in the code, unused.
- **FR-343**: Each member MUST have a daily limit on plans and changes, so the cost stays bounded.
- **FR-349**: A region's map, places, stories and reports MUST be public from the day the region is switched on, under the rules Nagasaki's already follow (the "Not yet confirmed" label, names shown by the writer's agreement, removal by the writer, takedown). A region MUST NOT be switched on before a privacy notice and terms that cover it are live. The trip agent opens in the same release (FR-342).

**What a check rests on**

- **FR-344**: A signed-in member who has been to a place MUST be able to report what they found there by ticking items on a fixed list agreed for the region, such as steps at the door, a ramp, high chairs, a toilet a wheelchair fits, a halal sign shown, a prayer room, shade to sit in. The list MUST cover the must-haves a party can choose (FR-304). A report shows on the place's page with the member's name and the date, and the member can remove it.
- **FR-345**: A report is a fact about a place, not an opinion of it. Reports MUST NOT be counted into a score, a rating or an order of places.
- **FR-346**: A fact taken from a visitor's public post MUST be shown as that visitor's words, with the source and a link, and MUST count only when the quoted words themselves say it. When that cannot be shown, the rule reads "not checked".
- **FR-347**: When records about the same thing disagree, Noren MUST show each with its date and treat the rule as not met. A member's report or a visitor's post more than 12 months old MUST be shown as old and MUST NOT count as a check.
- **FR-348**: A note in an open listing (for example "wheelchair: yes") MUST be shown as what the listing says, not confirmed. It MUST NOT count as a check.

### Key Entities

- **Trip**: start, end, days or dates, the town for each night, the purpose in the organiser's words, who organises it, whether it is under way or finished.
- **Party**: the travellers on a trip and the party's settings (driving limits, how full a day is, meal, rest, prayer and work times). An organiser may keep a party for another trip.
- **Traveller**: a label, an age band, hard rules, likes, rhythm, and which days they are on. Not an account, and not a name.
- **Hard rule** and **Like**: as in What Noren remembers, now belonging to one traveller.
- **Day**: a date, what the calendar says about it, the night's town, the drives, the stops, the totals.
- **Drive**: from one stop to the next, with estimated time and distance.
- **Stop**: a place or a pin in a slot of a day, marked as a turn, a need, a pin or a wild card, with what was checked and not checked, and whether it was done or skipped.
- **Pin**: a place or time the organiser fixed. It may be private to the trip.
- **Practical fact**: about one place, one item from the region's fixed list, whether it is so, what it rests on (the owner, a member's report, a visitor's post), who said it, when, and the source.
- **Change**: what the organiser asked, what moved, and when, so it can be shown, undone and read afterwards.
- **Private link**: lets the party read the plan, or lets one adult traveller answer for themselves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-301**: An organiser gets a first plan for a four-day trip within 10 minutes of starting, and within 2 minutes when they skip the questions.
- **SC-302**: Across at least 20 test parties on the sample route, each drawn several times, no plan holds a stop that breaks a rule Noren can check, a drive over the party's limit, a missed rest, or a place that is not on Noren's map or pinned.
- **SC-303**: With the draw held fixed, changing one answer about a party changes only the parts of the plan that answer bears on, and the page explains every one of those changes.
- **SC-304**: With the draw held fixed, any two test parties that differ in an answer Noren can act on get plans that differ. Where two parties differ only in answers Noren cannot check, the plans are the same and say which rules went unchecked.
- **SC-305**: Every stop in every test plan says whom or what it is for, and every sentence about a place has its source.
- **SC-306**: On the same route, test parties whose travellers all have likes each end the trip with turns that differ by no more than one.
- **SC-307**: A change to a plan is answered within one minute, 19 times in 20, and leaves done stops and pins untouched every time.
- **SC-308**: A search of every public page, the connector's answers and every export finds nothing about any party.
- **SC-309**: A real party makes a trip with a plan from Noren, changes it on the road at least once without starting again, and each adult traveller can point to a stop that was theirs.
- **SC-310**: After a real trip the organiser can read every change the party made to the plan and say, from that list, where the first plan was generic.
- **SC-311**: Across the first real trips, parties write the first story at five or more stops and report what they found at ten or more.
- **SC-312**: Every check shown in any test plan names what it rests on, and no check rests on an open listing's note, a record over 12 months old, or a visitor's quote that does not itself say it.

## Assumptions

- Trips are by car. Walking inside a town uses the estimates Plan my day already makes.
- Driving times are estimates for an ordinary day. There is no live traffic and no toll price, and the plan says so.
- The organiser is a signed-in member aged 16 or over.
- The first region beyond Nagasaki is the west coast of Peninsular Malaysia between Kuala Lumpur and Alor Setar (Kedah, Penang, Perak, and the road north out of Kuala Lumpur). Its listings come from open data, as Nagasaki's did, and it starts with almost no stories.
- Noren stays one app with one map (owner, 23 Nov 2026). Malaysia is added coverage on the same map, with the same sign-in and the same pages, in the languages the app already has (Japanese and English). Each place's name shows in whatever scripts its listing holds. Malay, Chinese and Tamil wording, and stories checked in those languages, come later. The privacy notice is the exception: if Malaysia's data protection act applies, its section 7(3) asks for the notice in Malay and English (read on 23 Nov 2026 from secondary sources only, so check the official text).
- Keeping the party's details on the device follows the decision of 10 Nov 2026 that hard rules stay on the device. A trip that follows the organiser between phones is left for later.
- Noren books nothing and shows no prices, tickets, adverts or paid placements. Money never changes what is drawn, in what order, or what is said.
- Public transport, flights and trips across a border are out of scope.
- What must work first, in this order (the order is a proposal the owner can change):
  - Must work: User Stories 1, 2 and 5, and from User Story 4 the turns (who each stop is for, spread evenly, no hard rule traded).
  - Wanted: User Story 3 (changing the plan on the road) and the private link for the party to read the plan (FR-331).
  - Later: inviting a traveller to answer for themselves (FR-332) and User Story 6.
- This is built in Noren, starting now (owner, 23 Nov 2026). It is not kept back for the hackathon of 5 Dec 2026, and nothing built here is entered there as work done on the day. The constitution's line about that hackathon is reworded to say so when the constitution is next amended.
- This builds on Plan my day, What Noren remembers, walk mode and the writer's tick, which stay as they are for one person's day.
- The Malaysian region is public from the day it is switched on (owner, 23 Nov 2026), so a privacy notice and terms that cover it must be live first. That puts the wording, and the owner's position on Malaysian data law, on the path to the release. Whether Malaysia's data protection act reaches a project that takes no money is an open question for a lawyer; a traveller's access needs would count as sensitive data under it. Wording for trips, parties and private links is needed before the trip agent opens.
- The constitution was amended to 3.0.0 on 23 Nov 2026 for this feature: one app covering more than one region, travellers who are not members, members' reports and visitors' quoted words backing a check, and the hackathon line.

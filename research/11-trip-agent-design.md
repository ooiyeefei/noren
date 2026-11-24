# 11. Trip agent design: what the research says about building a multi-day, party-aware planner

Lane: how to build an "AI-native travel agent" well, from published research and engineering write-ups. Seven topics: LLM planning ability, itinerary as an optimisation problem, preference elicitation, groups and families, architecture patterns, evaluation, privacy design. Competitors and Malaysian data, routing engines and law are other lanes and are not covered.
Access date for every source below: **2026-11-23** (today).

Method and caveats:
- Primary sources only: arXiv, ACL Anthology, publisher pages, official engineering blogs and docs. Search was used only to locate them.
- Pages were read through a summarising fetch tool. Three PDFs (Delic et al. 2016, Darcy et al. 2010, the GATE paper) were saved and read as raw text with `pdftotext`, so those quotes are firm. For every other source, a number is reported only if the fetched page showed it. Figures that appeared only in a search-result summary are marked **UNVERIFIED**. Papers I could not open are named as such, with what I relied on instead.
- Several 2026 benchmark papers were read from the arXiv abstract and the first part of the HTML only (the fetch tool cut long pages at about 100,000 characters). Failure analyses in the cut part were not read.
- Model capability moved a lot between 2024 and 2026. I give the date of every result and say where an older finding may no longer hold.
- The author of this report is an AI model (Claude, Anthropic). No vendor or model is recommended. Naming which models a paper tested is reporting, not advice.
- The "design" section is partly inference and partly my own guess. Each element is labelled.
- This is not legal advice and not a Malaysian-law review.

---

## Summary table

| # | Finding | What it means for the build | Evidence |
|---|---|---|---|
| 1 | Unaided LLMs failed TravelPlanner in 2024 (GPT-4: 0.6% pass). By late 2025 GPT-5 reached 21.2% on the same benchmark. Solver hybrids reached 90%+ in 2024. | Do not let the model be the planner. Let code build and check the plan. | Strong for 2024; moderate for 2025 (one figure, from a paper that cites it) |
| 2 | 2026 benchmarks show frontier models are now mostly feasible for one traveller but still fail on group plans (plan validity below 12%), on pace (99% of valid plans burdensome) and on replanning. | Pace, fairness across members and mid-trip changes belong in code. | Moderate (new, few papers, LLM-simulated judges in part) |
| 3 | Frontier models now rival classical planners on pure PDDL tasks (2025). | The "models cannot plan" line is weaker than in 2024. The case for code now rests on checkability, repeatability and your own rules, not on raw ability. | Moderate (one paper, different task type) |
| 4 | The orienteering problem is the right model, and 300 candidates for 3 to 4 days is tiny. Published heuristics handle 900 to 7,000 nodes. | Greedy insertion plus local swaps plus a checker is enough. A solver is optional. | Strong on the model, inference on "enough" |
| 5 | OR-Tools has no official JS build (C++, Python, Java, .NET). Community WASM ports exist. HiGHS-js (MIT) runs in Node and browser but does MIP only. | A heuristic written in TypeScript avoids the issue. If a solver is wanted later, run it as a separate small service. | Strong (docs read); WASM port maturity UNVERIFIED |
| 6 | Production systems (Google Search trip ideas, DocentPro, a solo builder's write-up) use the same split: facts from a place store, a deterministic step for time and geography, the model for words. | Matches "code decides, the model words it". Google lets the LLM draft first and the optimiser repair it. That is looser than your rule. | Moderate (blog posts, no metrics) |
| 7 | People are poor at stating all their preferences. In the GATE study they overestimated how much a prompt covered. In a tourism group study, the group choice was not predictable from members' starting preferences. | Do not trust one interview. Ask in small pieces, show a draft, let people correct it. | Moderate |
| 8 | Picture picking (3 to 7 pictures, median under 3 minutes) gave a profile 65% of 81 people agreed with, and 90% still edited it. | Pictures are a cheap first pass for tastes. Treat the result as a starting guess. | Moderate (one study, n=81) |
| 9 | Disability research uses six access dimensions: mobility, hearing, vision, cognitive/learning, mental health, long-term health conditions. | Use coarse access chips, not diagnoses. | Strong as a framework |
| 10 | No source gave rest intervals or drive-time limits by child age. Car sickness peaks at ages 4 to 13 (population survey, UNVERIFIED reading). | Make pace and drive-block limits editable defaults and say they are guesses. | Strong that the gap exists |
| 11 | Group aggregation has no winner (Arrow; Delic et al.). Sequence fairness (who got a turn) matters to people. | Extend your exposure ledger into a per-person "turns" ledger across days. | Moderate (theory strong; tourism trials thin) |
| 12 | For testing: counterfactual tests, a few dozen hand-made cases, code graders first, model judges only when checked against humans. | The cheapest strong test is "same route, change one person, diff the plan" with checks written in code. | Moderate; no published test for this exact claim |
| 13 | LLMs can infer private attributes from ordinary text, and leaked private data in 39% of GPT-4 test cases. | Keep the profile on the device. Send the model code's output, not the person's profile. | Moderate |
| 14 | Nothing found shows that a deeper interview or "hyper-personalised" plan makes families happier. | The thesis is plausible but unproven. Treat the first real trips as the test. | Gap |

---

## 1. Can LLMs plan trips, and what works when they cannot

**Findings, in date order.**

- **TravelPlanner** (Xie, Zhang, Chen, Zhu, Lou, Tian, Xiao, Su; arXiv 2402.01622, submitted 2 Feb 2024, ICML 2024 spotlight). 1,225 planning intents, nearly four million tool-accessible records. The abstract says GPT-4 reached a 0.6% success rate. Read 2026-11-23.
- **LLM-Modulo on TravelPlanner** (Gundawar, Verma, Guan, Valmeekam, Bhambri, Kambhampati; arXiv 2405.20625, 31 May 2024). Critics check the plan and send a back-prompt. GPT-4-Turbo went from 4.4% direct to 20.6% final pass (4.6 times) on the 180-query validation set. GPT-3.5-Turbo went from 0% to 5%. Even the best setting passed only about a fifth of queries. Read 2026-11-23.
- **Formal verification with an SMT solver** (Hao, Chen, Zhang, Fan; arXiv 2404.11891, v3 Jan 2025). The LLM turns the request into steps and then Python code that calls lookup APIs and the Z3 solver. Final pass rate on the 1,000-query test set: 93.9% with Claude-3, 90.2% with GPT-4, 67.8% with Mistral-Large. Direct o1-preview scored 10.0% on validation. When the query cannot be satisfied, Z3's unsat core tells the LLM why and it proposes a change for the user to accept. About 1.3% of queries hit the 30-minute timeout. Read 2026-11-23.
- **Natural Plan** (Zheng et al., Google DeepMind authors; arXiv 2406.04520, 6 Jun 2024). Trip planning solve rate: GPT-4 31.1%, Gemini 1.5 Pro 34.8%. Every model scored below 5% with 10 cities. Read 2026-11-23.
- **TRIP-PAL** (de la Rosa, Gopalakrishnan, Pozanco, Zeng, Borrajo; arXiv 2406.10196, 14 Jun 2024). The LLM lists POIs, rates utility and estimates visit times. A PDDL planner (Fast Downward) builds the schedule. In 100 one-day tasks with 10 POIs, GPT-4 gave only 14 valid plans. Its errors were mostly visit-time violations (81) and travel-time violations (27). Caveat: the paper's travel times were random numbers from 15 to 60 minutes, not real roads. Read 2026-11-23.
- **ITINERA** (Tang et al.; arXiv 2402.07204, v5 Jan 2025). Five modules. The LLM decomposes the request. Embeddings retrieve candidates. A hierarchical TSP solver orders clusters and POIs. The LLM selects and narrates. In a deployed test, 464 users and 33 experts preferred it to a GPT-4 chain-of-thought baseline in 68 to 72% of comparisons. Removing the spatial optimisation raised the average margin from 86.0 m to 242.8 m and overlaps from 0.42 to 1.04 in the Shanghai ablation. Read 2026-11-23 (HTML; last 13,626 characters unread).
- **TripCraft** (Chaudhuri et al.; arXiv 2502.20508, Feb 2025; ACL 2025 long, pp. 17035 to 17064 per a search summary). 3, 5 and 7-day plans, with continuous scores for meal timing, attractions, spatial fit, ordering and persona. Abstract figure: giving the model "parameter-informed" input raised the meal-timing score from 61% to 80% in the 7-day setting. I did not read the body.
- **Planner-R1** (Zhu et al.; arXiv 2509.25779, 30 Sep 2025). The abstract gives GPT-5 at 21.2% final pass on TravelPlanner, and a trained 32B model at 56.9%. The paper calls this the strongest agentic result on the public leaderboard (the authors' own claim).
- **ChinaTravel** (Shao et al.; arXiv 2412.13682, Dec 2024, v5 Apr 2026). Models tested were DeepSeek-V3, GPT-4o and small open models, so the results are 2024-era. The neuro-symbolic method reached 37.0% on human-written queries. Purely neural methods got about 2.6%. LLM-Modulo refinement stalled after about 3 to 5 rounds. Translation to rules can silently drop constraints. Read 2026-11-23 (first 100,000 characters).
- **Frontier LLMs Rival State-of-the-Art Planners** (Corrêa, Pereira, Seipp; arXiv 2511.09378, Nov 2025, v2 May 2026). On 360 fresh planning-competition tasks, Gemini 3.1 Pro solved 245 and the best classical baseline 234. GPT-3.5 solved none. This is symbolic planning (PDDL), not trips.
- **DeepPlanning** (Zhang et al.; arXiv 2601.18137, Jan 2026). Multi-day travel and shopping. Abstract says even frontier agentic LLMs struggle with global constrained optimisation. No figures in the abstract.
- **TravelEval** (Chen et al.; arXiv 2606.01046, May 2026, KDD 2026). 12 approaches. LLMs struggle with spatio-temporal reasoning and budget compliance. Agentic reasoning strategies did not consistently help.
- **Trip+** (Chen et al.; arXiv 2606.21169, Jun 2026). 18 models, 153 multi-turn instances, 11 traveller profiles. Best model (Gemini-3.1-Pro-Preview): feasibility 0.88, hard constraints 0.90, soft preferences 0.64, simulated traveller experience 0.51. Comfort and pace scored 0.39. 99% of the valid plans had pace-related burden. Transport, attraction and meal requirement errors appeared in 24%, 17% and 10% of valid plans. On mid-trip disruption, the model noticed the need to replan (response accuracy 0.90) but request fulfilment fell to 0.60. The experience scores come from LLM judges (median of four), so treat them as indicative.
- **GroupTravelBench** (Cheng et al.; arXiv 2605.25200, May 2026, v3 Sep 2026). 650 multi-user, multi-turn tasks, nine models. Plan validity below 12% for every model (best: 8.0%). Group fairness at most 54.2%. Only the best model elicited much of the members' private preferences (64.0% completeness; all others 31% or below). Read 2026-11-23 (first 100,000 characters).
- **TravelBench** (Cheng et al.; arXiv 2512.22673, ACL 2026 main). Real user queries, ten tools, a subtask where the agent must recognise a request it cannot meet. Abstract gives no scores.

**What still goes wrong (as of 2026).**
1. Meeting every rule at once. Single-rule checks pass, the full conjunction fails. (TravelPlanner, ChinaTravel, GroupTravelBench plan validity.)
2. Time and space. Visit-time and travel-time violations (TRIP-PAL); poor spatio-temporal reasoning (TravelEval).
3. Pace and fatigue. Plans are feasible but exhausting (Trip+).
4. Fairness across members (GroupTravelBench).
5. Revising a plan without losing the person's intent (Trip+ replanning).
6. Invented or wrong places. ChinaTravel reported semantic POI accuracy falling when the data was messier (94% to 76% for DeepSeek-V3). Honest caveat: I found no 2026 paper that measures invented places for frontier models alone.

**Where a 2024 finding may no longer hold.** The "0.6%" style numbers are for GPT-4-era models. By late 2025 GPT-5 was at 21.2% on the same benchmark, and by 2026 frontier models are largely feasible for one traveller (Trip+ feasibility 0.88). So "LLMs cannot plan" is out of date. What still holds: strict all-rules-pass for groups, pace, and replanning are weak, and the benchmarks above use their own tools and data, not yours. Comparing numbers across papers is unsafe. Splits, tools and metrics differ.

**What this says about code and model.**
- Code should hold: filtering by hard rules, the pace and time budget, route order, and the final pass/fail check. These are the failures that remain, and they can be checked by a program.
- The model is good at: turning free text into structured fields, wording, and conversation. Hao et al. and ITINERA both put the LLM at the edges (understanding, narration) and a solver in the middle.
- A fair challenge to your rule: Google's production system lets the LLM draft the plan, then an optimiser repairs it (see section 5). That works, but it means the model's draft influences who gets a turn. Your weighted draw is the safer, more repeatable version.

---

## 2. The itinerary as an optimisation problem

**The model.** The orienteering problem (OP) picks a path of limited length that visits some places to collect the most "profit". The team orienteering problem with time windows (TOPTW) adds several routes (days) and opening hours. Tourist trip design is the classic application. Sources: Vansteenwegen, Souffriau and Van Oudheusden, "The orienteering problem: a survey", European Journal of Operational Research 209(1), 2011, pp. 1 to 10 (bibliographic pages only; I did not open the paper). Gavalas, Konstantopoulos, Mastakas and Pantziou, "A survey on algorithmic approaches for solving tourist trip design problems", Journal of Heuristics 20(3), 2014, pp. 291 to 328 (bibliographic pages only). A 2025 survey (Shen, Zhou, Lei, Wu; arXiv 2512.16865) was read in part.

**How big is hard?** From the 2025 survey (HTML read 2026-11-23): exact methods are mostly limited to small graphs (one compact formulation under about 100 nodes; one branch-and-cut reached 7,397 nodes on plain orienteering). Heuristics solved instances of 908 nodes, over 1,000 nodes, and 7,000 nodes "within minutes" for various variants. TOPTW work still uses heuristics and constraint programming, and exact proofs "do not scale well" to large benchmark sets.

**Your size.** 300 candidates, 3 to 4 days, perhaps 4 to 8 stops a day. That is small by these standards. Inference: a greedy insertion with a few rounds of swap and move improvements, plus a checker, should find good plans in well under a second in plain TypeScript. I found no paper that benchmarks that exact claim, so test it on your own data. A solver is not needed for size. It would be needed only if the rules grow (many time windows, meal slots, multiple vehicles) and the greedy approach starts failing the checker.

**Profit and your no-scores rule.** The OP needs a "profit" per place. You may not use ratings or scores to rank places. Recommendation (inference): profit is only the party's taste weight for that place's tags plus the exposure-ledger bonus. It is never a quality score, and it is never shown. This is the same thing your weighted draw already does. Check that your owner accepts that reading.

**Practical solvers, and whether they run in a serverless JS/TS setup.**

| Option | Licence | JS/TS? | Notes |
|---|---|---|---|
| Google OR-Tools | Apache 2.0 (LICENSE read) | Official languages: C++, Python, Java, .NET (install page read). No JS or WASM mentioned. | Community port `or-tools-wasm` (Apache 2.0) claims CP-SAT, routing with time windows, MPSolver, running in browser, Node, Deno and Bun. 76 stars, no releases listed in the capture. Maturity UNVERIFIED. |
| Mapbox node-or-tools | MIT | Node native bindings, 2017-era | Old. Needs prebuilt native binaries. Not serverless-friendly. |
| VROOM | BSD-2-Clause | No. C++20 engine. CLI, HTTP wrapper (vroom-express) or C++ library | Time windows, skills, breaks, multi-vehicle. Works with OSRM, Openrouteservice, Valhalla or your own cost matrix. It is built for delivery vehicles, so a tourist "profit" objective is awkward. Needs a separate service. |
| HiGHS via highs-js | MIT | Yes. WASM, Node and browser | LP and mixed-integer LP. No built-in routing. You would write the OP as integer linear constraints. Fine for small models. |
| Z3 | Not stated on the page I read | Yes. `z3-solver` npm, built from WASM | Used by Hao et al. Heavy for this job. |
| Fast Downward (PDDL) | Not checked | No (C++) | Used by TRIP-PAL. 800 extra seconds for 18 POIs in Rome in that paper. Too slow for your size without care. |

**How published systems combine solver and LLM.**
- TRIP-PAL: LLM extracts and rates POIs, planner schedules (above).
- ITINERA: LLM decomposes request and retrieves, TSP solver orders, LLM narrates (above).
- Google Search "AI trip ideas" (blog, 6 Jun 2025, Zhai and Awasthi): LLM drafts a day-by-day plan with durations and importance. The draft is grounded with current opening hours and travel times. Search backends supply substitute activities. A two-stage optimiser then scores each day's possible activity subsets (a completely infeasible day scores zero), and a local search swaps activities between days to keep the plan close to the draft. No metrics are given.
- Hao et al.: LLM writes the solver code, solver decides, the unsat core drives a repair dialogue with the person.

**Small design for your case (inference).** Four stages: (1) filter by hard rules and opening days; (2) split the days by geography, by clustering candidates on the road leg; (3) fill each day by the weighted draw within a time and drive budget; (4) order the day's stops by cheapest insertion, then improve by local swaps, then check. If the check fails, redraw (bounded). If it still fails, say plainly what could not be met and offer a change. That last step mirrors the unsat-core repair in Hao et al.

---

## 3. Finding out what people want

**Conversational and cold-start work.**
- Jannach, Manzoor, Cai and Chen, "A Survey on Conversational Recommender Systems", ACM Computing Surveys 54(5), 2021 (arXiv 2004.00646). Abstract read: groups approaches by supported intents and background knowledge, and reviews evaluation practice.
- Rashid et al., "Getting to know you: learning new user preferences in recommender systems", IUI 2002, pp. 127 to 134. Search summary only: six techniques for choosing which items to ask about, and the choice significantly changes user effort and accuracy. Paper not opened.
- Christakopoulou, Radlinski and Hofmann, "Towards Conversational Recommender Systems", KDD 2016, pp. 815 to 824. Search summary only: a question-selection framework improved a static model by 25% after 2 questions (UNVERIFIED; the Microsoft and Google abstract pages differ on what data was used).
- Pu and Chen on user-involved elicitation (AI Magazine 29, 2008) and Chen and Pu on critiquing-based recommenders (User Modeling and User-Adapted Interaction 22, 2012, pp. 125 to 150). Abstract pages only. The 2012 survey sorts critiquing into natural-language, system-suggested and user-initiated critiques and argues for a hybrid. I could not open the 2008 PDF (certificate error), so claims about "preferences are constructed while people see examples" are from my background reading, UNVERIFIED.

**Critiquing.** "More like this, but quieter" is critiquing. The survey above supports it as an established method. It lets people react to a concrete draft rather than describe their tastes from nothing. That matches your product: show a day, let people tap "quieter", "shorter walk", "more for the kids".

**Picture-based elicitation.** Neidhardt, Seyfang, Schuster and Werthner, "A picture-based approach to recommender systems", Information Technology & Tourism 15, 2015, pp. 49 to 69 (not opened; known from search summaries). The Seven-Factor model combines Big Five personality and 17 tourist roles. Sertkan, Neidhardt and Werthner, "Eliciting Touristic Profiles: A User Study on Picture Collections" (arXiv 2006.05172, June 2020), read in HTML. Seven factors: Sun & Chill-Out, Knowledge & Travel, Independence & History, Culture & Indulgence, Social & Sports, Action & Fun, Nature & Recreation. 81 participants chose 3 to 7 pictures (3 was most common at 52%). Half finished in 2.7 minutes. 65% agreed or strongly agreed the profile matched. About 90% edited at least one factor, three on average. Sun & Chill-Out drew the most disagreement (37%). Honest read: quick, pleasant and a decent first guess, but not a final answer. The model is built for individual leisure destinations, not family road trips.

**LLM-led elicitation.** Li, Tamkin, Goodman and Andreas, "Eliciting Human Preferences with Language Models" (GATE; arXiv 2310.11589, Oct 2023). Read in HTML and the PDF text. 388 participants over content recommendation, moral reasoning and email validation. GATE (the model asks yes/no or open questions, or shows edge cases) beat no elicitation in all domains (significant at 0.05 in all but email), beat user-written prompts in 6 of 10 settings by absolute score and 7 of 10 by area under the curve, and was no more mentally demanding. On content recommendation, open-ended questions significantly beat supervised and pool-based active learning. Key warning, quoted: people are "usually not aware of their mental limitations when writing prompts". Perceived coverage dropped from 5.3 to 3.9 after people saw test cases. This is a 2023 study with 2023 models, on tasks that are not travel. The method is likely to hold up better than the exact numbers.

**Stated versus revealed.**
- Kim, Buntain and Ciampaglia (arXiv 2604.11517, CSCW 2026, read abstract). Young adults engaged with content they did not endorse. When curating an ideal feed they weighed trade-offs and social context. It is news feeds, not travel. It supports the general point only.
- Delic et al. (below) found groups' final choices were not predictable from members' starting preferences, and "group preferences are not just an aggregation … but are rather constructed during the process".
- A 2022 preprint on preference change is cited in a search summary (UNVERIFIED).
- A vendor blog claimed 34% predictive accuracy for stated preference. It cited no source. Ignore it.

**How many questions before people drop off.** I found no tourism study that measures drop-off by interview length. What exists: Rashid et al. and Cremonesi and Garzotto treat the number of ratings a new user must give as the main effort cost (search summary only; Cremonesi paper not opened). Sertkan et al. is the closest number: about 2.7 minutes for a picture task finished by half of participants. Anything about "5 questions" or "10 minutes" would be my guess. **Gap.**

**Hard rules versus tastes (inference from the sources above).**
- Hard rules are things that cause harm or exclusion if wrong: allergy, diet, mobility and access, hard budget, hard time limits. They should be asked with fixed choices (chips), one at a time, and read back for confirmation. GATE shows people miss cases when they write free text. So the app should show edge cases ("Is a 400 m uphill walk fine for everyone?") instead of asking "anything else?".
- Tastes are leanings. They should be asked with pictures, pairs and reactions to a draft, never as ranked lists. They can be wrong and can change.

**The purpose of the trip.** The tourism motivation literature uses "push" (the traveller's internal motives) and "pull" (the place's features), from Crompton (1979) and Dann (1977, 1981). I did not open those originals; the framing comes from search summaries of later papers. A recent study proposes linking motivation, destination preferences, constraints and expectations (search summary, UNVERIFIED). Nobody I found tests "asking the purpose first" against not asking. My inference: purpose is the best single input for deciding what the plan is for (rest, bonding, culture, celebration), and it is cheap to ask in one line. Treat it as a tilt on tastes, not a rule.

---

## 4. Groups and families

**Aggregation.**
- Masthoff, "Group Modeling: Selecting a Sequence of Television Items to Suit a Group of Viewers", User Modeling and User-Adapted Interaction 14(1), 2004, pp. 37 to 85. The PDF returned 403, so I relied on the chapter abstract and a tutorial deck described in a search summary. Strategies studied include average, least misery, average without misery, multiplicative, plurality voting, Borda and Copeland. People used some of these strategies themselves, and put more emphasis than expected on giving each person their best-rated item even at a cost of misery for someone else, and on the first and last items. I did not find the exact definition of "most pleasure" in a source I read. Standard meaning (my knowledge, UNVERIFIED): take the highest individual score.
- Masthoff and Gatt, "In pursuit of satisfaction and the prevention of embarrassment", User Modeling and User-Adapted Interaction 16(3 to 4), 2006, pp. 281 to 319 (search summary only). Satisfaction is treated as an affective state that decays and is influenced by others. The paper also covers privacy and embarrassment when members' tastes are revealed to the group, and suggests a virtual member to protect privacy.
- Delic, Neidhardt, Nguyen and Ricci, "Research Methods for Group Recommender Systems" (RecTour 2016, CEUR Vol-1685), read in full text. Quote: there is no ultimate winner among aggregation strategies. In their tourism destination study, more than two-thirds of people whose top choice lost were still satisfied. Common aggregation strategies "were hardly able to predict the outcome". Social role and personality influenced the choice.

**What goes wrong with each (standard reasoning; the sources above support "no winner").**
- Average: the loud majority wins and one person's strong need gets averaged away. That is dangerous if the need is a hard rule. So hard rules must never go through averaging.
- Least misery: the most cautious person sets the bar for everyone, and the plan turns bland.
- Most pleasure: ignores people who are unhappy.
- Over a sequence (a multi-day trip): none of these remembers that Day 1 was someone else's day. Masthoff's work and people's own behaviour point to fairness over time: track who has had a turn.

**Asking separately or together.** I found no study that directly compares the two. Evidence points both ways. GroupTravelBench (2026) found that models that elicit each member's private preferences did far better on completeness. Masthoff and Gatt raise privacy and embarrassment when preferences are visible to others. Delic et al. show preferences change in discussion. Inference: ask each person privately for tastes, show a merged view without attribution, then let the family adjust together.

**Family and travel research.** What I could open is thin and mostly secondary.
- Children's influence. Curtale (STRC 2016, read in full text) cites Shoham and Dalakas (2005) for children's influence on family vacation decisions of "around 20% and 49% depending on the cultural background and specific decision". It reports that research is mixed on whether older children have more impact (Gram 2007; Martensen and Grønholdt 2008 cited). A 2025 Springer paper found children, mothers and fathers perceive influence differently (search summary only; paywalled). A study of 745 primary-school children found strongest influence in early planning stages (search summary only). I did not open Thornton, Shaw and Williams (1997) or Gram (2007).
- Multigenerational travel. A 2025 review says research is limited and has focused on nuclear families (search summary). Motivation: time together. An industry survey (Family Travel Association 2025) found 66% of grandparents enjoy extended time with grandchildren. Treat it as industry data, not peer-reviewed.
- Accessible tourism. Darcy, Cameron and Pegg, "Accessible tourism and sustainability: a discussion and case study", Journal of Sustainable Tourism 18(4), 2010, pp. 515 to 537, read in full text. Disability is a multi-dimensional construct. The dimensions listed: mobility, hearing, vision, cognitive/learning, mental health, and sensitivities and long-term health conditions. Each has its own access requirements. They also link ageing and disability. I did not open Darcy and Dickson (2009) or Darcy and Buhalis (2011).
- Car sickness in children. A population survey, "Survey of motion sickness susceptibility in children and adolescents aged 3 months to 18 years" (PubMed 31087161, Journal of Neurology 2019 per a search summary). Reported: susceptibility peaks between ages 4 and 13 and is rare before age 1 (inverse U-shaped). I could not open the page (cookie wall), so this is from the search summary, UNVERIFIED. I found no study giving break intervals or maximum journey length by age.
- Pace and rest by age. I found no peer-reviewed source. Trip+ (2026) shows that models get pace wrong in almost every valid plan.

**Concrete party dimensions, with honest support levels.**

| Dimension | How to ask | Type | Source and support |
|---|---|---|---|
| Life-stage band per person (baby, toddler, 4 to 12, teen, adult, older adult) | Chip | Context for hard rules and pace | Motion sickness by age (UNVERIFIED reading); children's influence (secondary). Bands are common practice. **Moderate** |
| Access needs by dimension: mobility, hearing, vision, cognitive/learning, mental health, long-term health | Coarse chips, e.g. "needs step-free", "needs frequent seating", "sensitive to noise and crowds" | Hard rule | Darcy et al. 2010. **Strong** as a framework. Which place attributes meet each need is a data problem |
| Walking tolerance (metres or minutes before rest) | Slider with example walks | Hard cap per person, taste above the cap | No source gave numbers. **Folk wisdom, set defaults and let people edit** |
| Diet and allergy | Chips, with allergy marked as non-negotiable | Hard rule | Safety, no source needed. Religion-linked diets are kept as "diet", never as "religion" |
| Budget ceiling | One number for the trip, not per stop | Hard rule | Standard |
| Drive block length and daily drive total | Default by youngest child, editable | Hard cap | **Folk wisdom.** Motion sickness evidence says "plan breaks" only |
| Rest and meal rhythm (naps, early dinner) | Chips | Hard window if a nap, soft if a preference | **Folk wisdom** |
| Interests (nature, culture, food, activity, quiet, social) | 3 to 7 pictures per person | Taste | Seven-Factor model. 65% match, 90% edited. **Moderate** |
| Crowd and noise tolerance | Pair or picture | Taste, becomes hard if marked as sensory need | Seven-Factor has a Nature/Recreation factor about avoiding crowds; otherwise inference |
| Novelty versus familiar | Pair | Taste | Inference |
| Trip purpose | One sentence plus a short pick list | Tilts the plan | Push and pull motivation, **moderate** for the idea, **guess** for how to use it |
| Who gets a turn (fairness) | Not asked, tracked | Plan balance | Masthoff on sequence fairness. **Moderate** |
| Decision roles in the family | Not asked | None | Delic et al.: roles and personality shape choices. **Weak for planning use** |
| Who pays, budget sharing | Optional | Budget | Industry survey only. **Weak** |

---

## 5. Architecture patterns from people who built these

**Travel-specific write-ups.**
- Google Research, "Optimizing LLM-based trip planning" (Zhai and Awasthi, 6 Jun 2025), read in full. Described in section 2. Key lines: the LLM plan is "well-tailored to the user's interests but may have feasibility issues". The optimiser adjusts the plan to be feasible while staying close to the original. Search backends add substitutes in parallel. In an NYC example, when the person wanted lesser-known museums, the hybrid gave only those, while a search-only version included famous ones. No metrics reported.
- Google Gemini blog, "How Gemini plans such detailed vacation itineraries for you" (6 Aug 2026), read in full. Four stages (gather live data, find recommendations, build the itinerary, finalise). It pulls live data from Maps, Flights and Hotels, "cross-referenc[es] times and locations", and in its Spark mode "suggests the best choices and lets you make the final decision". It does not describe replanning or give any architecture detail, so it is a product description, not an engineering account.
- A solo builder's post on DEV Community, "How I stopped my AI trip planner from inventing addresses" (by "@roccia"; undated, "Jun 16"), read in full. Pipeline: ground first (verified places with real coordinates, city-filtered), typed output enforced at decoding, then overwrite coordinates and links from the places table after generation, long jobs on a durable queue, and "decide what the model may be right about". Lower authority than a company post, but it matches the others.
- DocentPro and LangChain case study (search summary only, not opened): K-means groups POIs by area, route reordering, and filters that remove hallucinated or closed places (UNVERIFIED).
- Booking.com: press and customer-story coverage (OpenAI, Skift, VentureBeat), launched June 2023 with an OpenAI-based planner, routes across several models, and a leader's remark that "managing memory is much harder than actually building memory" (search summary, UNVERIFIED). I found no engineering blog from Booking.com, Expedia or Airbnb on trip planning.

**General agent guidance (Anthropic).**
- "Building effective agents" (19 Dec 2024), read. "Workflows are systems where LLMs and tools are orchestrated through predefined code paths", agents "dynamically direct their own processes". Start with the simplest solution. Evaluator-optimizer is good when there are clear evaluation criteria. Invest in tool design (the agent-computer interface).
- "Writing effective tools for agents" (11 Sep 2025), read. Consolidate chained steps into one tool, return readable context, support concise and detailed responses, give actionable error messages, evaluate on realistic tasks.
- "Effective context engineering for AI agents" (29 Sep 2025), read. Keep lightweight references and load details on demand; compact long histories; keep notes outside the context window; use sub-agents for focused work. "Find the smallest set of high-signal tokens".
- "Effective harnesses for long-running agents" (26 Nov 2025), read. Each new session starts with no memory, so state lives in files: a progress log, a structured feature list marked pass/fail, and a startup routine that reads them. Written for coding agents, but the pattern (state in a durable record, not in chat) transfers.
- "Demystifying evals for AI agents" (9 Jan 2026), read. See section 6.

**What these sources say on your five themes.**
- Grounding in a place database. Everyone does it. Overwrite model-written coordinates, hours and names from the store after generation (solo builder). Ground the draft in live hours and travel times (Google). Your stories-with-citations rule is stricter than any of these.
- Verification. Critics and checkers raise pass rates (LLM-Modulo) but have limits: refinement stalls after 3 to 5 rounds (ChinaTravel), and the best LLM-Modulo run in TravelPlanner still passed only about a fifth. Solver-based checks do far better (Hao et al.).
- Tool design. Few, consolidated tools. A "check this day plan" tool that returns specific, actionable violations is the evaluator-optimiser pattern in tool form.
- Long-running multi-day state. Keep the trip as a structured record outside the chat: party, locked stops, done stops, today's plan, and a log of changes. Reload it each session. This is the "memory is harder than building memory" problem. Your three memory layers (hard rules on device, tastes that fade, today's trip) are already the right shape.
- Replanning mid-trip. The best evidence is negative: models detect the need but revise poorly (Trip+). Google's "stay close to the original plan" objective is the only published design principle I found for repair. Inference: keep what has happened and what is booked fixed, and re-run only the remaining slots.

---

## 6. Proving it is personalised

**Published methods a solo builder can run.**
- **Behavioural testing.** Ribeiro, Wu, Guestrin and Singh, "Beyond Accuracy: Behavioral Testing of NLP models with CheckList" (arXiv 2005.04118, ACL 2020). Abstract read: a task-agnostic method that tests behaviour by capability and test type, and in a user study practitioners "created twice as many tests" and found almost three times as many bugs. The abstract does not name the test types. From memory they are minimum-functionality, invariance and directional-expectation tests (UNVERIFIED in this session). Your "same route, different family" test is a directional-expectation and invariance test.
- **Simulated users.** Zhang and Balog, "Evaluating Conversational Recommender Systems via User Simulation" (arXiv 2006.08732, KDD 2020), abstract read. Simulated users that model preferences and interaction flow correlate strongly with human judgement in their experiments. Trip+ (2026) uses a simulator with four judge-model families and takes the median.
- **LLM judges.** Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (arXiv 2306.05685, NeurIPS 2023). Strong judges reach over 80% agreement with human preferences. Known biases: position, verbosity, self-preference.
- **Citation checks.** Gao, Yen, Yu and Chen, "Enabling Large Language Models to Generate Text with Citations" (ALCE; arXiv 2305.14627, EMNLP 2023). On ELI5, even the best models lacked complete citation support 50% of the time. That is a 2023 result, but it is the reason to check quotes by code.
- **Agent eval practice.** Anthropic's evals post (above): start with 20 to 50 tasks from real failures, prefer code graders, grade outcomes not paths, calibrate model graders against humans, run pass^k when consistency matters, and read transcripts. A persistent 0% usually means a broken task, not a weak agent.
- **Benchmarks to borrow from.** TripCraft's continuous scores (meal timing, spatial, ordering, persona), TravelEval's six dimensions (accuracy, compliance, temporality, spatiality, economy, utility), and Trip+'s traveller-experience dimensions (physical, schedule, environmental, budget).

**A set of checks that follows (inference).**
1. **Hard-rule violation rate**: code check on every generated plan, target zero. One failure is a bug, not a statistic.
2. **Counterfactual pairs**: fix dates, route and seed; change one traveller (add a wheelchair user, add a toddler, remove a vegetarian). Expect specific differences (step-free only, shorter blocks, no meat-only meals) and expect sameness elsewhere (the anchor stop, stops unaffected by the change). Measure the overlap of stops and the change in walking distance, drive blocks and tags, all computed by code. Run with k seeds because the draw is random. Invariants must hold on all k (pass^k).
3. **Counterfactual on purpose**: same party, purpose changed from "rest" to "adventure". Expect pace and stop mix to move in the right direction.
4. **Fairness check**: across days, each member's tastes are served at least once. Count turns by code.
5. **Grounding check**: every sentence in a reply carries a story id, every quote is an exact substring of that story, and every place name exists in the store. All by code.
6. **Replan test**: inject "running 90 minutes late", "attraction closed", "child tired". Expect locked stops unchanged, remaining stops fit the new budget, and changes are minimal.
7. **Persona simulation**: 10 to 20 hand-written parties and a model playing each in the interview. This tests the interview flow and whether the model asks for hard rules, not whether plans are good.
8. **Human review**: the first real trips are the test. Log what the parties edit. Log what they edit. Edits are the measure of "personalised": if people rewrite pace and stops, the plan was generic.

Honest limits: none of the published benchmarks test "does the plan change in the right ways when the party changes". Trip+ and GroupTravelBench come closest and both rely partly on LLM judges.

---

## 7. Privacy by design for this kind of data

Design guidance only. Law is another lane.

- **Eight privacy design strategies.** Hoepman, "Privacy Design Strategies" (arXiv 1210.6621, 2012, v2 2013), abstract read: Minimise, Hide, Separate, Aggregate, Inform, Control, Enforce, Demonstrate. The first four are the ones that apply to the profile: collect less, keep it where the model and server cannot read it, keep pieces apart, and store coarse groups not details.
- **Local-first software.** Kleppmann et al., Ink & Switch essay (April 2019), read. Primary copy on the user's device; servers hold only encrypted copies; "you retain ultimate ownership and control". That matches your hard-rules-on-device choice.
- **Models infer what you did not say.** Staab, Vero, Balunović and Vechev, "Beyond Memorization: Violating Privacy Via Inference with Large Language Models" (arXiv 2310.07298, 2023), abstract read: LLMs inferred attributes from Reddit text with up to 85% top-1 accuracy, and text anonymisation and alignment were ineffective against it. So a free-text note like "my dad gets tired after stairs" tells a provider a lot even without a diagnosis.
- **Models do not keep secrets reliably.** Mireshghallah et al., ConfAIde (arXiv 2310.17884, 2023, v2 2024), abstract read: GPT-4 and ChatGPT revealed private information in 39% and 57% of cases, and prompts did not fix it. Those are 2023 models. Do not rely on instructions such as "do not mention the diagnosis". Remove the data.
- **OWASP Top 10 for LLM Applications 2025.** Lists "Sensitive Information Disclosure" (LLM02) and "Excessive Agency" (LLM06) among the risks. Only the item names and the first words of each summary were readable on the page.
- **Other frameworks.** EDPB Guidelines 4/2019 on data protection by design and default (v2.0, 20 Oct 2020) and the NIST Privacy Framework (v1.0, v1.1 draft) exist. I could not read their body text through the fetch tool, so I cite them only as pointers.

**What follows for design (inference).**
- Keep the party profile on the device. Send the server and model only what code produces from it: the chosen stops, their stories and a reason code such as "step-free" or "short walk".
- Store coarse categories ("needs step-free", "needs frequent seating"), never diagnoses. Store "diet: halal" as a diet chip, not as a religion field.
- Where free text is wanted (trip purpose, wishes), warn once that it goes to the AI provider, prefer chips, and do not log it.
- Do not use the model to decide anything about a hard rule. Code filters first.
- Children: store an age band, not a birth date or name.
- Separate stores: the hard-rule record, the taste record and the trip record live apart. Taste fades and expires. Trip record is deleted after the trip (owner's choice).
- Private asks: when several people answer on one phone, hide earlier answers and show only the merged result (Masthoff and Gatt on embarrassment).

---

## A design that follows from this

Labels: **[E]** supported by evidence, **[I]** reasonable inference, **[G]** my own guess.

### The interview

Order matters. Ask the trip first, then the party, then tastes, then show a draft. Total target: under 10 minutes for the party, but I found no evidence for any length. **[G]**

1. **The trip (once per trip, by the organiser).** Dates, start and end point, vehicle, nights, rough daily driving appetite, budget ceiling, one-line purpose in the person's words plus a pick from a short list (rest, family time, celebration, curiosity, adventure). Ask "what would make this trip a success?" and "what would spoil it?" **[I]** (push motivation; the success and spoil questions are my guess **[G]**)
2. **Per person (each member, privately where possible).** Name or nickname, age band, access chips (the six Darcy dimensions in plain words), diet and allergy chips, rest rhythm, walking comfort with example walks. **[E]** for the access framework, **[I]** for the rest.
3. **Tastes per person.** Three to seven pictures from a set that fits northern Malaysia (sea, hill, old town, food stall, craft, wildlife, quiet), then two or three this-or-that pairs. One "I would rather skip" tap. Merged view with no attribution. **[E]** for pictures (65% match, 90% edited, under 3 minutes); the pairs and the skip tap are **[I]**.
4. **Edge-case questions, model-led, capped at about 3.** The model proposes concrete borderline cases derived from the answers ("a 500 m uphill walk to a lookout. Fine for everyone?"). The answers land in the structured record, not in the chat. **[E]** for the method (GATE), **[G]** for the cap.
5. **Show a draft and critique it.** Chips such as "quieter", "shorter walk", "more for the kids", "more food". Each tap changes a weight or a cap in code. **[E]** for critiquing.
6. **Read back the hard rules in one plain screen** before the plan is final. **[I]**

Children: ask a parent for the age band and needs. If a child wants to choose, give them their own picture round and mark it as a child's. Evidence on children's influence is mixed and mostly secondary. **[I]**

### The party model

- **Hard rules (code filters, never averaged, on the device):** allergy and diet, access needs per person, budget ceiling, daily drive cap, maximum single drive block, walking cap per person (the smallest cap in the party wins), fixed rest windows. **[E]** for access dimensions, **[G]** for the numeric defaults.
- **Tastes (weights, fade over time, can be wrong):** interests, crowd tolerance, novelty, pace preference, purpose tilt. **[I]**
- **Fairness state (tracked by code):** a ledger of whose interests have been served, alongside your existing place exposure ledger. **[I]**
- **Trip state (third memory layer):** locked stops, visited stops, today's plan, change log, a "tired" flag. **[I]**

### How candidates are chosen and ordered

1. Filter by hard rules and opening days. Code. **[E]** (every strong result puts rule checks in code or a solver)
2. Split the trip into day regions by geography. Code. **[E]** (ITINERA, DocentPro summary)
3. Per day, draw stops by weight. Each place's weight comes from the party's tastes, the purpose tilt, the exposure ledger and the fairness ledger. Never from ratings. Code. **[I]** (your existing method extended)
4. Order by cheapest insertion, improve by local swaps within the day's time and drive budget. **[I]** (sizes from the OP survey; no exact test found)
5. Check every rule. If anything fails, redraw within a bound, then report what could not be met. **[E]** (LLM-Modulo, Hao et al.)
6. Pace is a budget the code spends: total walking, total drive, rest windows, stops per day, scaled by the weakest member and by youngest child. **[E]** that models fail here (Trip+); **[G]** for the scale.

### Where the model is used, and where it is not

- **Used:** turning free text into structured fields (purpose, wishes); proposing edge-case questions; writing the reply; quoting stories verbatim; explaining in plain words why a stop was chosen for this family, using reason codes that code supplies. **[E]** (every hybrid system puts the LLM at the edges)
- **Not used:** hard-rule filtering, choosing stops, route order, time and pace arithmetic, fairness tracking, checking its own output, anything about what a place is like beyond the cited stories. **[E]** for the failures above; also your standing rules.
- **Tension with your rule.** Google lets the LLM draft the plan first. That could add personalisation that weights alone miss, but it also means the model's draft biases who gets a turn and cannot be reproduced. My recommendation keeps your rule: if the model suggests anything, let it propose weight tilts from free text, and let code accept or reject them. **[I]**

### How the plan changes mid-trip

- Triggers: a person taps "tired", "running late", "closed", "weather", or the clock passes a checkpoint. **[I]**
- Code keeps done stops and booked stops. It re-runs the draw for the remaining slots against the new time budget and the changed pace flag, preferring a plan close to the old one. **[E]** for "stay close" (Google), **[E]** that models do this badly (Trip+).
- The model words the change in a sentence and shows what was dropped. Nothing is silently removed. **[I]**
- If the new plan breaks a rule, say so and ask. Do not quietly relax a hard rule. **[E]** (the unsat-core repair in Hao et al.)

### How to test it

Use the eight checks in section 6. Start with 20 to 30 hand-made party cases, including awkward ones. Code graders first, model judge only after checking its agreement with a person's own reading. Run each case with several seeds. Take the first real trips as the field test and record what the party edits. **[E]** for the method, **[I]** for applying it here.

---

## Open questions the research could not settle

1. Does a deeper interview or a party-specific plan make people more satisfied than a good generic one? I found no study. This is the feature's core thesis and it is untested.
2. How many questions before people drop off, for a trip interview? No tourism data found.
3. Rest intervals, maximum drive blocks and walking caps by child age. No peer-reviewed source found.
4. Ask members separately or together? No direct comparison found. The design above is inference.
5. Does "purpose of trip" improve recommendation quality? Plausible, never tested in the sources I found.
6. Is a plain TypeScript heuristic on 300 candidates as good as an exact solver? Inference from survey scale. Needs a test on real data.
7. Maturity of the `or-tools-wasm` port. Not verified.
8. How far 2026 benchmark findings carry to a rural road trip with sparse, story-based data. The benchmarks use cities and structured POI data.
9. How well LLM judges of "fatigue" and "experience" (Trip+) agree with real people. Not reported in what I read.
10. Whether the Seven-Factor pictures work for a Malaysian family audience. The studies were European.

---

## Source list

All read 2026-11-23 unless marked. "Abstract" means the arXiv or publisher abstract page only. "HTML part" means the fetch tool cut the page at about 100,000 characters.

Section 1
- Xie et al., TravelPlanner. https://arxiv.org/abs/2402.01622 (abstract)
- Gundawar et al., LLM-Modulo. https://arxiv.org/abs/2405.20625 ; https://arxiv.org/html/2405.20625 (HTML, table read)
- Hao et al., formal verification tools. https://arxiv.org/abs/2404.11891 ; https://arxiv.org/html/2404.11891 (HTML part)
- Zheng et al., Natural Plan. https://arxiv.org/abs/2406.04520 (abstract)
- de la Rosa et al., TRIP-PAL. https://arxiv.org/abs/2406.10196 ; https://arxiv.org/html/2406.10196
- Tang et al., ITINERA. https://arxiv.org/abs/2402.07204 ; https://arxiv.org/html/2402.07204 (HTML part)
- Chaudhuri et al., TripCraft. https://arxiv.org/abs/2502.20508 (abstract; ACL 2025 page from search: https://aclanthology.org/2025.acl-long.834, not opened)
- Zhu et al., Planner-R1. https://arxiv.org/abs/2509.25779 (abstract)
- Shao et al., ChinaTravel. https://arxiv.org/abs/2412.13682 ; https://arxiv.org/html/2412.13682 (HTML part)
- Corrêa et al., Frontier LLMs rival planners. https://arxiv.org/abs/2511.09378 (abstract)
- Zhang et al., DeepPlanning. https://arxiv.org/abs/2601.18137 (abstract)
- Chen et al., TravelEval. https://arxiv.org/abs/2606.01046 (abstract)
- Chen et al., Trip+. https://arxiv.org/abs/2606.21169 ; https://arxiv.org/html/2606.21169 (HTML part)
- Cheng et al., GroupTravelBench. https://arxiv.org/abs/2605.25200 ; https://arxiv.org/html/2605.25200 (HTML part)
- Cheng et al., TravelBench. https://arxiv.org/abs/2512.22673 (abstract)
- Not opened: PDEU-Bench (arXiv 2609.34930), TREK (2607.26977), LLM-based Personalized Travel Planner (2611.25531), Vaiage (arXiv 2505.10922 abstract only read).

Section 2
- Vansteenwegen et al., orienteering survey, EJOR 2011. Bibliographic pages only: https://ideas.repec.org/a/eee/ejores/v209y2011i1p1-10.html
- Gavalas et al., TTDP survey, J. Heuristics 2014. Bibliographic pages only: https://unpaywall.org/10.1007%2FS10732-014-9242-5
- Shen et al., orienteering survey 2017 to 2025. https://arxiv.org/abs/2512.16865 ; https://arxiv.org/html/2512.16865v1 (HTML part)
- OR-Tools install page. https://developers.google.com/optimization/install ; licence. https://github.com/google/or-tools/blob/stable/LICENSE
- or-tools-wasm. https://github.com/Axelwickm/or-tools-wasm
- VROOM. https://github.com/VROOM-Project/vroom
- highs-js. https://github.com/lovasoa/highs-js
- Z3 JS bindings. https://github.com/Z3Prover/z3/tree/master/src/api/js
- Google Research, Optimizing LLM-based trip planning. https://research.google/blog/optimizing-llm-based-trip-planning/

Section 3
- Jannach et al. https://arxiv.org/abs/2004.00646 (abstract)
- Li et al., GATE. https://arxiv.org/abs/2310.11589 ; https://arxiv.org/html/2310.11589 ; PDF text extracted locally
- Sertkan, Neidhardt, Werthner. https://arxiv.org/abs/2006.05172 ; https://arxiv.org/html/2006.05172
- Neidhardt et al. 2015 picture-based approach: https://ec.tuwien.ac.at/node/8789 (search result only, not opened)
- Chen and Pu 2012. https://scholars.hkbu.edu.hk/en/publications/critiquing-based-recommenders-survey-and-emerging-trends-2/ (search summary only)
- Rashid et al. 2002. https://pure.psu.edu/en/publications/getting-to-know-you-learning-new-user-preferences-in-recommender-/ (search summary only)
- Christakopoulou et al. 2016. https://www.microsoft.com/en-us/research/publication/towards-conversational-recommender-systems/ (search summary only)
- Kim, Buntain, Ciampaglia. https://arxiv.org/abs/2604.11517 (abstract)
- Pu and Chen 2008 (AI Magazine) PDF: https://www.comp.hkbu.edu.hk/~lichen/download/Pu08AIMag.pdf (certificate error, not read)
- Motivation literature (Crompton, Dann): search summaries only, originals not opened.

Section 4
- Delic et al., Research Methods for Group Recommender Systems (RecTour 2016). https://ceur-ws.org/Vol-1685/paper5.pdf (PDF text extracted locally)
- Delic et al. 2018, Information Technology & Tourism 19. https://link.springer.com/article/10.1007/s40558-018-0106-y (paywall redirect, not read)
- Masthoff 2004. https://abdn.elsevierpure.com/files/4013726/UMUAI04.pdf (HTTP 403, not read; search summary used)
- Masthoff and Gatt 2006. https://www.doi.org/10.1007/S11257-006-9008-3 (search summary only)
- Curtale 2016 (STRC). https://www.strc.ch/2016/Curtale.pdf (PDF text extracted locally)
- Darcy, Cameron, Pegg 2010. https://opus.lib.uts.edu.au/bitstream/10453/12593/1/2009004829.pdf (PDF text extracted locally)
- Motion sickness survey. https://pubmed.ncbi.nlm.nih.gov/31087161/ (cookie wall, search summary only)
- Family and multigenerational studies named in section 4: search summaries only.

Section 5
- Google Gemini trips blog. https://blog.google/products-and-platforms/products/gemini/how-gemini-plans-trips/
- Solo builder write-up. https://dev.to/rocciavia/how-i-stopped-my-ai-trip-planner-from-inventing-addresses-486o
- Anthropic, Building effective agents. https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, Writing effective tools for agents. https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, Effective context engineering. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Effective harnesses for long-running agents. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Booking.com coverage (not opened): https://openai.com/index/booking-com/ ; https://venturebeat.com/ai/booking-coms-agent-strategy-disciplined-modular-and-already-delivering-2

Section 6
- Ribeiro et al., CheckList. https://arxiv.org/abs/2005.04118 (abstract)
- Zhang and Balog. https://arxiv.org/abs/2006.08732 (abstract)
- Zheng et al., LLM-as-a-judge. https://arxiv.org/abs/2306.05685 (abstract)
- Gao et al., ALCE. https://arxiv.org/abs/2305.14627 (abstract)
- Anthropic, Demystifying evals for AI agents. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

Section 7
- Hoepman. https://arxiv.org/abs/1210.6621 (abstract)
- Staab et al. https://arxiv.org/abs/2310.07298 (abstract)
- Mireshghallah et al., ConfAIde. https://arxiv.org/abs/2310.17884 (abstract)
- Ink & Switch, Local-first software. https://www.inkandswitch.com/essay/local-first/
- OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llm-top-10/ (item names only)
- EDPB Guidelines 4/2019. https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42019-article-25-data-protection-design-and_en (page only, PDF not read)
- NIST Privacy Framework. https://www.nist.gov/privacy-framework (page only)

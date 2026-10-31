---
name: project-runbook
description: Plan and run a project from a living runbook: investigate, grill every decision with evidence, lay out milestones that end in something visible, then dispatch numbered items to agents and record outcomes. Use when starting or scoping a project, turning a fuzzy idea into a plan, or resuming a runbook ("resume the X runbook", "dispatch 3c").
---

The **runbook** is the project's single source of truth: decisions, plan, status and outcomes live there, and chat only points at it. One session owns the runbook; every piece of work runs in a dispatched agent with its own small context, so the main session's context is essentially the runbook. Its shape is in [`RUNBOOK.md`](RUNBOOK.md).

Two roles never blur. **Facts** are yours: find them with sub-agents, queries, prototypes and experiments. **Decisions** are the user's: each one is put to them with the evidence, the options and the trade-off they would own, until they can justify it unaided.

## Steps

1. **Open the runbook first.** Create it before any research (a Claude Doc when docs tools exist, otherwise a markdown file at a path the user picks), seeded from `RUNBOOK.md`: every section as a pending block, plus the Contracts and Decision log tabs, so a missing piece shows as a visible placeholder. Done when the user has its link and the top says it is the source of truth.

2. **Investigate in parallel.** Fan out background agents over everything the decisions will rest on: existing code and data models, prior attempts and why they failed, live data volumes and coverage, designs, external practice and data sources. Brief each with the context and a word budget, ask for file:line evidence with evidence and inference marked apart. Done when every area the first decisions touch has a report, recorded under Research with durable file paths (never `/tmp`).

   Also map the **neighbouring work**: other projects, branches and PRs that touch the same surfaces, so each decision names what it leaves to them and what it assumes from them.

3. **Grill in rounds.** Run the `grilling` skill's rounds over the design tree, with these additions:
   - **The user reads the questions and little else**, so a round is one chat message in which every question stands alone: its own context, its options with what each costs, and the recommendation worded so "yes" accepts it. Open the message with a **Settled so far** block of at most three lines, then the numbered questions, then one line saying what the next round covers. Status updates, research summaries and progress narration go in the runbook or in a separate message that carries no question. Explain any unfamiliar term in plain words inside the question that uses it. Evidence supporting a question is one clause inside it, with the runbook section as the pointer.
   - When the user asks where a question is, repeat it in full in the reply. Pointing at the runbook leaves them hunting.
   - **Design every layer a decision touches**, API and data included, not only the visible one. Before putting a design to the user, run the repo's house-rule skills over it (schema, table, API, naming ADRs) and offer at least three options, one of which extends what already exists. Collision-check every new name and URL against existing ones.
   - Keep an **open-question ledger**: restate every unanswered question at the start of each round so none is lost.
   - Steps only the user can do (accounts, dashboards, credentials) go through the `wizard` skill or a numbered walkthrough that says what to expect at each step and what to report back.
   - Settle contested facts by **experiment**, not argument: a prototype on real data, a measured accuracy test, a sample classified by hand. Report measured and inferred separately.
   - When the user asks whether a design is the best one, dispatch an **unbiased** agent: a neutral brief that states the need and constraints and withholds your proposal.
   - Recommend the best tool for the job, not whatever the stack already uses.
   - Push back when the user's premise is weak, and surface known-wrong things as Parked issues rather than dropping them.
   - Guard **scope**: name the boundary once settled, and move anything outside it to Later phases.
   - Write each answer into the runbook as a numbered decision (D1, D2…) with its trade-off before replying in chat. A later decision that changes an earlier one says so on both.

   Done when the frontier is empty and the user confirms shared understanding.

4. **Lay out milestones.** Group the work into milestones, each ending in something the user can **see** and a **check** that proves it worked. Put first the milestone that proves the riskiest part on real data with the cheapest code (scripts, static previews, no production changes), before any production pipeline. Done when every work item sits in exactly one milestone and each milestone names its visible outcome and its check.

5. **Plan the next milestone in the weeds.** Grill that milestone item by item (samples, prompts, thresholds, who does what, where code lives, what the user will look at, pass bars) as questions numbered by milestone (M1.1, M1.2…). Plan later milestones only once the previous one's results are in. Done when every item in the milestone has a plan the user approved.

6. **Dispatch by number.** "Dispatch 3c" sends a background agent to that item with a brief drawn from the runbook. Name the house-rule skills it must load, and check its report says it did; a skill mentioned in passing gets skipped, so review the result against the repo's conventions before calling it done. Set its status to In progress; record the report, plan or PR link in its Outcome; move it to Merging on PR and Done on merge or finished study. Close a milestone only when its check passes, writing up the result and what changed from the plan.

7. **Keep it resumable.** At every pause update the runbook's Where we are: date, current milestone, what is waiting on whom, the next action, what is parked. Done when a fresh session reading only the runbook could continue.

   **Write through.** Anything done outside the runbook is recorded in it in the same turn: PR links, labels applied, merges, approvals given, manual steps still owed (migrations, queries the user must run). Chat never holds a fact the runbook lacks.

   **Audit before every pause and before asking for shared understanding.** Read the runbook back and compare it to `RUNBOOK.md`; fix gaps before replying:
   - every section present and current (Where we are, How we work, Scope with decision numbers, Milestones, Work items, Decisions, Contracts tab, Decision log tab, Open questions, Parked issues, Later phases, diagram, Research);
   - every milestone has all its work items, with dependencies and decision numbers;
   - every decision and amendment is in, each naming what it changes;
   - Research has durable paths, never `/tmp` or agent output files;
   - no leftover, duplicate or superseded blocks.
   Say in the reply what the audit fixed.

## Resuming

On "resume the X runbook": read Where we are, then Open questions, then the work item statuses. Act on the next action named there; ask the user only for what is waiting on them.

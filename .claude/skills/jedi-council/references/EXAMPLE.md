# Worked examples — three scales

The methodology adapts to the artifact. These three examples show it at very different scales — small artifact / two lenses, high-stakes engineering / five lenses, and a case where the right answer is no panel. None of the shapes below is a template; each is what *that* artifact needed.

Everything in the synthesis sections is what to send back to the user in chat. Nothing is written to disk.

---

## Example 1 — short README, two lenses

User asks:
> "I drafted a README for our internal feature-flag CLI. Can you get a council to look at it before I share?"

### The artifact
80 lines at `/tmp/review/README.md`. Audience: engineers in the org who'll install and use the CLI.

### Casting
Two lenses. The artifact is prose; three would have one of them parroting another.

1. Editorial / new-hire onboarding — would a new hire ship from this? Are install steps copy-paste safe?
2. DX / footguns — does the README warn about the things a user will actually trip over?

### Findings

```
| Finding                                         | Flagged by  |
|-------------------------------------------------|-------------|
| Install steps assume Homebrew without saying so | Editorial   |
| No mention that the cache TTL is 5 min, not 30  | DX          |
| "Quick start" is 12 commands long               | Both        |
```

### Synthesis
The README reads well to someone who already knows the tool. The two structural fixes are independent — the Homebrew assumption is editorial; the cache-TTL omission is a footgun a real user will hit. The convergent finding is the Quick Start length: both lenses landed on it independently. Three commands would carry the same information.

No prod-break-mode column here — there isn't one. The artifact is internal documentation, not a payment handler.

### Recommended action
Fix the Homebrew note (one line), add the cache TTL (one line), trim Quick Start to three commands. No round 2.

Then ask the user:
- **Apply all three (Recommended)** — small, mechanical
- Apply only the cache TTL — the others can wait
- Send to the team as-is and gather real friction first

---

## Example 2 — retry policy, five lenses

User asks:
> "I've drafted a retry policy for our payment-webhook handler. Get a panel of experts to stress-test it before I ship."

### The artifact
Plan at `/tmp/review/retry-policy.md`. Exponential backoff with jitter, 7 attempts over 24h, dead-letter to ops queue, idempotency via webhook event ID.

### Casting
Five lenses — the artifact is a reliability primitive with real prod consequences if it fails.

1. Backend correctness — semantics, ordering, edge cases
2. Idempotency — does replay actually do nothing harmful?
3. Observability / on-call — what does a stuck retry look like at 3am?
4. Side-effects / blast radius — what happens when the dead-letter queue itself fills?
5. Pragmatic veteran (contrarian) — does this policy need to exist, or is this engineering retries on a handler that should just be idempotent?

### Sample prompt (Observability)

> *You are the observability / on-call reviewer of a 5-expert panel. Your lens: what does failure look like to the person paged at 3am? Other experts hold correctness, idempotency, side-effects, simplicity — leave those to them.*
>
> *Plan: `/tmp/review/retry-policy.md`. Cite line numbers. Label findings BLOCKING / SUGGESTION / NIT. Under 400 words.*

### Findings — with prod-break-mode (the artifact earns the column)

```
| Finding                                       | Severity | Flagged by                | Conv. | Prod-break mode                                                              |
|-----------------------------------------------|----------|---------------------------|-------|------------------------------------------------------------------------------|
| Idempotency key uses webhook ID, not event ID | BLOCKING | Idempotency, Side-effects | 2/5   | Upstream retry under a new message duplicates fulfillment for the same event |
| No alert on DLQ depth                         | BLOCKING | Observability             | 1/5*  | DLQ fills silently; the first signal is a customer complaint                 |
| 24h retry window vs 30-day refund window      | SUGGEST  | Backend                   | 1/5   | A late successful retry charges a customer who has already been refunded     |
```

*Observability owns this lens — no other reviewer was scoped to catch it. Sole-owner, load-bearing.

### Synthesis
The retry policy exists because the handler isn't idempotent, but fixing idempotency removes most of what the policy is meant to handle. Two lenses converged on this root cause: Idempotency and Side-effects independently traced what happens when the upstream system retries, and both landed on *"the key we're keying on is the message, not the business event. A new message for the same event will charge again."*

The DLQ alert finding is single-lens but uniquely owned by Observability. No other reviewer was scoped to spot it; treat as load-bearing.

The contrarian's question — *does this policy need to exist at all?* — didn't change the verdict but reframed it. Fix the foundation and the scaffolding gets simpler on its own.

### Recommended action
Two BLOCKING items are the work. The SUGGEST can wait for the refund-window discussion with finance. Round 2 isn't warranted — the panel converged on a shared root cause.

Then ask the user:
- **Implement both BLOCKING items (Recommended)** — idempotency key first, then DLQ alert
- Schedule the refund-window discussion with finance first, then implement
- Run a tighter round-2 focused on idempotency-key alternatives before committing

---

## Example 3 — no panel

User asks:
> "Get a Jedi Council to review my Slack status. I keep updating it and it's getting bloated."

A Slack status doesn't warrant a panel. Two lenses would step on each other; four would be a comedy. The right answer is to skip the dispatch and answer directly:

> Three things: drop the emoji prefix (Slack already shows your status icon), cut the date — Slack shows when you'll be back natively, and pick "deep focus" or "in meetings" but not both. The status field is 100 chars; you're using 80 of them. Want it shorter still?

No Agent dispatches. No convergence table. No question with options. The artifact is small enough to answer in a paragraph, so that's the right shape — and saying so explicitly to the user (*"this doesn't need a council; here's the take"*) is the honest move. Refusing to convene is a first-class outcome.

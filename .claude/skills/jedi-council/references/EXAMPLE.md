# Worked example — Jedi Council on a retry policy

The cast below fits *this* artifact. A different artifact wants a different cast — the structure (lenses → convergence → prose → next action → question) is the pattern; the specific roles are illustrative.

Everything in steps 4–6 is what to send back to the user in chat. Nothing is written to disk.

---

User asks:
> "I've drafted a retry policy for our payment-webhook handler. Get a panel of experts to stress-test it before I ship."

## Step 1 — name the artifact

Plan at `/tmp/review/retry-policy.md`. One-paragraph summary: exponential backoff with jitter, 7 attempts over 24h, dead-letter to ops queue, idempotency via webhook event ID.

## Step 2 — cast 5 roles

Lenses chosen because the artifact is a reliability primitive rather than a feature:

1. Backend correctness — semantics, ordering, edge cases
2. Idempotency — does replay actually do nothing harmful?
3. Observability / on-call — what does a stuck retry look like at 3am?
4. Side-effects / blast radius — what happens when the dead-letter queue itself fills?
5. Pragmatic veteran (contrarian) — does this policy need to exist, or is this engineering retries on a handler that should just be idempotent?

## Step 3 — dispatch in parallel

Sample prompt for role 3 (Observability):

> *You are the observability / on-call reviewer of a 5-expert panel. Your lens: what does failure look like to the person paged at 3am? Other experts hold correctness, idempotency, side-effects, simplicity — leave those to them.*
>
> *Plan: `/tmp/review/retry-policy.md`. Cite line numbers. Label findings BLOCKING / SUGGESTION / NIT. Under 400 words.*

## Step 4 — convergence table

```
| Finding                                       | Severity | Flagged by                | Conv. | Prod-break mode                                                              |
|-----------------------------------------------|----------|---------------------------|-------|------------------------------------------------------------------------------|
| Idempotency key uses webhook ID, not event ID | BLOCKING | Idempotency, Side-effects | 2/5   | Upstream retry under a new message duplicates fulfillment for the same event |
| No alert on DLQ depth                         | BLOCKING | Observability             | 1/5*  | DLQ fills silently; the first signal is a customer complaint                 |
| 24h retry window vs 30-day refund window      | SUGGEST  | Backend                   | 1/5   | A late successful retry charges a customer who has already been refunded     |
```

*Observability owns this lens — no other reviewer was scoped to catch it.

## Step 5 — prose synthesis

The retry policy exists because the handler isn't idempotent, but fixing idempotency removes most of what the policy is meant to handle. Two lenses converged on this root cause: Idempotency and Side-effects independently traced what happens when the upstream system retries, and both landed on the same place — *"the key we're keying on is the message, not the business event. A new message for the same event will charge again."*

The DLQ alert finding is single-lens but uniquely owned by Observability. No other reviewer was scoped to spot it; treat as load-bearing.

The contrarian's question — *does this policy need to exist at all?* — didn't change the verdict but reframed it. The policy only matters because the handler isn't idempotent. Fix the foundation and the scaffolding gets simpler on its own.

## Step 6 — recommended next action + question

Two BLOCKING items are the work. The SUGGEST can wait for the refund-window discussion with finance. Round 2 isn't warranted — the panel converged on a shared root cause.

Then close with a question to the user, for example via AskUserQuestion:

- **Implement both BLOCKING items now (Recommended)** — idempotency key first, then DLQ alert
- Schedule the refund-window discussion with finance first, then implement
- Run a tighter round-2 focused on idempotency-key alternatives before committing

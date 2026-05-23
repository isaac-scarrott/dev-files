# Worked example — Jedi Council on a retry policy

The cast below is shaped for *this* artifact. A different artifact wants a different cast — treat the structure (lenses → convergence → prose → punch verdict) as the pattern, not the specific roles.

Everything in steps 4–6 below is what to send back to the user in chat. Nothing is written to disk.

---

User asks:
> "I've drafted a retry policy for our payment-webhook handler. Get a panel of experts to stress-test it before I ship."

## Step 1 — name the artifact

Plan at `/tmp/review/retry-policy.md`. One-paragraph summary: exponential backoff with jitter, 7 attempts over 24h, dead-letter to ops queue, idempotency via webhook event ID.

## Step 2 — cast 5 roles

Non-overlapping lenses chosen because the artifact is a reliability primitive, not a feature:

1. Backend correctness — semantics, ordering, edge cases
2. Idempotency — does replay actually do nothing harmful?
3. Observability / on-call — what does a stuck retry look like at 3am?
4. Side-effects / blast radius — what happens when the dead-letter queue itself fills?
5. Pragmatic veteran (contrarian) — does this policy need to exist, or are we engineering retries on a handler that should just be idempotent?

## Step 3 — dispatch in parallel

Sample prompt for role 3 (Observability):

> *You are the observability / on-call reviewer of a 5-expert panel. Your lens: what does failure look like to the person paged at 3am? Other experts hold correctness, idempotency, side-effects, simplicity — do not cover those.*
>
> *Plan: `/tmp/review/retry-policy.md`. Cite line numbers for every finding. Label each BLOCKING / SUGGESTION / NIT and explain in one line. Under 400 words.*

## Step 4 — convergence table with prod-break framing

```
| Finding                                      | Severity | Flagged by                | Conv. | Prod-break mode if not fixed                                                 |
|----------------------------------------------|----------|---------------------------|-------|------------------------------------------------------------------------------|
| Idempotency key uses webhook ID, not event ID| BLOCKING | Idempotency, Side-effects | 2/5   | Duplicate fulfillment if upstream retries the same business event under a new message |
| No alert on DLQ depth                        | BLOCKING | Observability             | 1/5*  | DLQ silently fills; first signal is a customer complaint                     |
| 24h retry window vs 30-day refund window     | SUGGEST  | Backend                   | 1/5   | A late successful retry charges a customer who has already been refunded     |
```

*Observability is the only lens that could have caught the missing alert — treat as load-bearing.

## Step 5 — prose synthesis + punch verdict

> The idempotency-key finding is the load-bearing one. Idempotency and Side-effects independently traced what happens when the upstream system retries — and landed at the same place: *"the key we're keying on is the message, not the business event. A new message for the same event will charge again."*
>
> Observability is the only one of the five whose lens could have caught the missing DLQ alert. No other reviewer was scoped to spot it; treat as 5/5.
>
> The contrarian's question — does this policy need to exist? — didn't change the verdict but reframed it. The retry only matters because the handler isn't idempotent in the first place. Fix idempotency and the policy gets simpler on its own.
>
> **Punch verdict: we built a retry policy because we don't trust idempotency — fix idempotency and the policy gets simpler on its own.**

## Step 6 — recommended next action

Implement the two BLOCKING items. The SUGGEST flag can wait for the refund-window discussion with finance. Round 2 not warranted — panel converged.

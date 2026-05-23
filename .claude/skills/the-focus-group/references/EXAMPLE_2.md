# Worked example 2 — Focus Group on a B2B procurement tool

This example deliberately picks a very different domain from the meditation app in [EXAMPLE.md](EXAMPLE.md) — internal, enterprise, transactional, no wellness narrative. The point of having two examples is to show that the pattern adapts to anything; the personas in this file would not survive a domain swap, and that's the lesson.

Everything in steps 4–6 is what to send back to the user in chat.

---

User asks:
> "We're rolling out a new procurement tool internally. Software-request form, approval workflow, vendor checks. I need to know what would actually happen when our team tries to use it. Get a focus group going."

## Step 1 — name the artifact

A clickable prototype at `/tmp/review/procurement-prototype/` — 8 screens: software request form, justification fields, automated security check, manager approval, finance approval, vendor due-diligence step, success page, status dashboard.

## Step 2 — cast 6 personas spanning who actually uses an internal tool

1. **Devi, 29, marketing manager** — wants to buy a $40/mo ad-attribution tool. Has done this twice before via Slack-to-IT; never used a formal form. Tight timeline, the campaign launches in two weeks.
2. **Stewart, 52, head of engineering** — approves software for a team of 30. Approves things weekly. Hates context-switching for approvals; usually does them in batches on Friday afternoons.
3. **Mae, 34, finance analyst** — sees every request post-manager-approval. Looking for budget-coding errors, vendor duplicates, contracts over $5k that should go through legal.
4. **Joel, 26, new junior dev** — joined three weeks ago. Needs a CLI tool the rest of his team already uses. Doesn't yet know what "vendor due diligence" means or whether it applies to a $9/mo developer subscription.
5. **Inga, 41, IT security lead** — sees all requests flagged by the automated check. Distrusts most automated checks; reads each request manually anyway. The previous tool let her tag vendors as "approved" so they bypassed her queue.
6. **Tariq, 38, the long-suffering sceptic** — corporate procurement veteran, 15 years across three companies. Has watched four similar tools come and go. Each one promised to be the last.

## Step 3 — dispatch in parallel

Sample prompt for Devi:

> *You are Devi, 29, a marketing manager at a mid-sized company. You're trying to buy a $40/month ad-attribution tool because a campaign launches in two weeks and you need it operational by Wednesday. You've done this kind of purchase twice before — both times by DMing someone in IT on Slack and getting an answer the same day. You've never used a formal procurement form. You're slightly impatient and slightly worried this is going to be the kind of process where you have to chase three approvers.*
>
> *Walk through the prototype at `/tmp/review/procurement-prototype/`. Stay fully in character. Do not break character or add meta-commentary about being an AI. Respond in first person.*
>
> *Tell me what you'd do at each screen and what you'd give up on. Don't be polite. Under 200 words. End with one specific thing you'd change first.*

## Step 4 — convergence table

```
| Issue                                                          | Flagged by                            | Verdict |
|----------------------------------------------------------------|---------------------------------------|---------|
| Vendor due-diligence step required for all purchases incl. $9/mo dev tools | Devi, Joel, Stewart, Tariq (4/6) | High    |
| No batch-approval view for managers                            | Stewart (1/6)*                        | High — sole-owner |
| "Business justification" free-text field gates the form        | Devi, Joel, Tariq (3/6)               | High    |
| Approved-vendor list from the previous tool not imported       | Inga (1/6)*                           | KILL — sole-owner, hard block on Inga's workflow |
| Manager approval comes before finance — wrong order for budget overruns | Mae, Stewart (2/6)               | Medium  |
| Status dashboard doesn't show *why* a request is stuck         | Devi, Joel, Mae (3/6)                 | Medium  |
```

*Sole-owner findings from the lenses uniquely positioned to spot them.

## Step 5 — prose synthesis + action distribution

Inga's finding is the hidden hard-block. Her existing workflow depends on a list of pre-approved vendors that bypass her queue — she reviews everything else manually, and a flood of repeat-vendor requests in her inbox is what kills her capacity to scrutinise the genuinely new ones. Losing that list isn't an inconvenience; it changes what her job looks like day-one. *"You're telling me every Slack/AWS/Datadog request is going to land in my queue again. I will be doing nothing but stamping these for a month."*

Four of six personas independently flagged the same thing from different angles: vendor due-diligence applied uniformly to a $9/mo developer tool and a $50k enterprise contract is the tool's central mistake. Devi will Slack IT instead, like she always has. Joel won't know whether to fill it in. Stewart will reject batches of these unread. Tariq's voice carries the long memory: *"every procurement system I've watched fail did this exact thing. Uniform process, uneven stakes."*

Across six personas: Devi abandons the form on screen three and goes back to Slack. Joel completes one request painfully, asks his team-lead what to do next time, defaults to "ask Stewart directly". Stewart batches approvals at 5pm Friday — every other approval is a default-yes; the new tool's framing makes those harder. Mae completes her reviews but flags the manager/finance ordering. Inga is blocked on day one. Tariq predicts a 6-month tool-death.

## Step 6 — recommended next action + question

Two structural changes, then re-run with the same panel: import the approved-vendor list before launch (unblocks Inga), and tier the due-diligence step by purchase size (unblocks the four-person majority). The manager/finance ordering can be a fast-follow.

Then close with a question to the user, for example via AskUserQuestion:

- **Implement both structural changes, re-run the panel after (Recommended)** — Inga's finding is sole-owner but a hard block; the tiered due-diligence is the convergent majority
- Pilot the tool with one team (engineering) first; iterate based on real usage before fixing everything
- Re-scope the project — the panel's signal is that uniform process is the problem, not a fixable surface bug

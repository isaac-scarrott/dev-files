# Messages between orchestrator and merger

Every baton pass and owner decision uses one of these shapes, so the receiver never has to ask twice. Every field is filled in. Write "none" rather than leave one out.

## ready-for-merge (orchestrator → merger)

```text
READY #<pr> <head sha, 10 chars>   <title>
base: <branch>   stack: <parent #pr / sha> ← this ← <children>   (or "off trunk")
checks: <green | pending | failing: name — real | known (why, link)>
known master failures: <test ids that fail on trunk too, or none>
door: <one-way | two-way> — <why, e.g. a public contract that changes>
blast radius: <one word> — <what breaks if wrong>
parity / spec deviations: <none | list>
owner: <approved in <session> "<words>" | not yet asked | testing>
conflict risk: <files likely to collide with other open PRs, or none>
body: refreshed at <sha>
next push: merger
```

"Real vs known" is the field that saves the most time. Before sending, prove each failure is known: it fails on trunk too, it's listed in the repo's known-failures record, or it fails on the PR's base. A failure you can't classify gets said plainly as "unclassified".

## change request (merger → orchestrator)

```text
CHANGE #<pr> <head sha>   queue: <held | dequeued | never queued>
asked by: <owner, "<words>" | merger review>
change: <what, as a verifiable outcome>
evidence: <screenshot / failing check / preview URL>
next push: orchestrator (send ready-for-merge again when done)
```

## decision broadcast (whoever heard it → everyone on that PR)

```text
DECISION #<pr> <head sha>: <approved | hold | change | close>, "<owner's words>" (heard in <session>, <time>)
```

## merged and deployed (merger → orchestrator)

```text
LANDED #<pr> <merge sha>   deploy: <success | failed: job — link>
children: <#pr retargeted / queued | none>
```

Send it only when something is actionable, or once for the whole batch: a failed deploy, a child that needs a restack, or the last PR of a batch. Say nothing for a merge that is green all the way through.

# inbox design

## Where it sits

`notifications` reads the host's events and turns each one into its own toast. `question-async` makes a background question
a host form. Neither knows about the others, and with several agents running a quiet hour of work arrives as a stream of
one-off toasts. The inbox is the opposite: **one list, one notification**, and the list decides what to answer first.

It depends on nothing of theirs. Pending permissions and question forms are read from every server's synced data through
`native-ui/src/requests.ts`; its own asks live in a file its server half owns. Both halves are the same plugin id `inbox`.

## Sources

1. **Pending permissions** and **pending question forms** (`metadata.kind === "question"`, which both the built-in
   `question` tool and `question_background` produce; see `question-async/DESIGN.md`, "design 4"). Read with
   `pendingRequests(data, {server})` over `ctx.servers.get(id).data`.
2. **`ask_isaac`** (`src/server.ts`): a tool for asks that would otherwise be prose. Its description is the instruction
   that makes the inbox reachable at all: *ask Isaac only through `question`, `question_background` or `ask_isaac`, never in
   prose; re-asking is merged.*
3. No prose detection in v1 (Isaac's call).

## The file, and why it is single-writer

`~/.local/share/opencode/inbox/asks.json` (`$XDG_DATA_HOME` honoured). One server instance runs per location
(`usage-resume/src/server.ts:86` shows the same), so several instances may write the file at once. Reads and writes go
through **one promise chain kept on `globalThis[Symbol.for("opencode-plugins.inbox.v1")]`**, and each write is a temp file
plus `rename`, so a reader sees the old file or the new one.

The GUI never touches the file: it calls the server half over RPC (`Inbox {list, answer, dismiss}` plus the `changed`
event), and the server half delivers through `ctx.session.synthetic({delivery: "queue"})` — the same delivery
`question-async` uses. A window may close; the answer still arrives.

## Merging

`key = ref` when given; otherwise `text:<FNV-1a of the normalised question>` (lowercase, punctuation removed, whitespace
collapsed). **A ref merges across every session; text merges within one root family** (`data.session.root` on the GUI side,
the parent chain walked on the server side).

A match against a pending ask, or one answered in the last `rememberAnsweredH` hours, counts (`asks++`, `lastAskedAt`) and
adds no item. A pending match returns:

> Already in Isaac's inbox as #N (asked K times since HH:MM). Do not ask again in any form; the answer arrives as an
> `<inbox-answer>` message.

An answered match returns the answer itself. A built-in question asked again is the same form type with the same text, so
the panel counts it (`×K asked`) without merging the two forms: answering one answers only that form.

Nothing is injected into system prompts.

## Ranking (`src/rank.ts`, pure)

```
cost = ageMinutes × (blocked ? 1 : 0.25) × (1 + waiters) + reaskWeight × (asks − 1)
```

- **blocked**: a pending permission, a built-in question, or an `ask_isaac` with `blocking` whose session is idle.
- **waiters**: the other idle members of the asker's family (`data.session.family`).
- Sorted highest cost first; ties go to the older ask, then by key so the order is stable.

## Notification (`src/notify-top.ts` + the GUI)

Exactly one persistent notification, key `inbox:top`, kind `needs-you`, published with `notify()` from the shared contract
so it goes through `notifications` when that is installed and a toast of its own otherwise. It fires when the top item
changes, and when any blocked ask passes an `escalateMin` threshold; never more than once per `notifyEveryMin`. A
throttled change is considered again next minute, not lost. When the list empties the notification is retracted.

## The contract's `owns`

`notifications` raises a persistent toast for every host-derived `needs-you`. With an inbox that is the stream it exists to
replace, so `acquirePublisher("inbox", { owns: ["host-requests"] })` claims that job for as long as the plugin runs (a
reference count, so a hot reload is seamless). While held, the sink keeps tracking the request and the host's own marks
stay, and it skips only its own toast for its own host-derived `needs-you`. Other sources and other kinds are untouched.
It is generic in `notify-contract.ts` (`PublisherOwnership`), not an inbox special case.

## Answering

- **Open** → `ctx.tabs.open({server, session}, {focus: true})`.
- **Permission**: `data.session.permission.reply({sessionID, requestID, decision: "once" | "reject"})`.
- **One-question form with options**: one button per option →
  `data.session.form.reply({sessionID, formID, answer: {[field.key]: value}})`. A form with several fields, or free text
  only, is answered in the host's own dock through Open.
- **`ask_isaac`**: a text box (an option chip fills it) → the `answer` RPC method; **Dismiss** → `dismiss`. The server marks
  the ask settled before delivering, so a repeated click cannot deliver twice.

## Deviations

- **`createdAt` for a host request.** The host keeps no time on a permission or a form. `pendingRequests` returns the asking
  session's `time.updated` as the closest proxy (0 when unknown), and the panel records the moment it first saw the row for
  its age, which is the honest number.
- **A dismissed ask does not merge with a re-ask** (only pending and answer-recently do, as specified); the asker is told
  not to repeat it, and a second ask becomes a new item.

## Evidence

Unit tests: merge key and scope, the answered-recently reply, the idle-family scope, ranking, the notification throttle and
escalation, rows and counts, options. `pnpm smoke` runs the built server against fakes (three asks of one question → one
item at `×3`; answer delivers one `<inbox-answer>`; re-ask hands the answer back; dismiss; a ref across a restart) and the
built GUI under a fake host. `media/panel.png` is `src/panel.tsx` rendered in a browser page with stand-in host buttons: the
panel's markup and CSS, not a desktop-app screenshot. The private service run and what it showed are in the commit that
added the plugin.

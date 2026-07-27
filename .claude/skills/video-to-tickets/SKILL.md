---
name: video-to-tickets
description: Turn a video walkthrough, review, demo or bug report into Linear tickets backed by timestamped screenshots pulled from the video itself. Accepts a local file path or any URL (Loom, YouTube, Vimeo, Drive, direct MP4). Use when the user shares a video and asks to transcribe it, pull out the feedback or issues in it, or create tickets from it — "here's a Loom, make tickets", "transcribe this and file the bugs", "watch this and write it up".
---

# Video to tickets

Watch a video properly — transcript **and** frames — then file tickets that a developer can act on without rewatching it.

## Quick start

```bash
# Source can be a local file OR any URL
scripts/prep-video.sh "https://www.loom.com/share/<id>" /path/to/workdir
scripts/prep-video.sh ~/Movies/review.mp4 /path/to/workdir
```

Writes `video.*`, `transcript.vtt`, `transcript.txt` (flat `[mm:ss] text`) and `meta.txt` into the workdir. Then read `transcript.txt` in full before doing anything else.

## Workflow

1. **Prep** — run `prep-video.sh`. It tries platform subtitles, then embedded subtitle streams, then Whisper. Most hosted videos ship a real transcript; do not reach for Whisper first.
2. **Read the transcript end to end.** Build a list of claims, each with its timestamp. Watch for:
    - **Retractions** — "actually that's a non-issue, ignore that". Honour them; do not file them.
    - **"That's its own issue"** — the speaker separating concerns. Note it, but check whether two symptoms share one root cause before splitting.
    - **Vague deixis** — "this", "that", "it doesn't appear at the top". Unresolvable from text. Resolve it in step 3.
3. **Extract and look at frames** at the timestamps the claims point to. `grab-frames.sh` handles this. **Actually Read the images** — this is the step that earns the ticket its detail, and the step that catches misreadings of the transcript. Speech usually lags what it describes by 1–3s; sample a spread and refine.
4. **Search the tracker before writing anything.** Query the issue tracker for the feature area. Video reviews routinely restate, contradict or supersede existing tickets. A contradiction found here is worth more than any ticket you write.
5. **Confirm with `AskUserQuestion`.** Ask only what changes the output — see [REFERENCE.md](REFERENCE.md#what-to-ask). Use `preview` to show the proposed ticket shape.
6. **Write the tickets.** Record the observation; do not invent the fix. See "Ticket voice" below.
7. **Attach the screenshots.** Linear's upload is a strict 3-step dance with a 60-second window — see [REFERENCE.md](REFERENCE.md#attaching-screenshots-to-linear).
8. **Report what you did not file** — retracted items, and anything you judged out of scope.

## Ticket voice

The video is a recording of someone noticing a problem, not a specification. Write it that way.

- **Observed / Expected / Acceptance criteria.** State what is on screen, with the timestamp.
- **Quote the speaker** where their phrasing carries intent better than a paraphrase.
- **Leave the fix open** unless the video states one or it is obvious. "How that is achieved is the implementer's call" is a legitimate sentence. Over-specifying a fix from a 20-second remark invents requirements.
- **Point at prior art** when the speaker does — "the old page handles this" is the most useful line in the ticket.
- **Deep-link every claim** to its timestamp (`?t=<seconds>` on the share URL) so a reader can check you.
- **Link the neighbours** — supersedes, related-to, expect-a-rebase. Say plainly when a ticket you found is now wrong.

## Details

- Acquisition, transcript fallbacks, frame extraction and cropping: [REFERENCE.md](REFERENCE.md)
- Linear upload protocol and inline embedding: [REFERENCE.md](REFERENCE.md#attaching-screenshots-to-linear)

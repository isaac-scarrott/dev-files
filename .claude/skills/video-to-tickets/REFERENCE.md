# Reference

## Acquiring the video

`prep-video.sh` handles both cases. What it does, so you can do it by hand when it fails:

**Local file** — used in place, no copy. Probe it and move on.

**URL** — `yt-dlp` covers Loom, YouTube, Vimeo, Drive and most hosts. For a plain MP4 behind a URL, `curl -L` is enough. If `yt-dlp` fails on a host it does not know, try `yt-dlp --generic` before giving up, and tell the user rather than guessing at the content.

Private or auth-walled videos will fail. Ask the user to download it and pass a file path.

## Transcripts, in order of preference

1. **Platform subtitles.** `yt-dlp --write-subs --write-auto-subs --sub-langs "en.*"`. Loom serves a genuine, well-punctuated transcript this way. Free, instant, correctly timestamped. Always try this first — reaching straight for Whisper on a hosted video wastes minutes and produces a worse transcript.
2. **Embedded subtitle stream** in a local file. `ffprobe` for a `subtitle` stream, then `ffmpeg -map 0:s:0`.
3. **Whisper.** Only when 1 and 2 produce nothing:
   ```bash
   ffmpeg -i video.webm -vn -ac 1 -ar 16000 audio.wav
   uvx --from mlx-whisper mlx_whisper --model mlx-community/whisper-large-v3-mlx audio.wav --output-format vtt   # Apple Silicon
   uvx --from openai-whisper whisper audio.wav --model small --output_format vtt                                  # anywhere
   ```

Flatten VTT to `[mm:ss] text` before reading — raw VTT cue numbering wastes context and hides the shape of the narrative.

## Frames

```bash
scripts/grab-frames.sh video.webm outdir 44:past-dated-item 78:menu-all-disabled 212:timeline-centred
```

`<seconds>:<slug>` pairs. Add `--crop W:H:X:Y` to strip chrome.

Notes that matter:

- **`-ss` before `-i`** — seeks by keyframe index, near-instant. After `-i` it decodes from zero and is unusably slow on a long video.
- **Narration drifts both ways.** Sometimes the description trails the click ("you'll notice this looks good"), sometimes it runs ahead of it ("this is what it should do, so it should open like this"). There is no reliable offset to correct for. Grab a spread around each timestamp, look, then narrow.
- **Name frames `t<seconds>` on the first pass.** Naming from the transcript encodes a guess about what the frame contains, and a wrong guess reads as confirmed fact later. Rename to something descriptive only after you have looked at the image; that name then becomes the attachment title.
- **Crop the chrome.** Screen recordings carry a browser sidebar, OS menu bar, a screen-share banner, notification toasts. A cropped frame reads as evidence; an uncropped one reads as a screenshot of someone's desktop. Get the crop box from one full frame, then apply it to all: `crop=W:H:X:Y`.
- **Before/after pairs** beat single frames for anything about layout, state or movement. Two frames of the same page in two states show a layout shift that no prose can.
- Name files for what they show, not the timestamp. The name becomes the attachment title.

## What to ask

Use `AskUserQuestion` for these, and little else:

- **Contradictions with existing tickets.** Supersede, rewrite in place, or leave both? Never resolve this silently.
- **Genuinely ambiguous observations.** When the frame does not disambiguate the words, offer the readings you can see as multi-select rather than picking one.
- **Granularity.** One ticket or several, when the video covers a surface an existing ticket already claims.
- **Placement** — project, milestone, status, assignee — when the tracker has more than one plausible home.

Put the proposed ticket shape in `preview`. It is much easier to react to a draft than to an abstract question.

Do not ask what you can read: labels, team names, existing ticket contents, milestone names.

## Attaching screenshots to Linear

Three steps per file, and the signed URL **expires in 60 seconds**.

1. `prepare_attachment_upload` — `{issue, filename, contentType, size}`. `size` must be the exact byte count.
2. `PUT` the raw bytes to `uploadRequest.url`, sending **every** header from `uploadRequest.headers` verbatim, casing included. Any omission or alteration returns 403.
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT --data-binary @shot.png \
     -H "content-type: image/png" \
     -H "cache-control: public, max-age=31536000" \
     -H "x-goog-content-length-range: <size>,<size>" \
     -H 'Content-Disposition: attachment; filename="shot.png"' \
     "<uploadRequest.url>"
   ```
3. `create_attachment_from_upload` — `{issue, assetUrl, title}`.

**Never batch the prepares.** Finish prepare → PUT → finalize for one file before preparing the next, or earlier URLs expire while you queue up later ones. Do not base64-encode; `--data-binary` sends bytes as-is.

### Embedding inline

Attachments sit in a sidebar; images in the description are what get read. Put the **bare** `assetUrl` in markdown:

```md
![Timeline centred with nothing ready to book](https://uploads.linear.app/<...>)
```

Linear rewrites it with a signed token on save. Do not add a signature yourself.

The description is set at create time, before any `assetUrl` exists — so create the issue, upload, then update the description with the images embedded at the point in the narrative where they belong. Do both: embed inline *and* leave the attachment, so the evidence survives however someone reads the ticket.

## Pitfalls

- **Filing a retracted item.** Speakers debug live and talk themselves out of things. Re-read for "ignore that", "non-issue", "that's just my branch".
- **Trusting the transcript over the frame.** An ambiguous sentence read one way produces a confidently wrong ticket. The frame settles it, or the user does.
- **Skipping the tracker search.** The most valuable finding in a review is often that a backlogged ticket is now wrong.
- **Environment noise as bugs.** Stale branches, local data, expired sessions and currency mismatches show up as errors on screen and are not defects. If the speaker explains one away, do not file it — say you did not.
- **Timestamps quoted without checking.** Verify against the frame before putting a timestamp in a ticket someone will click.

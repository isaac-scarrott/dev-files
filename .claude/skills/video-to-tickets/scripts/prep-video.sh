#!/usr/bin/env bash
# Fetch a video (local path or any URL) and produce a transcript + probe info.
#
#   prep-video.sh <source> <workdir>
#
# Writes into <workdir>:
#   video.<ext>      the video (local sources are referenced, not copied)
#   transcript.vtt   timed captions
#   transcript.txt   flat "[mm:ss] text", read this one
#   meta.txt         duration, resolution, transcript provenance
set -euo pipefail

SRC=${1:?usage: prep-video.sh <source> <workdir>}
DIR=${2:?usage: prep-video.sh <source> <workdir>}
mkdir -p "$DIR"

need() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$*" >&2; }

VIDEO=""
ORIGIN=""

if [ -f "$SRC" ]; then
    VIDEO=$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")
    ORIGIN="local file"
else
    need yt-dlp || { say "yt-dlp not found: brew install yt-dlp"; exit 1; }
    ORIGIN="$SRC"
    say "==> downloading"
    yt-dlp -o "$DIR/video.%(ext)s" \
        --write-subs --write-auto-subs --sub-langs "en.*" \
        --no-progress "$SRC" >&2 ||
        yt-dlp -o "$DIR/video.%(ext)s" --generic --no-progress "$SRC" >&2
    VIDEO=$(find "$DIR" -maxdepth 1 -name 'video.*' ! -name '*.vtt' ! -name '*.srt' | head -1)
fi

[ -n "$VIDEO" ] || { say "no video produced"; exit 1; }

# --- transcript ------------------------------------------------------------
SOURCE=""
VTT="$DIR/transcript.vtt"

# 1. subtitles fetched alongside the download
FOUND=$(find "$DIR" -maxdepth 1 \( -name 'video*.vtt' -o -name 'video*.srt' \) | head -1)
if [ -n "$FOUND" ]; then
    cp "$FOUND" "$VTT"
    SOURCE="platform subtitles"
fi

# 2. subtitle stream embedded in the file
if [ -z "$SOURCE" ] && need ffmpeg &&
    ffprobe -v error -select_streams s -show_entries stream=index -of csv=p=0 "$VIDEO" 2>/dev/null | grep -q .; then
    ffmpeg -v error -i "$VIDEO" -map 0:s:0 -y "$VTT" 2>/dev/null && SOURCE="embedded subtitle stream"
fi

# 3. whisper
if [ -z "$SOURCE" ]; then
    need ffmpeg || { say "ffmpeg not found: brew install ffmpeg"; exit 1; }
    need uvx || { say "no transcript available and uvx not found; install uv or supply captions"; exit 1; }
    say "==> no captions found, transcribing with whisper (slow)"
    ffmpeg -v error -i "$VIDEO" -vn -ac 1 -ar 16000 -y "$DIR/audio.wav"
    if [ "$(uname -m)" = "arm64" ] && [ "$(uname -s)" = "Darwin" ]; then
        uvx --from mlx-whisper mlx_whisper --model mlx-community/whisper-large-v3-mlx \
            "$DIR/audio.wav" --output-format vtt --output-dir "$DIR" >&2
    else
        uvx --from openai-whisper whisper "$DIR/audio.wav" \
            --model small --output_format vtt --output_dir "$DIR" >&2
    fi
    mv "$DIR/audio.vtt" "$VTT"
    SOURCE="whisper"
fi

# --- flatten ---------------------------------------------------------------
python3 - "$VTT" "$DIR/transcript.txt" <<'PY'
import re, sys

raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
out, stamp = [], None
for line in raw.splitlines():
    line = line.strip()
    m = re.match(r"(\d{2}):(\d{2}):(\d{2})[.,]\d+\s*-->", line)
    if m:
        h, mm, ss = (int(x) for x in m.groups())
        stamp = f"[{h * 60 + mm:02d}:{ss:02d}]"
        continue
    if not line or line == "WEBVTT" or line.isdigit() or line.startswith(("NOTE", "Kind:", "Language:")):
        continue
    text = re.sub(r"<[^>]+>", "", line).strip()
    if not text:
        continue
    if out and out[-1][0] == stamp:
        out[-1][1] += " " + text
    else:
        out.append([stamp, text])

with open(sys.argv[2], "w", encoding="utf-8") as fh:
    for stamp, text in out:
        fh.write(f"{stamp or '[--:--]'} {text}\n")
PY

# --- meta ------------------------------------------------------------------
{
    echo "origin:     $ORIGIN"
    echo "video:      $VIDEO"
    echo "transcript: $SOURCE"
    if need ffprobe; then
        DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" 2>/dev/null | cut -d. -f1)
        RES=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$VIDEO" 2>/dev/null)
        echo "duration:   ${DUR:-?}s ($((${DUR:-0} / 60))m$((${DUR:-0} % 60))s)"
        echo "resolution: ${RES:-?}"
    fi
} | tee "$DIR/meta.txt"

say ""
say "==> read $DIR/transcript.txt in full before extracting frames"

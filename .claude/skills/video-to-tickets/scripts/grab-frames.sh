#!/usr/bin/env bash
# Pull named frames out of a video at given timestamps.
#
#   grab-frames.sh [--crop W:H:X:Y] [--width N] <video> <outdir> <spec>...
#
# Each <spec> is <seconds>:<slug> or <mm:ss>:<slug>, producing <outdir>/<slug>.png
#
#   grab-frames.sh video.webm shots 44:past-dated-item 1:18:menu-all-disabled
#   grab-frames.sh --crop 1359:1021:311:42 video.webm shots 212:timeline-centred
#
# Find a crop box by grabbing one uncropped frame, viewing it, and measuring the
# content area. Cropping off browser sidebars, OS bars and share banners is the
# difference between evidence and a photo of someone's desktop.
set -euo pipefail

CROP=""
WIDTH=""
while [ $# -gt 0 ]; do
    case "$1" in
        --crop) CROP="$2"; shift 2 ;;
        --width) WIDTH="$2"; shift 2 ;;
        *) break ;;
    esac
done

VIDEO=${1:?usage: grab-frames.sh [--crop W:H:X:Y] [--width N] <video> <outdir> <spec>...}
OUT=${2:?usage: grab-frames.sh [--crop W:H:X:Y] [--width N] <video> <outdir> <spec>...}
shift 2
[ $# -gt 0 ] || { echo "no frame specs given" >&2; exit 1; }

mkdir -p "$OUT"

FILTER=""
[ -n "$CROP" ] && FILTER="crop=$CROP"
if [ -n "$WIDTH" ]; then
    [ -n "$FILTER" ] && FILTER="$FILTER,"
    FILTER="${FILTER}scale=$WIDTH:-2"
fi

for SPEC in "$@"; do
    SLUG=${SPEC##*:}
    STAMP=${SPEC%:*}

    # accept mm:ss or hh:mm:ss as well as raw seconds
    case "$STAMP" in
        *:*:*) IFS=: read -r h m s <<<"$STAMP"; SECS=$((10#$h * 3600 + 10#$m * 60 + 10#$s)) ;;
        *:*)   IFS=: read -r m s <<<"$STAMP";   SECS=$((10#$m * 60 + 10#$s)) ;;
        *)     SECS=$STAMP ;;
    esac

    # -ss BEFORE -i: keyframe seek, near-instant. After -i it decodes from zero.
    if [ -n "$FILTER" ]; then
        ffmpeg -v error -ss "$SECS" -i "$VIDEO" -frames:v 1 -vf "$FILTER" -y "$OUT/$SLUG.png"
    else
        ffmpeg -v error -ss "$SECS" -i "$VIDEO" -frames:v 1 -y "$OUT/$SLUG.png"
    fi
    printf '%s  %ss  %s\n' "$(du -h "$OUT/$SLUG.png" | cut -f1)" "$SECS" "$OUT/$SLUG.png"
done

echo
echo "==> Read these images now. Do not write tickets from the transcript alone."

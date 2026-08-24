"""Add a Holibob-brand BEFORE/AFTER header bar to product update screenshots.

    python3 label.py --src shots --out shots/labelled --tag "Product Card Backdrop" \
        1-before-desktop.png=BEFORE="Discovery grid, desktop" \
        2-after-desktop.png=AFTER="Discovery grid, desktop"

Needs Pillow, and there is no ImageMagick on this machine:

    python3 -m venv venv && ./venv/bin/pip install pillow
"""

import argparse
import os

from PIL import Image, ImageDraw, ImageFont

NAVY = (22, 33, 48)
TEAL = (33, 207, 179)
SLATE = (58, 71, 87)
MUTED = (148, 163, 178)
WHITE = (255, 255, 255)

FONT = "/System/Library/Fonts/Avenir Next.ttc"
BOLD, DEMI, MEDIUM = 0, 2, 5


def build(src, out, filename, arm, caption, tag):
    shot = Image.open(f"{src}/{filename}").convert("RGB")
    width = shot.width
    compact = width < 500

    bar = 64 if compact else 84
    accent = 3 if compact else 4
    pad = 16 if compact else 28
    chip_size = 12 if compact else 15
    caption_size = 15 if compact else 20

    canvas = Image.new("RGB", (width, shot.height + bar), NAVY)
    canvas.paste(shot, (0, bar))
    draw = ImageDraw.Draw(canvas)

    is_after = arm.upper() == "AFTER"
    chip_bg = TEAL if is_after else SLATE
    chip_fg = NAVY if is_after else WHITE

    draw.rectangle([0, bar - accent, width, bar], fill=chip_bg)

    chip_font = ImageFont.truetype(FONT, chip_size, index=BOLD)
    chip_w = draw.textlength(arm, font=chip_font) + (20 if compact else 28)
    chip_h = chip_size + (14 if compact else 18)
    chip_y = (bar - accent - chip_h) / 2
    draw.rounded_rectangle(
        [pad, chip_y, pad + chip_w, chip_y + chip_h], radius=chip_h / 2, fill=chip_bg
    )
    draw.text(
        (pad + chip_w / 2, chip_y + chip_h / 2),
        arm,
        font=chip_font,
        fill=chip_fg,
        anchor="mm",
    )

    draw.text(
        (pad + chip_w + (12 if compact else 18), (bar - accent) / 2),
        caption,
        font=ImageFont.truetype(FONT, caption_size, index=DEMI),
        fill=WHITE,
        anchor="lm",
    )

    if tag and not compact:
        draw.text(
            (width - pad, (bar - accent) / 2),
            tag,
            font=ImageFont.truetype(FONT, 13, index=MEDIUM),
            fill=MUTED,
            anchor="rm",
        )

    canvas.save(f"{out}/{filename}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--tag", default="")
    parser.add_argument("shotList", nargs="+", help="filename=ARM=caption")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for shot in args.shotList:
        filename, arm, caption = shot.split("=", 2)
        build(args.src, args.out, filename, arm.upper(), caption, args.tag)
    print(f"labelled {len(args.shotList)} shots into {args.out}")


if __name__ == "__main__":
    main()

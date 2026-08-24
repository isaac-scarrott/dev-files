# Capturing the media

The update lives or dies on the before/after pair. Both frames must differ only
in the thing being announced.

## Reuse what the PR already has

If the PR body already carries matched before/after pairs, take those instead
of recapturing. They are the frames that were reviewed.

GitHub's attachment URLs are private, and plain curl gets "Not Found" back:

```
curl -sL -H "Authorization: token $(gh auth token)" -o 1-before-desktop.png \
  https://github.com/user-attachments/assets/<uuid>
```

## Matched pairs

Set the viewport once and capture both arms at it. A pair shot at different
widths, scroll positions or device-mode states can't be compared, and the reader
will read the difference in framing as a difference in the product.

- Set viewport explicitly (`browser_viewport`), don't inherit the pane's
- Leave device mode off unless the shot is about phone layout — it owns the
  viewport and draws hardware around the page
- Scroll the same element to the same position in both: `el.scrollIntoView({block: 'start'})`
- Capture at `deviceScaleFactor: 2`, then downscale to CSS width (`sips -Z`,
  or `sips --resampleWidth` when the long edge isn't the width). Retina capture
  plus downscale beats a 1× capture, and keeps files under ~1MB
- Verify the arm rendered before capturing — read a DOM fact that differs
  between arms, rather than trusting the URL

Three widths covers it: desktop ~1440, tablet ~834, mobile 390.

## Forcing an experiment arm

On the Holibob storefront, arms are forced with a JSON query param:

```
?holibobFeatures={"productDiscoveryInput":"SENTENCE"}
```

URL-encode it. The key is the **registry feature name**, not the dated
featureState key. A `feature:VARIANT` shorthand does not parse.

## Catching a loading skeleton

Skeletons render only while a query is in flight, which is too fast to race and
usually cached on a retry. What works:

1. Patch `window.fetch` to return a never-resolving promise for the query you
   care about (match on the request body)
2. Trigger a **new** query the cache can't serve — change a search term rather
   than toggling a view

The patch survives client-side navigation, so it holds until you reload.

Two things that don't work: suspending the API (server rendering needs it, so
the document never arrives) and racing a `commit`-only navigation (the data is
already there by the time the screenshot lands).

## Labelling them

Every frame gets a header bar so the reader knows which arm they are looking at
without counting back to the caption. On brand, consistent across the set.

- Bar in Holibob navy `#162130`, with a pill at the left: `AFTER` in teal
  `#21CFB3` on navy text, `BEFORE` in slate `#3A4757` on white
- Accent rule along the bottom of the bar, teal for after, slate for before, so
  the arms are separable while scrolling
- Caption next to the pill saying what the reader is looking at, surface then
  viewport: "Discovery grid, desktop"
- Muted feature name right-aligned, dropped on narrow frames
- Avenir Next (`/System/Library/Fonts/Avenir Next.ttc`, index 0 bold, 2 demi,
  5 medium). Bar 84px, or 64px under 500px wide, and shrink the type with it

Brand colours come out of the logo asset, not memory:
`hub-web/public/images/HolibobLogoGreen.png` is teal `#21CFB3` and orange
`#FF9002`.

[label.py](label.py) does this. It needs Pillow, and there is no ImageMagick on
this machine, so make a venv first:

```
python3 -m venv venv && ./venv/bin/pip install pillow
./venv/bin/python label.py --src shots --out shots/labelled \
    --tag "Product Card Backdrop" \
    1-before-desktop.png=BEFORE="Discovery grid, desktop" \
    2-after-desktop.png=AFTER="Discovery grid, desktop"
```

It writes to its own subfolder, so the unlabelled originals survive.

## Attaching them

Hand over both halves without being asked: write the message to `message.txt`
next to the images, `pbcopy < message.txt` so it is ready to paste, and `open`
the labelled folder in Finder. Numbered filenames mean a drag-select lands in
the right order.

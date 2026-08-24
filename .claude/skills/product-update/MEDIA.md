# Capturing the media

The update lives or dies on the before/after pair. Both frames must differ only
in the thing being announced.

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

## Attaching them

Copy the files to the clipboard in paste order so one paste attaches the lot,
and open the folder in Finder as a fallback — some clients are fussy about
multi-file paste. Numbered filenames mean a drag-select lands in the right
order too.

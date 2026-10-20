# Changelog

Why the tool is the way it is. Read before changing a rule.

## 12 Oct 2026 (where the bold comes from)

- **The bold total was right; its breakdown was not.** Checked by hand, text node by text node, on a live results page and on Headout's London listing: the share matched to within a point (bold characters identical on Headout). The breakdown called a whole pressable card "buttons" (reported 55 to 64%; real button labels are 1 to 4%, card titles 46 to 51%), put the pence and currency code of a split price under "badges and labels", and quoted each group's first run in the page as its example ("Home" for a group that was nearly all card titles). Now a card's title is a card title whatever it is wrapped in, a button is one that is neither a card nor a wrapper round a picture, a run inside a short price is a price, and the example is the group's longest run. `type.boldShare` is unchanged, so the reference set was not rebuilt.
- **The bold lesson states the fair comparison.** Weight 500 looks nearly bold and the 600 cut-off does not count it; Headout sets its card titles at 500, so its listing reads 6 to 11% bold but 36 to 46% at 500 and heavier. Against it a page at 71 to 74% bold is 7 to 12× on the headline figure and about 2× on the fair one. The check and its headline number are unchanged; the lesson now quotes both counts for the page and for the reference pictured beside it (the references' typical value when no picture is shown). The count is a new unjudged number, `type.weight500Share`. It was added to `refs/travel.json` by measuring each of its pages again and copying only that number, so every other reference value is as it was.

## 13 Oct 2026 (pictures, finished)

The 12 Oct picture work was stopped before its reports were looked at. Looking at every picture of both reports found five things still wrong; each is fixed in `lib/pictures.mjs` unless said.

- **Boxes of runs that touch are drawn as one.** A price set as "£26", ".00", "GBP" got three boxes, each through its neighbour's letters.
- **A box stands off 3px sideways and 1px up and down**, not 4px all round: the next line of text starts right under a run, and a box 4px clear was drawn through it ("Subtotal" over its amount).
- **A wide crop is the page's whole width** (shown at half size, at least 720×300). It was 1,200 of 1,440px, cut through a card at one side, and could come out 463×240.
- **Two lessons on one page do not share a reference picture**: a reference already shown for the page is tried last.
- **What lies under an open cart is found outside the window too** (`coveredAt` in `lib/page/extra.js`). Only what was in the window was tested, so with the cart open at 390 "too much bold" was pictured on the cart's total while its words described the card titles of the results page underneath. Both findings of that page are now left out and named on stderr. The test finds a cover as tall as the page; a cover fixed to the window over a longer page is still not found below the window.
- **"Largest problems boxed" is said only when a box is in the first-screen picture** (`firstScreenBoxed` in `run.json`).
- Still as it is: a run that starts mid-word (the ".00 GBP" after "£113") has its box drawn over the edge of the letter before it; a picture marks at most the five examples the collector keeps, so like things beside a boxed one can be unboxed.

## 12 Oct 2026 (pictures)

- **A box is drawn outside what it marks**, clear of it, so it no longer hides the first and last letters of a run or of a card's text.
- **A marked crop is padded on every side, kept inside the page, and at least 640 wide and 300 tall**. Every marked run inside the crop is boxed. A crop of one title, or a 41px sliver, taught nothing.
- **Two lessons on one page do not share a picture**: the second takes a stretch not yet shown, when its marks give one.
- **Marks on what lies under something else are not drawn, and a picture whose marks are mostly such is not made.** With a cart open over a results page, the results page stays laid out underneath and is what gets measured, while the screenshot shows the cart: the boxes landed on the wrong things. Each evidence row now says `covered` when an opaque element that is neither inside nor around it covers it (tested only for what is in the window); such a finding is left out of the report, and the report guard fails if one is pictured. Not fixed: the numbers for such a page still describe the page underneath (the "dialog is measured with the page behind it" blind spot in `METRICS.md`).
- **A design's embedded frame** (a payment widget), which a Paper capture shows as a grey block, is named in the first-screen caption as not captured, so it does not read as a loading state.

## 12 Oct 2026 (second-opinion review of the evals)

- **The page-level score is not a ranking.** Held-out well-regarded sites score no better than held-out poor ones (53% of 17 like-for-like pairs, measured live; chance is 50%). The first explanation, that freezing spoiled the held-out pages, was wrong: Musement and Booking.com measure the same live as frozen. Trust a finding by its own check's record; do not compare pages or sites by their totals. `debt` stays only to sort a page's own findings and for `diff` on one page before and after.
- **Check cut: cards without price or rating.** It fired on 5 of 14 well-regarded pages and was never right there (destination and category tiles carry no price; a price split across elements was not read), and found its planted defect on 2 of 4 pages. 17 checks remain.
- **Probes read `::before` and `::after`.** Design systems draw hover, pressed and focus states on a pseudo-element; Booking.com's buttons read as dead (0% responding) and now read 63 to 83%.
- **"Nothing responds" no longer counts cards.** On the tuning sites, cards respond to hover more often on the poor pages (median 63%) than on the well-regarded ones (median 0%): a still card is a choice the references make. The check reads buttons and links only.
- **Two fonts is not "too many".** The lesson says two at most; the check fired at two. It now fires at three.
- **"Text too small" reads one number**, the share under 12px. The body-size number fired once on the tuning set, on a well-regarded page, and made the headline quote the wrong figure.
- **How sure we are** now also says how the check behaved on untouched well-regarded pages (`evals/validation.json`, written by `eval.mjs planted` and `baseline`).
- **Verdicts re-judged** (`evals/judgements.json`): Musement's faint text, missing focus rings and missing pressed states were recorded as frozen-copy artefacts; they are the same on the live site and were confirmed by comparing pixels with the state forced on. Booking.com's results page left the set: its frozen copy lost 75 thumbnails and the live page never settles.
- **Lessons corrected**: focus appearance is WCAG 2.4.13, not 2.4.11; iOS input zoom is observed behaviour, not documented by Apple; contrast is not the only check with a standard behind it; a picture under a CSS blur is not counted as stretched (the caveat said it was).
- **Removed for simplicity**: `--clock`, `--locale`, `--widths`, `--no-probe` and `diagnose.mjs snapshot` (no caller; `eval.mjs capture` freezes pages); the unused `precision` field of `validation.json`; frozen copies of pages no longer in the set.
- **Not fixed: Airbnb's frozen home page at 1440 lays out at a different height on each load** (4,165 to 4,189px), so its screenshot and its measurements can disagree and its share of faint text swings from 4% to 13%. Every other disagreement between two runs is in pixel counts no check reads (`space.*`, `colour.*`); a house rule on `space.medianBand` can still flip by 1px at a limit.

## 11 Oct 2026

- **Evals moved to real pages.** The invented "Wayfare" fixtures are gone. Every eval runs on frozen copies (MHTML, scripts stripped) of real pages in the tours and travel-booking sector, with one mutation planted per run for ground truth. No synthetic fixture is kept.
- **Checks cut from 37 to 18** (17 since 12 Oct). A check stays only while it finds its planted defect on real pages and does not fire on well-regarded ones. Cut, with the reason, in [`EVALS.md`](EVALS.md). Do not add one back without planting its defect first.
- **Structure against the same page type, craft against the same kind.** With three or four references per type, comparing everything within a type flagged well-regarded pages for differing from each other.
- **Marketing pages are their own type** (`landing`), and the booking steps are three types (availability, cart, checkout), so a cart is never shown beside an availability picker.
- **Capture gates.** A page still loading (skeletons, pulsing placeholders, missing pictures), or blank, is refused rather than measured; the gate runs again after the viewport grows for an inner scroller, because apps redraw on resize. A reference that fails a gate is left out of its set.
- **The report is lessons, not scores.** One section per page type, a problem taught once with a marked picture and a like-for-like reference. The words live in `lib/lessons.mjs`. "Design debt" is gone from everything a person reads; `debt` survives only as a sort key in `run.json`.
- **Paper frames** (`paper:<file>/<frame>`) are exported by the paper skill's `transfer.mjs` and measured as static pages. An exported frame is plain boxes: behaviour, buttons, inputs, headings, sticky positioning and picture sizes are not judged on a design.
- **Its own browser.** The tool launches a headless Chrome with its own profile and removes both on exit, error, Ctrl-C and when the parent is killed (a detached watchdog). It refuses port 9300: driving the Synth app's browser crashed the app.
- **Not counted as stretched pictures:** a picture under a CSS blur (a deliberate backdrop) and a low-resolution stand-in with the real picture on top of it.
- **Not counted as unreadable text:** a failing run that paints nothing in the screenshot.
- **Image pinning at freeze time.** MHTML keeps only the image file a page loaded; `<picture>` and `srcset` are pinned to it, or the frozen copy shows broken pictures at another width.

## 9 Oct 2026

- First version: the hand diagnosis in `evals/legacy/` (`measure.js`, `pixels.js`). `eval.mjs fidelity` proves the collector still reproduces it value for value in `legacy` mode; four definitions have changed since (see the header of `lib/page/core.js`).

# What is measured

One page at one width gives one record of numbers (`widths.<w>.metrics` in `run.json`), each with the elements behind it (`evidence`: selector, text, rectangle). Numbers are rounded and lists are in document order, so the same page gives the same record.

## How the measuring works

- **Widths**: 1440×900 with a desktop user agent, and 390×844 as a phone (touch, device pixel ratio 2). A Paper frame is measured at its own width.
- **Before measuring**: the page loads, consent banners are hidden (never answered), the page is scrolled once to pull in lazy content, then pictures are decoded, fonts awaited and the clock stopped (timers off, animations at their end state). A page still showing skeletons, spinners or missing pictures after 15 seconds, or a blank first screen, is refused.
- **Fold and full**: "first screen" numbers come from the top 900 (or 844) pixels; the rest from the whole page, capped at 16,000px. A page that scrolls inside its own box is measured with the viewport grown to fit.
- **Shadow DOM** is walked. Boxes are clipped to their overflow ancestors, so carousel items parked off-screen do not count.
- **Cards**: the outermost box 110px to 60% of the width (97% on a phone) wide and 90 to 760px tall that holds one picture and some text, and is a link, a list item, has its own surface, or repeats beside similar siblings.
- **Text on a photo**: a text run more than half over a picture with no opaque surface between the two. Text on a solid chip is not on the photo; text on a blurred or translucent layer is. Words on the hero (the largest picture in the first screen, at least a fifth of it) are allowed and not counted.
- **Contrast**: WCAG ratio of each text run against the solid colour behind it; where the background is a picture or gradient, against the pixels of the screenshot. A failing run whose colour is nowhere in the screenshot at its place (hidden text) is not counted.
- **Stretched pictures**: shown larger than the file, except a picture under a CSS blur and a low-resolution stand-in with the real picture on top.
- **Pixels**: colour shares and blank bands are read from the full-page screenshot.
- **Probes** (desktop for hover): up to five cards, five buttons, three links and three inputs get a real pointer move, and a forced pressed and focused state; a probe "responds" when any of 16 computed style properties changes on the element, anything inside it, or their `::before` and `::after`. Nothing is clicked.

## Blind spots

- A carousel's off-screen items are not counted, so a page built from rails reads thinner than it is.
- A rating or price drawn as an image, or a price with no currency symbol, is not seen.
- Hover or press feedback drawn by script on a frozen copy (`snapshot:`) is not seen; CSS feedback is.
- A Paper frame keeps no heading tags, inputs, sticky positioning or behaviour: those numbers are empty for a design, and its pictures are re-hosted, so "stretched pictures" is approximate.
- A dialog is measured together with the page behind it. A finding whose examples mostly lie under the dialog is left out of the report (each evidence row says `covered`).
- Page weight, layout shift and largest paint are recorded (`info`) but never judged: they vary from load to load.

## The checks

| check | fires when | page types | weight |
|---|---|---|---|
| Too little to browse (`nothing-to-browse`) | cards per screen is below the references; or cards on the page is below the references; or page length is below the references | home, listing | 3 |
| The hero fills the first screen (`hero-takes-fold`) | first screen covered by one image is above the references | home, listing | 2 |
| Price or title below the first screen (`buy-below-fold`) | price on the first screen is below the references; or title on the first screen is below the references | detail | 3 |
| Too few photos at the top (`few-photos`) | large images near the top is below the references | detail | 1.5 |
| Too much bold (`equally-loud`) | text set bold is above the references | all | 2 |
| Text on top of photos (`text-on-photos`) | text sitting on photos is above the references | all | 2 |
| Text too faint to read (`low-contrast`) | text failing WCAG AA contrast is above the references | all | 3 |
| Too many text sizes or fonts (`noisy-type`) | type sizes in real use is above the references; or font families is above the references | all | 1.5 |
| Text too small (`small-text`) | text under 12px is above the references | all | 1.5 |
| Two main buttons side by side (`competing-actions`) | groups of rival primary buttons is above the references | all | 2 |
| Actions hidden behind ⋯ (`hidden-actions`) | rows whose only action is behind ⋯ is above the references | all | 2 |
| Nothing responds to the pointer (`static`) | buttons and links that respond to hover is below the references; or buttons with a pressed state is below the references | all | 1.5 |
| No visible keyboard focus (`no-focus`) | controls with a visible focus state is below the references | all | 1.5 |
| Pictures stretched and blurry (`soft-images`) | images stretched past their size is above the references | all | 2 |
| Broken pictures (`broken-images`) | broken images is above the references | all | 3 |
| The page scrolls sideways (`sideways-scroll`) | sideways scroll is above the references | all | 3 |
| Inputs that make phones zoom (`zooming-inputs`) | inputs with text under 16px is above the references | all | 2 |

## Every number collected

Judged numbers carry the check they feed. The rest are recorded in `run.json` for house rules and for reading, and are never judged.

| metric | what it is | unit | compared with | feeds |
|---|---|---|---|---|
| `page.screens` | page length | screens | same page type | nothing-to-browse (low) |
| `page.height` | page height | px | same page type | – |
| `page.domNodes` | DOM elements | count | same page type | – |
| `page.capped` | measured to the 16000px cap | 0/1 | same page type | – |
| `page.innerScroller` | scrolls inside its own box | 0/1 | same page type | – |
| `content.sections` | content sections | count | same page type | – |
| `content.shapes` | distinct section shapes | count | same page type | – |
| `content.topShapeShare` | sections sharing the commonest shape | share | same page type | – |
| `content.cards` | cards on the page | count | same page type | nothing-to-browse (low) |
| `content.cardsPerScreen` | cards per screen | count | same page type | nothing-to-browse (low) |
| `content.itemsPerScreen` | things to click per screen | count | same page type | – |
| `content.charsPerScreen` | characters per screen | count | same page type | – |
| `content.wordsPerScreen` | words per screen | count | same page type | – |
| `content.headings` | headings | count | same page type | – |
| `fold.cards` | cards on the first screen | count | same page type | – |
| `fold.items` | things to click on the first screen | count | same page type | – |
| `fold.words` | words on the first screen | count | same page type | – |
| `fold.imageShare` | first screen covered by images | share | same page type | – |
| `fold.heroShare` | first screen covered by one image | share | same page type | hero-takes-fold (high) |
| `fold.textOverShare` | first-screen text sitting on photos | share | same page type | – |
| `fold.primaryButtons` | primary buttons on the first screen | count | same page type | – |
| `fold.search` | search on the first screen | 0/1 | same page type | – |
| `fold.primaryAction` | primary action on the first screen | 0/1 | same page type | – |
| `type.sizes` | type sizes in real use | count | same kind | noisy-type (high) |
| `type.sizesAll` | type sizes in total | count | same kind | – |
| `type.pairs` | size/weight combinations | count | same kind | – |
| `type.bodySize` | body text size | px | same kind | – |
| `type.largestToBody` | largest text ÷ body text | × | same page type | – |
| `type.medianAdjacentRatio` | median step between sizes | × | same kind | – |
| `type.minAdjacentRatio` | smallest step between sizes | × | same kind | – |
| `type.boldShare` | text set bold | share | same kind | equally-loud (high) |
| `type.weight500Share` | text at weight 500 or heavier | share | same kind | – (quoted in the bold lesson) |
| `type.families` | font families | count | same kind | noisy-type (high) |
| `type.smallTextShare` | text under 12px | share | same kind | small-text (high) |
| `type.lineLength` | characters per line in paragraphs | count | same page type | – |
| `type.lineHeight` | paragraph line height | × | same kind | – |
| `image.share` | page covered by images | share | same page type | – |
| `image.count` | images | count | same page type | – |
| `image.perScreen` | images per screen | count | same page type | – |
| `image.upscaled` | images stretched past their size | count | same kind | – |
| `image.upscaledShare` | images stretched past their size | share | same kind | soft-images (high) |
| `image.raggedRows` | rows of mismatched image shapes | count | same kind | – |
| `image.raggedRowShare` | image rows with mismatched shapes | share | same kind | – |
| `image.cardAspects` | different image shapes across cards | count | same kind | – |
| `image.broken` | broken images | count | same kind | broken-images (high) |
| `image.textOverShare` | text sitting on photos | share | same page type | text-on-photos (high) |
| `image.overlays` | overlays on photos | count | same kind | – |
| `depth.surfaces` | surface colours | count | same kind | – |
| `depth.shadowsPerScreen` | shadowed elements per screen | count | same kind | – |
| `depth.radii` | corner radii | count | same kind | – |
| `depth.sticky` | sticky or fixed elements | count | same kind | – |
| `depth.gradients` | gradient surfaces | count | same kind | – |
| `motion.transitionsPerScreen` | elements with a transition, per screen | count | same kind | – |
| `motion.transitions` | elements with a transition | count | same kind | – |
| `motion.animated` | running animations | count | same kind | – |
| `probe.hoverCards` | cards that respond to hover | share | same kind | – |
| `probe.hoverButtons` | buttons and links that respond to hover | share | same kind | static (low), desktop only |
| `probe.pressButtons` | buttons with a pressed state | share | same kind | static (low) |
| `probe.focusVisible` | controls with a visible focus state | share | same kind | no-focus (low) |
| `space.gapValues` | different vertical gaps in use | count | same kind | – |
| `space.offGridShare` | gaps off a 4px grid | share | same kind | – |
| `space.blankRowShare` | page height that is empty | share | same page type | – |
| `space.medianBand` | median empty band | px | same kind | – |
| `space.maxBand` | tallest empty band | px | same page type | – |
| `space.bandValues` | different empty-band heights | count | same kind | – |
| `layout.leftEdges` | left edges text starts from | count | same kind | – |
| `layout.hScrollPx` | sideways scroll | px | same kind | sideways-scroll (high) |
| `colour.accentShare` | page painted in saturated colour | share | same kind | – |
| `colour.accentShareFold` | first screen painted in saturated colour | share | same kind | – |
| `colour.neutralShare` | page painted neutral | share | same kind | – |
| `colour.photoShare` | page that is photography | share | same kind | – |
| `colour.brandShare` | page painted in its commonest saturated colour | share | same kind | – |
| `colour.brandGroundSections` | sections on a saturated ground | count | same kind | – |
| `colour.hues` | hue families in use | count | same kind | – |
| `colour.count` | distinct colours painted | count | same kind | – |
| `colour.textColours` | text colours | count | same kind | – |
| `colour.fills` | saturated fill colours | count | same kind | – |
| `contrast.failShare` | text failing WCAG AA contrast | share | same kind | low-contrast (high) |
| `contrast.failRuns` | text runs failing contrast | count | same kind | – |
| `actions.primary` | primary buttons outside cards | count | same page type | – |
| `actions.primaryPerScreen` | primary buttons per screen | count | same page type | – |
| `actions.competingPrimaries` | groups of rival primary buttons | count | same kind | competing-actions (high) |
| `actions.hidden` | "more" (⋯) buttons | count | same kind | – |
| `actions.hiddenShare` | rows whose only action is behind ⋯ | share | same kind | hidden-actions (high) |
| `actions.labelled` | labelled buttons | count | same kind | – |
| `cards.priceShare` | cards showing a price | share | same page type | – |
| `cards.ratingShare` | cards showing a rating | share | same page type | – |
| `cards.badgeShare` | cards carrying a badge | share | same page type | – |
| `cards.durationShare` | cards showing a duration | share | same page type | – |
| `cards.factsMedian` | facts per card (price, rating, badge, duration) | count | same page type | – |
| `cards.wordsMedian` | words per card | count | same page type | – |
| `pattern.search` | search | 0/1 | same page type | – |
| `pattern.filters` | filters | 0/1 | same page type | – |
| `pattern.sort` | sort control | 0/1 | same page type | – |
| `pattern.breadcrumb` | breadcrumb | 0/1 | same page type | – |
| `pattern.pagination` | pagination or load-more | 0/1 | same page type | – |
| `pattern.stickyBar` | sticky bar | 0/1 | same page type | – |
| `touch.targets` | tap targets | count | same kind | – |
| `touch.smallTargetShare` | tap targets under 44px | share | same kind | –, phone only |
| `touch.tinyTargetShare` | tap targets under 32px | share | same kind | –, phone only |
| `touch.smallInputs` | inputs with text under 16px | count | same kind | – |
| `touch.smallInputShare` | inputs with text under 16px | share | same kind | zooming-inputs (high), phone only |
| `form.fields` | form fields | count | same page type | – |
| `form.fieldsPerScreen` | form fields per screen | count | same page type | – |
| `form.unlabelledShare` | fields without a label | share | same page type | – |
| `form.placeholderOnly` | fields labelled only by a placeholder | count | same page type | – |
| `form.helpTexts` | fields with help text | count | same page type | – |
| `form.labelsAboveShare` | fields with the label above | share | same page type | – |
| `form.multiColumnRows` | rows with fields side by side | count | same page type | – |
| `form.steps` | step indicator | 0/1 | same page type | – |
| `form.groups` | field groups | count | same page type | – |
| `form.submit` | primary submit button | 0/1 | same page type | – |
| `table.rows` | table rows | count | same page type | – |
| `table.cols` | table columns | count | same page type | – |
| `table.rowHeight` | table row height | px | same page type | – |
| `table.cellPadX` | table cell side padding | px | same page type | – |
| `table.rowsWithActionShare` | rows with an action | share | same page type | – |
| `table.actionsAtEnd` | row actions in the last column | 0/1 | same page type | – |
| `table.header` | table header row | 0/1 | same page type | – |
| `table.headerSticky` | sticky table header | 0/1 | same page type | – |
| `table.numericRightShare` | number cells aligned right | share | same page type | – |
| `table.separated` | rows separated by lines or stripes | 0/1 | same page type | – |
| `detail.price` | price on the page | 0/1 | same page type | – |
| `detail.priceInFold` | price on the first screen | 0/1 | same page type | buy-below-fold (low) |
| `detail.titleInFold` | title on the first screen | 0/1 | same page type | buy-below-fold (low) |
| `detail.galleryImages` | large images near the top | count | same page type | few-photos (low) |

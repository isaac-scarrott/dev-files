# Evals

`node eval.mjs all` (about 15 minutes; measurements are cached by the collector's code, so re-judging after a rule change takes seconds). Everything runs on frozen copies of real pages (`evals/snapshots/`, made by `node eval.mjs capture`; git-ignored). Results below are from 12 Oct 2026, after a second-opinion review; what that review changed is in [`CHANGELOG.md`](CHANGELOG.md).

## What the numbers say, plainly

- **Individual findings can be trusted, each by its own record** (the table under E, and "how sure we are" in every report). Planted defects were found in 59 of 64 runs (92%), and in 47 of 52 (90%) when judged the way the tool is really used, against other sites' pages rather than the same page untouched. On 13 untouched well-regarded pages the 17 checks fired 31 times: 19 real, 7 a fair choice, 5 false (3 of them frozen-copy artefacts that a live page does not show).
- **The page total is not a ranking. On sites the tool was not tuned on, it cannot separate well-regarded pages from poor ones.** Tuning sites: a poor page totals worse than a well-regarded one in 75% (home), 75% (results) and 100% (product) of pairs. Held-out sites, measured live so freezing cannot be blamed: 60% of 10 home pairs, 33% of 3 results pairs, 50% of 4 product pairs; 53% of 17 pairs overall, where chance is 50%. Well-regarded sites outside the three reference sites differ from them in real ways (Musement's grey text fails contrast, Booking.com puts the price below the first screen), and with two or three references every difference counts as a finding.
- **Why the earlier explanation was wrong.** The first write-up put the held-out result down to freezing. Measured live, Musement gives the same findings as its frozen copy and Booking.com nearly the same; only Booking's results page (lost thumbnails) was a freezing casualty, and it has left the set.
- **Determinism**: two measurements of each frozen page disagree in 19 to 35 of 11,375 values depending on the run. All but Airbnb's home page are 1px differences in pixel counts no check reads. Airbnb's frozen home page at 1440 lays out at a different height on each load, which moves two numbers a check reads by 0.1 and, on a loaded machine, its share of faint text between 4% and 13%. Findings and totals were identical across the two runs on every scored page (one quoted reference range moved by 0.1). Not fixed.
- **Port fidelity**: 0 of 6,457 values differ from the 9 Oct `measure.js`. This shows the port is faithful, not that either is right.
- **Page type**: 39 of 44 detected correctly. The detector was written with every one of these pages in view: a fit, not a test.

## How far to trust these evals

- **A is generous.** Each planted run is judged against the same page untouched, a single reference with no spread. The 90% figure above (a throwaway re-judge against other sites' pages) is the fairer one; it is not part of `eval.mjs`.
- **"Held-out" recall is not clean.** Checks were kept or cut on their results over all planted bases, held-out ones included, and a check whose held-out defect failed was cut. The 95% on held-out bases describes the survivors.
- **E is judged by eye**, by the people who built and reviewed the tool. The verdicts are in `evals/judgements.json`, each with its reason; probe findings were confirmed by forcing the state and comparing pixels.
- **The held-out sites have now been looked at** (12 Oct), to find out why the totals failed. Nothing was tuned on them: the cut and the three tolerance changes of 12 Oct rest on tuning-site evidence, and the probe fix on how design systems draw states. A future held-out test needs new sites.
- **Small numbers.** Two held-out well-regarded sites, five pages. Three well-regarded tuning sites, eight pages.

## The sites

Sector: tours, activities and travel booking. Page types: home with search, listing, product. `split`: checks, weights and tolerances were chosen looking only at `tune` sites. Every page, with its address, is in `evals/sites.json`, with the sites that blocked us (`dropped`).

| site | group | split | why it is in its group |
|---|---|---|---|
| headout | good | tune | Owner-named. |
| airbnb | good | tune | Owner-named. |
| tiqets | good | tune | Owner-listed candidate, and one of the three inspiration sites of the 9 Oct hand diagnosis. |
| booking | good | held | Owner-listed candidate (Booking.com attractions). |
| musement | good | held | My pick, not the owner's: TUI's marketplace, a peer of the owner-listed candidates that blocked us. Looked at before measuring: search on the first screen, rows of photo cards each with rating and from-price, one type family. |
| britishtours | poor | tune | Looked at before measuring: at 1440 the page is a narrow column of small text; tour cards carry no price or rating; there is no way to search or filter tours; the product page has one photo and an enquiry form instead of a booking step; a reCAPTCHA badge overlaps the content. |
| walks | poor | tune | Looked at before measuring: a fixed-width layout of red and black text blocks; the listing is a plain list of links with no photos, prices or ratings; navigation is rows of text links around a calendar widget. |
| tickitaly | poor | tune | Looked at before measuring: listing and product pages are long paragraphs of small text rather than cards; clip-art icons and boxed blue and green navigation; no ratings anywhere. |
| pragueticketoffice | poor | tune | Looked at before measuring: the home page leads with a four-field search form over a banner; results are table-like rows of small text with no ratings; several text sizes and colours compete in each row. |
| florencemuseum | poor | held | Looked at before measuring: a fixed-width layout that does not adapt to a phone; gold buttons with tiny labels; museum blocks are paragraphs with a thumbnail; the booking form sits in the middle of the product text. |
| internationalfriends | poor | held | Looked at before measuring: three stacked header bands of small links and badges; the listing at 390 is headings and paragraphs with no cards or prices; the product page opens with a map and small photos. The weakest case for 'plainly poor' in the set. |
| weekendinitaly | poor | held | Looked at before measuring: the listing is a column of category links beside text-heavy tiles; small text throughout; the home page is a hero with a centred form and little else. |
| gotobus | poor | held | Looked at before measuring: the home page under the search form is three columns of small blue text links with prices: a link directory, no photos, no cards. Home page only. |
| viennaticketoffice | poor | held | Looked at before measuring: red, black and white panels of different sizes compete on the first screen; numbered thumbnails with tiny captions; a floating chat widget and voucher box overlap content. Home page only. |


## Checks cut, and why

| check | why it went |
|---|---|
| Cards without price or rating (12 Oct) | Fired on 5 of 14 well-regarded pages and was never right there: destination and category tiles rightly carry no price, and a price split across elements was not read. Found its planted defect on 2 of 4 pages. It did fire on 12 of 19 poor pages, so cutting it gives up a true signal on poor sites for no false ones on good sites. |
| Loose spacing | Found its planted defect on 1 of 5 pages. |
| Expected controls are missing | Fired on 4 of 9 well-regarded tuning pages and misread a real search bar as missing. |
| Large empty stretches | Fired 20 times across planted runs, never because it was planted. |
| The first screen gives nothing to act on | Fired 18 times across planted runs, never because it was planted; on 5 of 9 well-regarded pages. |
| No breathing room | No planted defect; fired on well-regarded and poor alike. |
| One shape, one tempo | Found its planted defect on 2 of 5 pages. |
| Spacing follows no system | Found its planted defect on 1 of 5 pages once reduced to the one number that separated the groups. |
| Too many colours | Fired on 6 of 9 well-regarded tuning pages and 6 of 12 poor ones. |
| Nothing lines up, lines too long, wall of text, text too small on taps (tap targets) | Each fired more often on well-regarded pages than on poor ones. |
| Image shapes do not match, almost no pictures, everything on one plane | No separation between groups; hard to show in a picture. |
| No pressed state | Folded into "nothing responds". |
| Unlabelled fields, long form, unclear form | One or two real form pages to plant on, and they missed half the time. |
| Cramped table, unscannable table | Found their defects, but only on two Wikipedia tables, and no reference set holds a table. |

Their planted defects are still in `evals/defects.mjs`; the eval skips a defect whose check is gone.


## A. Planted defects on real pages (17 defects, 22 bases, 64 runs)

Each run plants one defect in a frozen real page and judges it against the same page untouched. found = the planted defect is among the findings; top = it is the largest; others = everything else that fired (side effects of the mutation, or false alarms).

| defect | must surface | bases | found (recall) | top | tune bases | held-out bases | other findings (times) | not applicable |
|---|---|---|---|---|---|---|---|---|
| all-bold | equally-loud | home | 5/5 | 5/5 | 3/3 | 2/2 | – | – |
| text-on-photo | text-on-photos | home | 4/5 (missed: booking-home) | 0/5 | 3/3 | 1/2 | low-contrast ×5, soft-images ×4, hero-takes-fold ×1 | – |
| too-little-content | nothing-to-browse | home | 5/5 | 5/5 | 3/3 | 2/2 | low-contrast ×2, static ×2, equally-loud ×1, text-on-photos ×1, soft-images ×1 | – |
| no-hover-response | static | home | 4/5 (missed: airbnb-home) | 4/5 | 2/3 | 2/2 | – | – |
| upscaled-images | soft-images | home | 5/5 | 5/5 | 3/3 | 2/2 | low-contrast ×1 | – |
| two-primary-buttons | competing-actions | home | 2/2 | 2/2 | 2/2 | – | – | airbnb-home: no filled button outside cards; booking-home: no filled button outside cards; musement-home: no filled button outside cards |
| nine-type-sizes | noisy-type | home | 5/5 | 4/5 | 3/3 | 2/2 | low-contrast ×1, small-text ×1 | – |
| hero-fills-first-screen (held) | hero-takes-fold | home | 4/4 | 4/4 | 2/2 | 2/2 | – | airbnb-home: no picture to use |
| low-contrast-text | low-contrast | listing | 3/3 | 3/3 | 2/2 | 1/1 | – | airbnb-listing: frozen copy unsettled |
| sideways-scroll (held) | sideways-scroll | listing | 2/3 (missed: tiqets-listing) | 2/3 | 1/2 | 1/1 | nothing-to-browse ×1, soft-images ×1 | airbnb-listing: frozen copy unsettled |
| small-secondary-text (held) | small-text | listing | 3/3 | 3/3 | 2/2 | 1/1 | – | airbnb-listing: frozen copy unsettled |
| price-below-first-screen | buy-below-fold | detail | 3/3 | 3/3 | 2/2 | 1/1 | few-photos ×1 | airbnb-detail: frozen copy blank; musement-detail: frozen copy blank |
| one-small-photo (held) | few-photos | detail | 4/4 | 3/4 | 3/3 | 1/1 | low-contrast ×1 | musement-detail: fewer than 2 large pictures near the top |
| broken-images (held) | broken-images | detail | 5/5 | 5/5 | 3/3 | 2/2 | few-photos ×3 | – |
| inputs-12px | zooming-inputs | form, availability | 1/2 (missed: britishtours-form) | 1/2 | 0/1 | – | – | headout-availability: frozen copy unsettled; tiqets-availability: no inputs |
| no-focus-ring | no-focus | form, availability | 2/3 (missed: tiqets-availability) | 2/3 | 1/2 | – | static ×1 | headout-availability: frozen copy unsettled |
| actions-behind-kebab | hidden-actions | listing, table | 2/2 | 2/2 | 2/2 | – | – | airbnb-listing: frozen copy unsettled; musement-listing: fewer than 3 rows with a labelled action; x-wikipedia-table: fewer than 3 rows with a labelled action; x-wikipedia-table2: fewer than 3 rows with a labelled action |

Recall over all runs: 59/64 (92%). Tuning bases 37/41 (90%); held-out bases 20/21 (95%).
By defect split: tuning defects 41/45 (91%); held-out defects 18/19 (95%).
Strict precision (findings that were the planted defect ÷ all findings fired): 59/87 (68%). Planted defect ranked first: 53/64 (83%).

Re-run 13 Oct after the picture changes: every figure as on 12 Oct except one side finding, faint text on an upscaled-images run, which fired once where it had fired twice (two fresh measurements agree). Recall, ranking and `validation.json` are unchanged; the cause was not traced, and nothing changed on 13 Oct alters a measured number.

Precision per finding (times it fired because it was planted ÷ times it fired at all):

| finding | fired | planted | precision |
|---|---|---|---|
| broken-images | 5 | 5 | 100% |
| buy-below-fold | 3 | 3 | 100% |
| competing-actions | 2 | 2 | 100% |
| equally-loud | 6 | 5 | 83% |
| few-photos | 8 | 4 | 50% |
| hero-takes-fold | 5 | 4 | 80% |
| hidden-actions | 2 | 2 | 100% |
| low-contrast | 13 | 3 | 23% |
| no-focus | 2 | 2 | 100% |
| noisy-type | 5 | 5 | 100% |
| nothing-to-browse | 6 | 5 | 83% |
| sideways-scroll | 2 | 2 | 100% |
| small-text | 4 | 3 | 75% |
| soft-images | 11 | 5 | 45% |
| static | 7 | 4 | 57% |
| text-on-photos | 5 | 4 | 80% |
| zooming-inputs | 1 | 1 | 100% |

Not run, because their check was cut: one-shape-repeated (one-shape), rainbow-colours (too-many-colours), irregular-spacing (loose-spacing), misaligned-blocks (ragged-edges), bare-cards (bare-cards), no-filters-or-sort (missing-controls), mismatched-image-shapes (ragged-images), tiny-tap-targets (small-taps), placeholder-only-labels (unlabelled-fields), fields-side-by-side (long-form), cramped-rows (cramped-table), numbers-left-no-lines (unscannable-table), full-width-lines (long-lines).

## D. Well-regarded against poor, like with like (34 frozen pages from 13 sites)

Debt = sum over findings of gap × weight, against the well-regarded tuning pages of the same page type from other sites. Separation = how often a poor page scores worse than a well-regarded one (100% = always, 50% = chance).


### home pages

| page | group | split | refs | debt | largest findings |
|---|---|---|---|---|---|
| musement-home | good | held | 3 | 10 | Text too faint to read [6]; Too much bold [4] |
| booking-home | good | held | 3 | 13.4 | Two main buttons side by side [4]; Text on top of photos [4]; Text too faint to read [3.75]; No visible keyboard focus [1.65] |
| tiqets-home | good | tune | 2 | 3.34 | The hero fills the first screen [3.34] |
| headout-home | good | tune | 2 | 4 | Inputs that make phones zoom [4] |
| airbnb-home | good | tune | 2 | 8.44 | Text too faint to read [6]; Nothing responds to the pointer [2.44] |
| gotobus-home | poor | held | 3 | 6.65 | Too little to browse [3.99]; Too much bold [2.66] |
| internationalfriends-home | poor | held | 3 | 8.73 | Too much bold [4]; Nothing responds to the pointer [2.73]; Too many text sizes or fonts [2] |
| viennaticketoffice-home | poor | held | 3 | 13 | Too much bold [4]; Too many text sizes or fonts [3]; Text too small [3]; Nothing responds to the pointer [3] |
| weekendinitaly-home | poor | held | 3 | 17.42 | Text too faint to read [6]; Pictures stretched and blurry [4]; Too many text sizes or fonts [3]; Too much bold [2.28] |
| britishtours-home | poor | tune | 3 | 3 | Nothing responds to the pointer [3] |
| tickitaly-home | poor | tune | 3 | 11.93 | Text too faint to read [6]; Too many text sizes or fonts [3.45]; Too much bold [2.48] |
| pragueticketoffice-home | poor | tune | 3 | 15 | Broken pictures [6]; Pictures stretched and blurry [4]; Nothing responds to the pointer [3]; No visible keyboard focus [2] |
| walks-home | poor | tune | 3 | 21.58 | Two main buttons side by side [4]; Too much bold [4]; Pictures stretched and blurry [4]; Nothing responds to the pointer [3.45] |

### listing pages

| page | group | split | refs | debt | largest findings |
|---|---|---|---|---|---|
| musement-listing | good | held | 2 | 15.24 | Text too faint to read [6]; Too little to browse [3.24]; No visible keyboard focus [3]; Nothing responds to the pointer [3] |
| headout-listing | good | tune | 1 | 6.25 | Inputs that make phones zoom [4]; Too many text sizes or fonts [2.25] |
| tiqets-listing | good | tune | 1 | 11.41 | Too little to browse [3.3]; The hero fills the first screen [3.2]; Pictures stretched and blurry [3.06]; No visible keyboard focus [1.85] |
| internationalfriends-listing | poor | held | 2 | 10.8 | Too little to browse [7.8]; Nothing responds to the pointer [3] |
| weekendinitaly-listing | poor | held | 2 | 21.07 | Text too faint to read [6]; Too little to browse [5.07]; Pictures stretched and blurry [4]; Too many text sizes or fonts [3] |
| tickitaly-listing | poor | tune | 2 | 5.18 | Too little to browse [3.18]; Too many text sizes or fonts [2] |
| britishtours-listing | poor | tune | 2 | 18.24 | Too little to browse [7.45]; Text too faint to read [6]; Nothing responds to the pointer [3]; Too many text sizes or fonts [1.79] |
| pragueticketoffice-listing | poor | tune | 2 | 18.45 | Too little to browse [7.8]; Broken pictures [6]; Nothing responds to the pointer [3]; No visible keyboard focus [1.65] |
| walks-listing | poor | tune | 2 | 28.04 | Too little to browse [6.59]; Text too faint to read [6]; Too much bold [4]; The hero fills the first screen [4] |

### detail pages

| page | group | split | refs | debt | largest findings |
|---|---|---|---|---|---|
| booking-detail | good | held | 3 | 16 | Broken pictures [6]; Price or title below the first screen [6]; Two main buttons side by side [4] |
| musement-detail | good | held | 3 | 16.51 | Price or title below the first screen [6]; Text too faint to read [6]; No visible keyboard focus [2.51]; Too few photos at the top [2] |
| headout-detail | good | tune | 2 | 0 | none |
| airbnb-detail | good | tune | 2 | 5.51 | Text too faint to read [3]; Nothing responds to the pointer [2.51] |
| tiqets-detail | good | tune | 2 | 5.51 | Nothing responds to the pointer [3]; No visible keyboard focus [2.51] |
| internationalfriends-detail | poor | held | 3 | 17 | Broken pictures [6]; Price or title below the first screen [6]; Nothing responds to the pointer [3]; Too few photos at the top [2] |
| britishtours-detail | poor | tune | 3 | 6.73 | Nothing responds to the pointer [2.73]; Too few photos at the top [2]; Too many text sizes or fonts [2] |
| walks-detail | poor | tune | 3 | 12.65 | Text too faint to read [4.5]; Nothing responds to the pointer [3.45]; Pictures stretched and blurry [3.2]; Too few photos at the top [1.5] |
| tickitaly-detail | poor | tune | 3 | 13.95 | Text too faint to read [6]; Too many text sizes or fonts [3.45]; Nothing responds to the pointer [3]; Too few photos at the top [1.5] |
| pragueticketoffice-detail | poor | tune | 3 | 24 | Broken pictures [6]; Text too faint to read [6]; Too much bold [4]; Too many text sizes or fonts [3] |

### Findings by group (pages it fired on, mean score when fired)

| finding | good tune (8) | poor tune (12) | good held (5) | poor held (7) |
|---|---|---|---|---|
| broken-images | 0 | 3 · 6.0 | 1 · 6.0 | 1 · 6.0 |
| buy-below-fold | 0 | 0 | 2 · 6.0 | 1 · 6.0 |
| competing-actions | 0 | 1 · 4.0 | 2 · 4.0 | 0 |
| equally-loud | 0 | 4 · 3.6 | 1 · 4.0 | 4 · 3.2 |
| few-photos | 0 | 4 · 1.8 | 1 · 2.0 | 1 · 2.0 |
| hero-takes-fold | 2 · 3.3 | 2 · 3.5 | 0 | 1 · 2.1 |
| low-contrast | 2 · 4.5 | 6 · 5.8 | 4 · 5.4 | 2 · 6.0 |
| no-focus | 2 · 2.2 | 2 · 1.8 | 3 · 2.4 | 0 |
| noisy-type | 1 · 2.3 | 6 · 2.6 | 0 | 4 · 2.8 |
| nothing-to-browse | 1 · 3.3 | 5 · 5.6 | 1 · 3.2 | 3 · 5.6 |
| small-text | 0 | 0 | 0 | 1 · 3.0 |
| soft-images | 1 · 3.1 | 4 · 3.8 | 0 | 2 · 4.0 |
| static | 3 · 2.6 | 10 · 3.1 | 1 · 3.0 | 5 · 2.9 |
| text-on-photos | 0 | 0 | 1 · 4.0 | 0 |
| zooming-inputs | 2 · 4.0 | 0 | 0 | 0 |

### Separation per page type

| page type | split | well-regarded debts | poor debts | separation | poor pages scoring no worse than a well-regarded one | well-regarded pages scoring no better than a poor one |
|---|---|---|---|---|---|---|
| home | tune | 3.34, 4, 8.44 (median 4) | 3, 11.93, 15, 21.58 (median 13.465) | 75% | britishtours-home (3) | tiqets-home (3.34), headout-home (4), airbnb-home (8.44) |
| home | held | 10, 13.4 (median 11.7) | 6.65, 8.73, 13, 17.42 (median 10.865) | 38% | gotobus-home (6.65), internationalfriends-home (8.73), viennaticketoffice-home (13) | musement-home (10), booking-home (13.4) |
| listing | tune | 6.25, 11.41 (median 8.83) | 5.18, 18.24, 18.45, 28.04 (median 18.345) | 75% | tickitaly-listing (5.18) | headout-listing (6.25), tiqets-listing (11.41) |
| listing | held | 15.24 (median 15.24) | 10.8, 21.07 (median 15.935) | 50% | internationalfriends-listing (10.8) | musement-listing (15.24) |
| detail | tune | 0, 5.51, 5.51 (median 5.51) | 6.73, 12.65, 13.95, 24 (median 13.3) | 100% | none | none |
| detail | held | 16, 16.51 (median 16.26) | 17 (median 17) | 100% | none | none |

### Held-out sites measured live (12 Oct, throwaway script: each address through `collectAll`, scored exactly as above)

| page type | well-regarded totals | poor totals | separation |
|---|---|---|---|
| home | 10, 12.5 | 6, 6.65, 13, 18.2, 32.95 | 60% of 10 pairs |
| results | 15.24 | 10.8, 13.57, 19.73 | 33% of 3 pairs |
| product | 12.73, 16.51 | 14, 16 | 50% of 4 pairs |

Booking.com's results page is left out (it never settles); florence-museum.com, which could not be frozen, is in.


### Page-type detection (44 pages)

Type detected correctly: 39/44. Marketing / transactional / content detected correctly: 42/44.

| page | labelled | detected | scores |
|---|---|---|---|
| walks-listing | listing (transactional) | home (transactional) | home 1 |
| tickitaly-listing | listing (transactional) | article (content) | home 1, listing 2, detail 2, article 2.5 |
| pragueticketoffice-listing | listing (transactional) | detail (transactional) | home 1, listing 2, detail 3.5 |
| internationalfriends-listing | listing (transactional) | detail (transactional) | home 1, detail 1.5 |
| x-wikipedia-article | article (content) | listing (transactional) | home 1, listing 1.5, detail 1.5 |

## E. Findings on the untouched well-regarded pages

Each well-regarded page judged against the well-regarded tuning pages of its type from other sites. Verdicts were made by looking at the cropped screenshot of each finding (evals/judgements.json): real = a designer would agree; false = the page is fine and the tool is wrong; relative = true as a difference from the references, not a defect.

| page | finding | score | the numbers | verdict |
|---|---|---|---|---|
| headout-home | Inputs that make phones zoom | 4 | touch.smallInputShare 1 (refs 0) @390 | **real**: The search input is set under 16px on the phone layout. |
| airbnb-home | Text too faint to read | 6 | contrast.failShare 0.11 (refs 0.01, 0–0.01) @1440 | **relative**: Pale grey secondary text is under 4.5:1, but the share swings from 4% to 13% between measurements of this frozen copy (its layout settles at different heights), so the size of the problem is not known. |
| airbnb-home | Nothing responds to the pointer | 2.44 | probe.hoverButtons 0.14 (refs 0.63, 0.5–0.75) @1440 | **false**: Frozen-copy artefact, confirmed: the live page measures 71% of buttons responding to hover against 14% on the frozen copy. |
| tiqets-home | The hero fills the first screen | 3.34 | fold.heroShare 0.57 (refs 0.22, 0.08–0.36) @390 | **relative**: The phone hero is 57% of the first screen: larger than the others', within reason. |
| booking-home | Two main buttons side by side | 4 | actions.competingPrimaries 1 (refs 0, 0–0) @1440 | **real**: Register and Sign in sit side by side with the same white fill in the header. Minor. |
| booking-home | Text on top of photos | 4 | image.textOverShare 0.27 (refs 0, 0–0.03) @1440 | **real**: Product titles and ratings are drawn on the photos of the 'Recommended' cards. |
| booking-home | Text too faint to read | 3.75 | contrast.failShare 0.07 (refs 0.02, 0–0.05) @390 | **false**: The boxed 'Search' label is white on Booking blue and reads fine; pixel sampling over the button edge misjudged it. |
| booking-home | No visible keyboard focus | 1.65 | probe.focusVisible 0.67 (refs 1, 0.88–1) @390 | **false**: Not confirmed either way: 67% on the frozen copy, 71% on the live page, which is just inside what the tool tolerates. Counted as false. |
| musement-home | Text too faint to read | 6 | contrast.failShare 0.53 (refs 0.01, 0–0.11) @1440 | **real**: Card descriptions are pale grey at 3.9:1, under the 4.5:1 minimum. The live page measures the same, so it is not a frozen-copy artefact. |
| musement-home | Too much bold | 4 | type.boldShare 0.37 (refs 0.16, 0.05–0.21) @390 | **relative**: 37% bold on the phone layout against 5–21%: heavier than the references, not broken. |
| headout-listing | Inputs that make phones zoom | 4 | touch.smallInputShare 1 (refs 0) @390 | **real**: Same input as the home page. |
| headout-listing | Too many text sizes or fonts | 2.25 | type.sizes 9 (refs 6, 5–8) @390 | **relative**: Nine sizes on the phone layout against five to eight. |
| tiqets-listing | Too little to browse | 3.3 | content.cards 32 (refs 71) @1440 | **relative**: 32 cards against Headout's 71: shorter, still a full page. |
| tiqets-listing | The hero fills the first screen | 3.2 | fold.heroShare 0.33 (refs 0.09) @1440 | **relative**: A third of the first screen is the city banner. |
| tiqets-listing | Pictures stretched and blurry | 3.06 | image.upscaledShare 0.23 (refs 0, 0–0) @1440 | **real**: The city banner and several tiles are served smaller than they are shown. |
| tiqets-listing | No visible keyboard focus | 1.85 | probe.focusVisible 0.63 (refs 1, 0.75–1) @1440 | **real**: Checked by pixels: the carousel 'Next' and 'Show more' buttons show nothing when focused. |
| musement-listing | Text too faint to read | 6 | contrast.failShare 0.22 (refs 0.01, 0–0.11) @1440 | **real**: The same pale grey card descriptions at 3.9:1; identical on the live page. |
| musement-listing | Too little to browse | 3.24 | content.cards 20 (refs 51.5, 32–71) @1440 | **relative**: 20 cards against 32–71. |
| musement-listing | No visible keyboard focus | 3 | probe.focusVisible 0.33 (refs 1, 0.88–1) @390 | **real**: Checked by pixels on the live page: the date, category, filter and 'view more' buttons and the sort select look the same focused and unfocused. |
| musement-listing | Nothing responds to the pointer | 3 | probe.pressButtons 0 (refs 1, 0.2–1) @390 | **real**: Checked by pixels on the live page: none of the five buttons tried changes when pressed. Minor. |
| headout-detail | none | – | – | – |
| airbnb-detail | Text too faint to read | 3 | contrast.failShare 0.05 (refs 0.01, 0–0.01) @1440 | **real**: A line of pale grey text under 4.5:1. Minor. |
| airbnb-detail | Nothing responds to the pointer | 2.51 | probe.hoverButtons 0.13 (refs 0.63, 0.5–0.75) @1440 | **false**: Frozen-copy artefact: the same buttons as the home page, which respond on the live page. |
| tiqets-detail | Nothing responds to the pointer | 3 | probe.pressButtons 0.2 (refs 1, 0.4–1) @390 | **real**: Checked by pixels: the four date buttons do not change when pressed. Minor. |
| tiqets-detail | No visible keyboard focus | 2.51 | probe.focusVisible 0.5 (refs 1, 0.75–1) @1440 | **real**: Half the controls tried at 1440 show no change when focused. |
| booking-detail | Broken pictures | 6 | image.broken 1 (refs 0, 0–0) @390 | **false**: Frozen-copy artefact: one picture did not survive freezing. |
| booking-detail | Price or title below the first screen | 6 | detail.priceInFold 0 (refs 1, 1–1) @1440 | **real**: At 1440 the first screen shows title and gallery; the price is in the ticket panel below. |
| booking-detail | Two main buttons side by side | 4 | actions.competingPrimaries 1 (refs 0, 0–0) @1440 | **real**: Register and Sign in again. |
| musement-detail | Price or title below the first screen | 6 | detail.priceInFold 0 (refs 1, 1–1) @1440 | **real**: At 1440 the price sits under a full-width photo, below the first screen. |
| musement-detail | Text too faint to read | 6 | contrast.failShare 0.17 (refs 0.01, 0–0.11) @1440 | **real**: Pale grey text at 2.7 to 3.9:1; identical on the live page. |
| musement-detail | No visible keyboard focus | 2.51 | probe.focusVisible 0.5 (refs 1, 0.88–1) @390 | **real**: The main 'Check availability' button and the chat button show no change when focused; identical on the live page. |
| musement-detail | Too few photos at the top | 2 | detail.galleryImages 1 (refs 5, 4–5) @1440 | **real**: One large photo at the top against four or five on the references. |

Verdicts: 19 real, 7 relative, 5 false positive. Pictures: <eval dir>/runs/<page>/crops

| check | well-regarded pages it applies to | fired | real | relative | false |
|---|---|---|---|---|---|
| nothing-to-browse | 8 | 2 | 0 | 2 | 0 |
| hero-takes-fold | 8 | 2 | 0 | 2 | 0 |
| equally-loud | 13 | 1 | 0 | 1 | 0 |
| text-on-photos | 13 | 1 | 1 | 0 | 0 |
| low-contrast | 13 | 6 | 4 | 1 | 1 |
| noisy-type | 13 | 1 | 0 | 1 | 0 |
| small-text | 13 | 0 | 0 | 0 | 0 |
| competing-actions | 13 | 2 | 2 | 0 | 0 |
| hidden-actions | 13 | 0 | 0 | 0 | 0 |
| static | 13 | 4 | 2 | 0 | 2 |
| no-focus | 13 | 5 | 4 | 0 | 1 |
| soft-images | 13 | 1 | 1 | 0 | 0 |
| broken-images | 13 | 1 | 0 | 0 | 1 |
| sideways-scroll | 13 | 0 | 0 | 0 | 0 |
| zooming-inputs | 13 | 2 | 2 | 0 | 0 |
| buy-below-fold | 5 | 2 | 2 | 0 | 0 |
| few-photos | 5 | 1 | 1 | 0 | 0 |

## B. Determinism (50 frozen real pages × 2 widths, each measured twice in separate tabs; 11375 metric values)

Disagreements: 35; in a number a check reads: 2 (airbnb-home content.cardsPerScreen@1440: 13.5 vs 13.6; airbnb-home page.screens@1440: 4.7 vs 4.6).
- colour.count: 3 page-widths
- colour.neutralShare: 3 page-widths
- space.bandValues: 3 page-widths
- space.blankRowShare: 3 page-widths
- space.medianBand: 3 page-widths
- evidence: 3 page-widths
- colour.accentShare: 2 page-widths
- colour.photoShare: 2 page-widths
- contrast.failRuns: 2 page-widths
- space.maxBand: 2 page-widths
- colour.accentShareFold: 1 page-widths
- content.cardsPerScreen: 1 page-widths
- content.charsPerScreen: 1 page-widths
- content.itemsPerScreen: 1 page-widths
- content.wordsPerScreen: 1 page-widths
- depth.shadowsPerScreen: 1 page-widths
- motion.transitionsPerScreen: 1 page-widths
- page.height: 1 page-widths
- page.screens: 1 page-widths

- airbnb-home colour.accentShare@1440: 0.046 vs 0.049
- airbnb-home colour.accentShareFold@1440: 0.002 vs 0.081
- airbnb-home colour.count@1440: 20 vs 21
- airbnb-home colour.neutralShare@1440: 0.658 vs 0.653
- airbnb-home colour.photoShare@1440: 0.295 vs 0.298
- airbnb-home content.cardsPerScreen@1440: 13.5 vs 13.6
- airbnb-home content.charsPerScreen@1440: 1963 vs 1970
- airbnb-home content.itemsPerScreen@1440: 34.2 vs 34.3
- airbnb-home content.wordsPerScreen@1440: 404 vs 405
- airbnb-home contrast.failRuns@1440: 65 vs 67
- airbnb-home depth.shadowsPerScreen@1440: 9.2 vs 9.3
- airbnb-home motion.transitionsPerScreen@1440: 53.1 vs 53.3
- airbnb-home page.height@1440: 4189 vs 4174
- airbnb-home page.screens@1440: 4.7 vs 4.6
- airbnb-home space.bandValues@1440: 11 vs 9
- airbnb-home space.blankRowShare@1440: 0.46 vs 0.44
- airbnb-home space.maxBand@1440: 110 vs 109
- airbnb-home space.medianBand@1440: 23 vs 22
- airbnb-home evidence@1440
- tiqets-listing colour.count@1440: 6 vs 5
- tiqets-detail contrast.failRuns@1440: 0 vs 2
- tiqets-detail evidence@1440
- walks-detail space.blankRowShare@1440: 0.38 vs 0.39
- tickitaly-home space.medianBand@1440: 16 vs 17
- x-stripe-landing colour.neutralShare@1440: 0.707 vs 0.708
- x-stripe-landing colour.photoShare@1440: 0.154 vs 0.153
- x-stripe-landing space.bandValues@1440: 20 vs 19
- x-stripe-landing evidence@1440
- x-headout-article colour.accentShare@1440: 0.004 vs 0.003
- x-headout-article colour.count@1440: 9 vs 2
- x-headout-article colour.neutralShare@1440: 0.685 vs 0.686
- x-headout-article space.bandValues@1440: 12 vs 13
- x-headout-article space.blankRowShare@1440: 0.41 vs 0.46
- x-headout-article space.maxBand@1440: 209 vs 409
- x-headout-article space.medianBand@1440: 33 vs 32

## C. Port fidelity

Ported values compared: 6457; differing: 0.

## F. Marketing and out-of-sector pages (10 pages; never tuned on)

| page | sector | labelled | detected | debt against its own kind | debt if judged as a transactional home | findings a transactional home would add |
|---|---|---|---|---|---|---|
| x-stripe-landing | out | landing (marketing) | landing (marketing) | 6 (3 peers) | 12.6 | Pictures stretched and blurry; Nothing responds to the pointer |
| x-linear-landing | out | landing (marketing) | landing (marketing) | 12.26 (3 peers) | 13.76 | Too many text sizes or fonts |
| x-airbnbhost-landing | in | landing (marketing) | landing (marketing) | 3 (3 peers) | 0 | – |
| x-tiqetsvenues-landing | in | landing (marketing) | landing (marketing) | 4 (3 peers) | 5.26 | Nothing responds to the pointer; Pictures stretched and blurry |
| x-govuk-home | out | home (transactional) | home (transactional) | no peer | – | – |
| x-govuk-form | out | form (transactional) | form (transactional) | no peer | – | – |
| x-wikipedia-table | out | table (transactional) | table (transactional) | 5.65 (1 peers) | – | – |
| x-wikipedia-table2 | out | table (transactional) | table (transactional) | 0 (1 peers) | – | – |
| x-wikipedia-article | out | article (content) | listing (transactional) | 2 (1 peers) | – | – |
| x-headout-article | in | article (content) | article (content) | 13.61 (1 peers) | – | – |

## G. Report standard (3 pages: britishtours-home, walks-listing, tickitaly-detail)

Findings shown as lessons: 10; left out for not meeting the standard: 0; reference pictures shown: 4, all of the page's own type: yes.
Passed. Report: <eval dir>/report-guard.html

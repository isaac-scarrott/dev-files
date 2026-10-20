// The registry: every judged metric, the named findings they roll up into, and the page-type
// profiles that weight those findings. METRICS.md and PROFILES.md document this file.

// bad: which direction is a problem ("low", "high", "both"); null = reported, never judged.
// abs / rel: the slack around the reference median before a gap counts (absolute, and share of median).
// only: "phone" | "desktop" restricts the metric to that width class.
const m = (label, unit, bad, abs = 0, rel = 0, only = null) => ({ label, unit, bad, abs, rel, only });
export const METRICS = {
    "page.screens": m("page length", "screens", "low", 0.5, 0.4),
    "page.height": m("page height", "px", null),
    "page.domNodes": m("DOM elements", "", null),
    "page.capped": m("measured to the 16000px cap", "0/1", null),
    "page.innerScroller": m("scrolls inside its own box", "0/1", null),

    "content.sections": m("content sections", "", "low", 1, 0.4),
    "content.shapes": m("distinct section shapes", "", "low", 1, 0.34),
    "content.topShapeShare": m("sections sharing the commonest shape", "share", "high", 0.2, 0.3),
    "content.cards": m("cards on the page", "", "low", 2, 0.5),
    "content.cardsPerScreen": m("cards per screen", "", "low", 0.5, 0.5),
    "content.itemsPerScreen": m("things to click per screen", "", "low", 2, 0.4),
    "content.charsPerScreen": m("characters per screen", "", null),
    "content.wordsPerScreen": m("words per screen", "", "both", 30, 0.6),
    "content.headings": m("headings", "", null),

    "fold.cards": m("cards on the first screen", "", "low", 1, 0.5),
    "fold.items": m("things to click on the first screen", "", "low", 2, 0.5),
    "fold.words": m("words on the first screen", "", null),
    "fold.imageShare": m("first screen covered by images", "share", null),
    "fold.heroShare": m("first screen covered by one image", "share", "high", 0.15, 0.3),
    "fold.textOverShare": m("first-screen text sitting on photos", "share", "high", 0.1, 0.5),
    "fold.primaryButtons": m("primary buttons on the first screen", "", null),
    "fold.search": m("search on the first screen", "0/1", null),
    "fold.primaryAction": m("primary action on the first screen", "0/1", "low", 0.5),

    "type.sizes": m("type sizes in real use", "", "high", 2, 0.3),
    "type.sizesAll": m("type sizes in total", "", "high", 2, 0.3),
    "type.pairs": m("size/weight combinations", "", "high", 3, 0.35),
    "type.bodySize": m("body text size", "px", "low", 1.5),
    "type.largestToBody": m("largest text ÷ body text", "×", "low", 0.4, 0.25),
    "type.medianAdjacentRatio": m("median step between sizes", "×", null),
    "type.minAdjacentRatio": m("smallest step between sizes", "×", null),
    "type.boldShare": m("text set bold", "share", "high", 0.1, 0.4),
    "type.weight500Share": m("text at weight 500 or heavier", "share", null), // quoted beside the bold share: 500 looks nearly bold and many sites set titles in it
    "type.families": m("font families", "", "high", 1.5),
    "type.smallTextShare": m("text under 12px", "share", "high", 0.1, 0.5),
    "type.lineLength": m("characters per line in paragraphs", "", "high", 15, 0.25),
    "type.lineHeight": m("paragraph line height", "×", "low", 0.15),

    "image.share": m("page covered by images", "share", "low", 0.1, 0.6),
    "image.count": m("images", "", null),
    "image.perScreen": m("images per screen", "", null),
    "image.upscaled": m("images stretched past their size", "", null),
    "image.upscaledShare": m("images stretched past their size", "share", "high", 0.15, 0.5),
    "image.raggedRows": m("rows of mismatched image shapes", "", null),
    "image.raggedRowShare": m("image rows with mismatched shapes", "share", "high", 0.2, 0.5),
    "image.cardAspects": m("different image shapes across cards", "", "high", 1, 0.5),
    "image.broken": m("broken images", "", "high", 0.5),
    "image.textOverShare": m("text sitting on photos", "share", "high", 0.08, 0.5),
    "image.overlays": m("overlays on photos", "", null),

    "depth.surfaces": m("surface colours", "", "low", 1, 0.5),
    "depth.shadowsPerScreen": m("shadowed elements per screen", "", "low", 1, 0.7),
    "depth.radii": m("corner radii", "", null),
    "depth.sticky": m("sticky or fixed elements", "", null),
    "depth.gradients": m("gradient surfaces", "", null),
    "motion.transitionsPerScreen": m("elements with a transition, per screen", "", "low", 2, 0.7),
    "motion.transitions": m("elements with a transition", "", null),
    "motion.animated": m("running animations", "", null),
    "probe.hoverCards": m("cards that respond to hover", "share", "low", 0.3, 0, "desktop"),
    "probe.hoverButtons": m("buttons and links that respond to hover", "share", "low", 0.3, 0, "desktop"),
    "probe.pressButtons": m("buttons with a pressed state", "share", "low", 0.3),
    "probe.focusVisible": m("controls with a visible focus state", "share", "low", 0.3),

    "space.gapValues": m("different vertical gaps in use", "", "high", 2, 0.4),
    "space.offGridShare": m("gaps off a 4px grid", "share", "high", 0.15, 0.5),
    "space.blankRowShare": m("page height that is empty", "share", "both", 0.1, 0.35),
    "space.medianBand": m("median empty band", "px", null),
    "space.maxBand": m("tallest empty band", "px", "high", 40, 0.6),
    "space.bandValues": m("different empty-band heights", "", null),
    "layout.leftEdges": m("left edges text starts from", "", "high", 3, 0.5),
    "layout.hScrollPx": m("sideways scroll", "px", "high", 4),

    "colour.accentShare": m("page painted in saturated colour", "share", "high", 0.05, 1),
    "colour.accentShareFold": m("first screen painted in saturated colour", "share", null),
    "colour.neutralShare": m("page painted neutral", "share", null),
    "colour.photoShare": m("page that is photography", "share", null),
    "colour.brandShare": m("page painted in its commonest saturated colour", "share", null),
    "colour.brandGroundSections": m("sections on a saturated ground", "", null),
    "colour.hues": m("hue families in use", "", "high", 2, 0.5),
    "colour.count": m("distinct colours painted", "", "high", 8, 0.5),
    "colour.textColours": m("text colours", "", "high", 2, 0.5),
    "colour.fills": m("saturated fill colours", "", "high", 2, 0.6),
    "contrast.failShare": m("text failing WCAG AA contrast", "share", "high", 0.04, 0.5),
    "contrast.failRuns": m("text runs failing contrast", "", null),

    "actions.primary": m("primary buttons outside cards", "", null),
    "actions.primaryPerScreen": m("primary buttons per screen", "", "high", 0.5, 0.6),
    "actions.competingPrimaries": m("groups of rival primary buttons", "", "high", 0.5),
    "actions.hidden": m("\"more\" (⋯) buttons", "", null),
    "actions.hiddenShare": m("rows whose only action is behind ⋯", "share", "high", 0.2),
    "actions.labelled": m("labelled buttons", "", null),

    "cards.priceShare": m("cards showing a price", "share", "low", 0.2),
    "cards.ratingShare": m("cards showing a rating", "share", "low", 0.2),
    "cards.badgeShare": m("cards carrying a badge", "share", "low", 0.15),
    "cards.durationShare": m("cards showing a duration", "share", null),
    "cards.factsMedian": m("facts per card (price, rating, badge, duration)", "", "low", 0.5),
    "cards.wordsMedian": m("words per card", "", null),

    "pattern.search": m("search", "0/1", "low", 0.5),
    "pattern.filters": m("filters", "0/1", "low", 0.5),
    "pattern.sort": m("sort control", "0/1", "low", 0.5),
    "pattern.breadcrumb": m("breadcrumb", "0/1", "low", 0.5),
    "pattern.pagination": m("pagination or load-more", "0/1", "low", 0.5),
    "pattern.stickyBar": m("sticky bar", "0/1", null),

    "touch.targets": m("tap targets", "", null),
    "touch.smallTargetShare": m("tap targets under 44px", "share", "high", 0.12, 0.4, "phone"),
    "touch.tinyTargetShare": m("tap targets under 32px", "share", "high", 0.08, 0.5, "phone"),
    "touch.smallInputs": m("inputs with text under 16px", "", null),
    "touch.smallInputShare": m("inputs with text under 16px", "share", "high", 0.2, 0, "phone"),

    "form.fields": m("form fields", "", "high", 3, 0.5),
    "form.fieldsPerScreen": m("form fields per screen", "", null),
    "form.unlabelledShare": m("fields without a label", "share", "high", 0.15),
    "form.placeholderOnly": m("fields labelled only by a placeholder", "", null),
    "form.helpTexts": m("fields with help text", "", null),
    "form.labelsAboveShare": m("fields with the label above", "share", "low", 0.3),
    "form.multiColumnRows": m("rows with fields side by side", "", "high", 1, 0.5),
    "form.steps": m("step indicator", "0/1", null),
    "form.groups": m("field groups", "", null),
    "form.submit": m("primary submit button", "0/1", "low", 0.5),

    "table.rows": m("table rows", "", null),
    "table.cols": m("table columns", "", null),
    "table.rowHeight": m("table row height", "px", "low", 6, 0.2),
    "table.cellPadX": m("table cell side padding", "px", "low", 3, 0.3),
    "table.rowsWithActionShare": m("rows with an action", "share", null),
    "table.actionsAtEnd": m("row actions in the last column", "0/1", "low", 0.5),
    "table.header": m("table header row", "0/1", "low", 0.5),
    "table.headerSticky": m("sticky table header", "0/1", null),
    "table.numericRightShare": m("number cells aligned right", "share", "low", 0.3),
    "table.separated": m("rows separated by lines or stripes", "0/1", "low", 0.5),

    "detail.price": m("price on the page", "0/1", "low", 0.5),
    "detail.priceInFold": m("price on the first screen", "0/1", "low", 0.5),
    "detail.titleInFold": m("title on the first screen", "0/1", "low", 0.5),
    "detail.galleryImages": m("large images near the top", "", "low", 1, 0.6),
};

// Structure metrics describe what a page of one type holds (how much to browse, what the first
// screen offers, which controls exist): they are judged against references of the same page type.
// Every other metric is craft (type, colour, spacing, contrast, response) and is judged against
// every reference of the same kind, whatever its type, so the range it must fall in is well populated.
const STRUCTURE = new Set(["image.share", "image.perScreen", "image.count", "image.textOverShare", "actions.primary", "actions.primaryPerScreen", "type.lineLength", "type.largestToBody", "space.blankRowShare", "space.maxBand"]);
export const isStructure = (key) => /^(page|content|fold|cards|pattern|detail|form|table)\./.test(key) || STRUCTURE.has(key);

// Page types, in the order a visitor meets them. A page is only ever compared with references of its own type.
export const TYPES = ["home", "listing", "detail", "availability", "cart", "checkout", "form", "table", "article", "landing"];
// What a page is for. A marketing page sells one idea (one hero, little density, few actions); a
// transactional page lets someone search, compare, pick and pay. They are never compared with each other.
export const KIND = Object.fromEntries(TYPES.map((t) => [t, t === "landing" ? "marketing" : t === "article" ? "content" : "transactional"]));

// The checks. Each fires when one of its metrics leaves the reference range in the listed direction.
// Few on purpose: a check stays here only while it finds its planted defect on real pages and does not
// fire on well-regarded ones (EVALS.md). `types` limits a check to the page types it makes sense on.
// Every check needs an entry in lessons.mjs; a check without one cannot appear in a report.
const c = (weight, metrics, types = null) => ({ weight, metrics, types });
export const FINDINGS = {
    "nothing-to-browse": c(3, ["content.cardsPerScreen:low", "content.cards:low", "page.screens:low"], ["home", "listing"]),
    "hero-takes-fold": c(2, ["fold.heroShare:high"], ["home", "listing"]),
    "buy-below-fold": c(3, ["detail.priceInFold:low", "detail.titleInFold:low"], ["detail"]),
    "few-photos": c(1.5, ["detail.galleryImages:low"], ["detail"]),
    "equally-loud": c(2, ["type.boldShare:high"]),
    "text-on-photos": c(2, ["image.textOverShare:high"]),
    "low-contrast": c(3, ["contrast.failShare:high"]),
    "noisy-type": c(1.5, ["type.sizes:high", "type.families:high"]),
    "small-text": c(1.5, ["type.smallTextShare:high"]),
    "competing-actions": c(2, ["actions.competingPrimaries:high"]),
    "hidden-actions": c(2, ["actions.hiddenShare:high"]),
    "static": c(1.5, ["probe.hoverButtons:low", "probe.pressButtons:low"]),
    "no-focus": c(1.5, ["probe.focusVisible:low"]),
    "soft-images": c(2, ["image.upscaledShare:high"]),
    "broken-images": c(3, ["image.broken:high"]),
    "sideways-scroll": c(3, ["layout.hScrollPx:high"]),
    "zooming-inputs": c(2, ["touch.smallInputShare:high"]),
};
/** { checkId: weight } for a page type; a check that does not apply to the type is left out. */
export function profile(type) {
    if (!TYPES.includes(type)) throw new Error(`unknown page type "${type}" (one of ${TYPES.join(", ")})`);
    return Object.fromEntries(Object.entries(FINDINGS).filter(([, d]) => !d.types || d.types.includes(type)).map(([id, d]) => [id, d.weight]));
}

export function fmt(key, v) {
    if (v == null) return "–";
    const u = METRICS[key]?.unit;
    if (u === "share") return `${Math.round(v * 100)}%`;
    if (u === "0/1") return v >= 0.5 ? "yes" : "no";
    if (u === "px") return `${v}px`;
    if (u === "screens") return `${v} screens`;
    if (u === "×") return `${v}×`;
    return String(Math.round(v * 100) / 100);
}

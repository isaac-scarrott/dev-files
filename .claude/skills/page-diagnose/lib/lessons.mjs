// The teaching behind every check, written once. The report builder reads this file and nothing
// else for its words; a check with no entry here cannot appear in a report.
//
// An entry:
//   name   the check in two or three plain words (lists, "also on…" lines)
//   title  (c) → the problem as a plain sentence about this page
//   see    (c) → what we see on this page, with specifics: which elements, how many, where
//   why    the principle, what it does to the person using the page, and why a designer holds it
//   good   what a well-made page does instead
//   fix    the change to make (a house profile may replace this with its own rule: see PROFILES.md)
//   doubt  what could make this a false alarm
//   source where the principle comes from
//   show   which picture teaches it: "page" (whole page, shrunk), "fold" (first screen), "cards"
//          (ours marked where the problem is, the reference's cards beside it) or "spot" (ours only, marked)
//
// c = { detail: where the bold is and which sizes and fonts are used, design: true for a Paper frame, m: this page's metrics at the width shown, ref: the pictured reference ({ name, metrics }) or null, stats: the references' statistics per metric, n: the number that fired, all: every number that
//       fired, ev: evidence rows [{ text, note, rect }], width, phone, pct(v), quote(k) }
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (a, b) => { const r = a / b; return `${r >= 3 ? Math.round(r) : Math.round(r * 10) / 10}×`; };
// The fair comparison for bold: weight 500 looks nearly bold and the 600 cut-off does not count it, so a
// reference that sets its titles at 500 reads far lighter than it looks. Both counts are quoted, against the same reference.
function boldAt500(c) {
    const k = "type.weight500Share", ours = c.m[k], who = c.ref ? c.ref.name : "the reference pages, typically,";
    const theirs = c.ref ? c.ref.metrics?.[k] : c.stats[k]?.median, theirs600 = c.ref ? c.ref.metrics?.["type.boldShare"] : c.n.median;
    if (typeof ours !== "number" || !theirs) return "";
    return ` Weight 500 looks nearly as heavy and is not in that figure. Counting 500 and heavier, this page is ${c.pct(ours)} and ${who} ${c.pct(theirs)}: about ${times(ours, theirs)} as much${theirs600 ? `; on the 600-and-heavier figures alone (${c.pct(c.m["type.boldShare"])} against ${c.pct(theirs600)}) it is ${times(c.m["type.boldShare"], theirs600)}` : ""}.`;
}

export const LESSONS = {
    "nothing-to-browse": {
        name: "Too little to browse",
        title: (c) => `There is not much here to look through: ${c.m["page.screens"]} screens and ${plural(c.m["content.cards"], "card")}`,
        see: (c) => `The whole page is ${c.m["page.screens"]} screens long and holds ${plural(c.m["content.cards"], "thing", "things")} to pick from (${c.m["content.cardsPerScreen"]} per screen). The picture shows the whole page cut into screens, with the first screen boxed.`,
        why: "People arrive at a browsing page to compare options, and they judge the range on offer by how much they can scroll through. A short page with a handful of items reads as a thin catalogue, so visitors leave to look elsewhere even when the full range is one search away. Showing more real products is also the cheapest way to make a page feel alive: content is the design.",
        good: "The reference keeps going: row after row of real products, grouped under headings that say why each row is there (top picks, near you, by theme), so there is always a next thing to look at.",
        fix: "Add rows of real products under headings that give a reason to look (best sellers, by category, by neighbourhood) until the page offers about as many items as the references. Do not pad with banners or copy.",
        doubt: "A page that deliberately shows a short list (a saved trip, a filtered search with few matches) will trip this. Carousels count only the items on screen, so a rail that scrolls sideways is undercounted.",
        source: "Jakob's Law (NN/g): people expect a browsing page to work like the ones they already use.",
        show: "page",
    },
    "hero-takes-fold": {
        name: "The hero fills the first screen",
        title: (c) => `One picture takes ${c.pct(c.m["fold.heroShare"])} of the first screen`,
        see: (c) => `A single image covers ${c.pct(c.m["fold.heroShare"])} of the first screen at ${c.width}px, so ${c.m["fold.cards"] ? `only ${plural(c.m["fold.cards"], "card")} is visible` : "no product is visible"} before scrolling.`,
        why: "The first screen is the most-read part of any page, and many visitors decide there whether to stay. A full-height picture is pleasant, but it tells a shopper nothing about what is for sale, and it hides the fact that there is more below: people often do not scroll when nothing peeks up from the edge. On a page whose job is to sell, the hero should introduce the content, not replace it.",
        good: "The reference keeps its hero to roughly half the screen and lets the top of the first row of products show beneath it, which both sells and signals that the page continues.",
        fix: "Shorten the hero so the first row of products is cut off by the bottom edge of the screen, at 1440 and on a phone.",
        doubt: "A campaign or brand page may want a full-screen hero on purpose; this check is for pages that sell.",
        source: "NN/g, “The Fold Manifesto” and “The Illusion of Completeness”.",
        show: "fold",
    },
    "buy-below-fold": {
        name: "Price or title below the first screen",
        title: (c) => `You have to scroll to learn ${c.m["detail.titleInFold"] ? "the price" : c.m["detail.priceInFold"] ? "what this is" : "what this is and what it costs"}`,
        see: (c) => `On the first screen at ${c.width}px ${c.m["detail.titleInFold"] ? "the title is visible" : "there is no title"} and ${c.m["detail.priceInFold"] ? "the price is visible" : "there is no price"}.`,
        why: "Someone landing on a product page has two questions before any other: is this the thing I meant, and what does it cost. If either answer needs a scroll, a share of visitors assume it is hidden for a reason, or bounce back to the list to check. Price is the fact people most often leave a page to find.",
        good: "The reference shows the name, the price and the button to book together on the first screen, usually in a panel that stays put while you read.",
        fix: "Bring the title and the from-price above the bottom edge of the first screen, beside or directly under the photos, with the booking button next to the price.",
        doubt: "A price written without a currency symbol, or drawn inside an image, is not recognised.",
        source: "Baymard Institute, product-page research: price and primary action belong together, visible on arrival.",
        show: "fold",
    },
    "few-photos": {
        name: "Too few photos at the top",
        title: (c) => `Only ${plural(c.m["detail.galleryImages"], "large photo")} at the top of the page`,
        see: (c) => `${plural(c.m["detail.galleryImages"], "large picture")} (200×150 or bigger) ${c.m["detail.galleryImages"] === 1 ? "sits" : "sit"} in the first screen and a half.`,
        why: "For an experience, the photos are the product: people cannot try it, so they judge it by what they can see. One picture answers “what is it”; several answer “what will my day be like”, which is the question that sells a tour. A thin gallery also reads as a seller who does not have much to show.",
        good: "The reference opens with a gallery of several large photos, the first one dominant, with a way to see the rest.",
        fix: "Show four or five photos in a grid at the top, largest first, with a control to open the full set.",
        doubt: "Pictures loaded only after a click are not counted.",
        source: "Baymard Institute, product-page research on image galleries.",
        show: "fold",
    },
    "equally-loud": {
        name: "Too much bold",
        title: (c) => `${c.pct(c.m["type.boldShare"])} of the text is bold, so nothing stands out`,
        see: (c) => `${c.pct(c.m["type.boldShare"])} of the characters on this page are set bold (weight 600 or heavier). Where it comes from: ${(c.detail.boldGroups ?? []).slice(0, 6).map((g) => `${g.what} ${c.pct(g.share)} (such as “${g.sample}”)`).join("; ")}.${boldAt500(c)} The boxed runs are bold at ordinary text size: the longest such run and those nearest to it.`,
        why: "Bold works by contrast with the regular text around it: it says “read this first”. When most of the text is bold, that signal is gone, and the eye has no path through the page. It also makes the page look heavy and shouty, which people read as cheap. Hierarchy should come from size first, with weight saved for the few things someone acts on.",
        good: "The reference sets most text at regular weight and keeps bold for a card’s title and price, so those are what you see when you glance at a row.",
        fix: "Set body text, meta lines (duration, place, review count) and labels at regular weight. Keep bold for titles, prices and the selected state, and let headings be larger rather than heavier.",
        doubt: "A font that only ships one heavy weight, or a page that is mostly headings and buttons, will read high.",
        source: "The Von Restorff (isolation) effect: the item that differs is the one remembered. Refactoring UI, “Emphasize by de-emphasizing”.",
        show: "cards",
    },
    "text-on-photos": {
        name: "Text on top of photos",
        title: (c) => `${c.pct(c.m["image.textOverShare"])} of the words sit on top of a photo`,
        see: (c) => `${c.pct(c.m["image.textOverShare"])} of the characters on this page are drawn over a picture rather than beside or below it${c.quote(3) ? `, for example ${c.quote(3)}` : ""}. Words on the hero picture and on solid badges are allowed and are not counted.`,
        why: "A photo is busy: light and dark patches, edges, faces. Text laid over it competes with all of that, and how readable it is changes with every picture, so some cards will always be hard to read. It also hides part of the picture people came to see. Putting words beside or below the image keeps both the photo and the text doing their own job.",
        good: "The reference shows the photo clean and puts the title, rating and price on a plain surface under it; the only words on a picture are a small badge on a solid chip.",
        fix: "Move card text off the image onto the card’s own surface below it. Keep text on a photo only in the hero, over a gradient that covers the text’s half of the image.",
        doubt: "The hero is taken to be the largest picture in the first screen; text on any other large picture counts. Text on a solid chip or panel over a photo is not counted. Text over a blurred or translucent copy of the photo is counted, because the picture still shows through.",
        source: "NN/g, “Ensure High Contrast for Text Over Images”.",
        show: "cards",
    },
    "low-contrast": {
        name: "Text too faint to read",
        title: (c) => `${c.pct(c.m["contrast.failShare"])} of the text is too faint against its background`,
        see: (c) => `${c.pct(c.m["contrast.failShare"])} of the characters (${plural(c.m["contrast.failRuns"], "piece")} of text) fall short of the minimum contrast with what is painted behind them${c.ev[0] ? `. Worst: ${c.ev.slice(0, 3).map((e) => `“${e.text}” at ${e.note}`).join(", ")}` : ""}.`,
        why: "Contrast is what makes text legible at all. Below about 4.5 to 1, reading slows for everyone and fails for people with weaker eyesight, on a phone in sunlight, or on a cheap screen. Pale grey text is the usual culprit: it looks refined on a designer’s monitor and disappears everywhere else. It is also an accessibility requirement, not only a matter of taste.",
        good: "Well-made pages keep secondary text a clear mid-grey that still passes 4.5 to 1, and use size and position, not faintness, to make it secondary.",
        fix: "Darken the boxed text (or lighten its background) until it reaches 4.5 to 1, or 3 to 1 for text of 24px and larger. Fix the colour token once rather than each use.",
        doubt: "Text over a photo or gradient is judged from screenshot pixels, which is approximate. Disabled controls and logos are exempt from the standard but are not recognised as such.",
        source: "WCAG 2.2, success criterion 1.4.3 Contrast (Minimum).",
        show: "spot",
    },
    "noisy-type": {
        name: "Too many text sizes or fonts",
        title: (c) => `${c.m["type.sizes"]} text sizes${c.m["type.families"] > 1 ? ` and ${c.m["type.families"]} fonts` : ""} are in use`,
        see: (c) => { const u = c.detail.typeUse ?? { sizes: [], families: [] }; const big = u.sizes.filter((x) => x.share >= 0.005); return `The page uses ${c.m["type.sizes"]} text sizes that matter: ${big.map((x) => `${x.size}px (${c.pct(x.share)}, “${x.sample}”)`).join(", ")}.${u.families.length > 1 ? ` Fonts: ${u.families.map((f) => `${f.name} (${c.pct(f.share)}, “${f.sample}”)`).join(", ")}.` : ""}${c.design && u.families.some((f) => f.share < 0.05) ? " In a design frame, a font on only a sliver of the text is usually left over from a capture rather than chosen: check before counting it." : ""} One example of each size is boxed.`; },
        why: "Each text size is a level of importance. With five or six, a reader learns the system in a glance: this is a heading, this is detail. With ten or more, sizes sit one pixel apart and stop meaning anything, so the page looks untidy without anyone being able to say why. Extra fonts multiply the effect. Fewer sizes, further apart, is what makes a page look designed.",
        good: "The reference gets by on a small scale with clear jumps between steps, and one font family (two at most, one for headings).",
        fix: "Map every piece of text to one of about seven roles (display, section title, card title, body, meta, caption, price) and delete the sizes in between. Neighbouring steps should differ by at least 1.14×.",
        doubt: "Sizes that scale smoothly with the window can appear as extra steps.",
        source: "Refactoring UI, “Establish a type scale”. Hick’s Law: more distinct choices take longer to parse.",
        show: "spot",
    },
    "small-text": {
        name: "Text too small",
        title: (c) => `${c.pct(c.m["type.smallTextShare"])} of the text is smaller than 12px`,
        see: (c) => `${c.pct(c.m["type.smallTextShare"])} of the characters are set under 12px; the most common text size on the page is ${c.m["type.bodySize"]}px${c.quote(3) ? `. The boxed text includes ${c.quote(3)}` : ""}.`,
        why: "Small text is the first thing to become unreadable on a phone held at arm’s length or for anyone over forty. It is usually where the facts people decide on end up (duration, cancellation terms, what is included), so making it tiny hides exactly what sells. If something is worth showing, it is worth showing at a size people can read.",
        good: "The reference keeps its smallest text at 12px or above and sets running text at 14 to 16px.",
        fix: "Raise the boxed text to at least 12px (captions) or 13px (meta lines), and body text to 16px on phones.",
        doubt: "Legal footers and badges are counted like any other text.",
        source: "Apple Human Interface Guidelines and Material Design both set 11 to 12px as the floor for legible text.",
        show: "spot",
    },
    "competing-actions": {
        name: "Two main buttons side by side",
        title: (c) => `${c.ev.length >= 2 ? `“${c.ev[0].text}” and “${c.ev[1].text}” are both styled as the main button` : "More than one button is styled as the main action in the same place"}`,
        see: (c) => `${plural(c.m["actions.competingPrimaries"], "group")} of neighbouring buttons share the same strong fill${c.ev.length ? `: ${c.ev.slice(0, 4).map((e) => `“${e.text}”`).join(", ")}` : ""}.`,
        why: "The filled, coloured button is how a page says “this is the next step”. Two of them side by side say it twice about different things, and the visitor has to stop and read both to work out which one they want; some will pick wrong and some will pick neither. One clear primary action per view is the single most reliable way to move people forward.",
        good: "Well-made pages give one button the strong fill and style its neighbour as an outline or plain text link, so the order of importance is visible before reading a word.",
        fix: "Keep the fill on the action most people should take next; restyle the other as a secondary (outline) or tertiary (text) button.",
        doubt: "A pair that really is either-or with equal weight (two ticket types, say) can be flagged.",
        source: "Hick’s Law. NN/g on visual hierarchy of primary and secondary actions.",
        show: "spot",
    },
    "hidden-actions": {
        name: "Actions hidden behind ⋯",
        title: (c) => `What you can do with each row is hidden behind a ⋯ menu`,
        see: (c) => `On ${c.pct(c.m["actions.hiddenShare"])} of the rows and cards that offer an action, the only control is an unlabelled “more” (⋯) button.`,
        why: "People do not go looking for actions they cannot see. A ⋯ button says nothing about what is behind it, so the things someone came to do (change, cancel, share) are found late or not at all, and every use costs an extra click. Menus are for the rarely used extras, not for the reason the page exists.",
        good: "Well-made pages put the one or two actions people come for as labelled buttons on each row, and keep the menu for the rest.",
        fix: "Show the main action of each row as a labelled button; leave only secondary actions in the ⋯ menu.",
        doubt: "A dense table where space is truly tight is a fair place for a menu.",
        source: "NN/g, “Hamburger Menus and Hidden Navigation Hurt UX Metrics” and “Designing Effective Contextual Menus”.",
        show: "spot",
    },
    static: {
        name: "Nothing responds to the pointer",
        title: (c) => `Buttons and links do not react when you point at or press them`,
        see: (c) => [c.m["probe.hoverButtons"] != null ? `${c.pct(c.m["probe.hoverButtons"])} of the buttons and links changed on hover` : null, c.m["probe.pressButtons"] != null ? `${c.pct(c.m["probe.pressButtons"])} of the buttons changed when pressed` : null].filter(Boolean).join("; ") + ". The boxed ones did nothing.",
        why: "A small change under the pointer is how a page says “yes, this is clickable, and you are on it”. Without it people hesitate or click twice. The response on press matters as much: it confirms the click registered while the next page loads. Pages that answer feel quick and well made; pages that do not feel broken even when they work.",
        good: "On well-made pages every button and link changes on hover (a darker fill, an underline) and buttons change again on press.",
        fix: "Give every button and link a hover state and every button a distinct pressed state, animated on transform and opacity only so it stays smooth.",
        doubt: "Only up to five buttons and three links are tried. Hover is tested at desktop width only. A response drawn by script on a frozen copy of a page is not seen.",
        source: "Nielsen’s first usability heuristic: visibility of system status.",
        show: "spot",
    },
    "no-focus": {
        name: "No visible keyboard focus",
        title: (c) => `You cannot see which control the keyboard is on`,
        see: (c) => `${c.pct(c.m["probe.focusVisible"])} of the controls tried show any change when focused. The boxed ones look identical focused and unfocused.`,
        why: "People who move through a page with the keyboard (by need or by habit, and everyone filling a form with Tab) rely on a visible ring to know where they are. Remove it and the page is unusable for them: they are typing blind. It is usually lost by accident, when someone hides the browser’s default outline for looks and never puts one back.",
        good: "Well-made pages draw a clear ring in the brand’s action colour around the focused control, at least 2px, visible on every background.",
        fix: "Restore a focus-visible ring on every interactive element: 2px, the action colour, with a small offset.",
        doubt: "Only a sample of controls is tried.",
        source: "WCAG 2.2, success criteria 2.4.7 Focus Visible (AA) and 2.4.13 Focus Appearance (AAA).",
        show: "spot",
    },
    "soft-images": {
        name: "Pictures stretched and blurry",
        title: (c) => `${c.m["image.upscaled"]} pictures are shown larger than their files`,
        see: (c) => `${c.m["image.upscaled"]} of the page’s pictures (${c.pct(c.m["image.upscaledShare"])}) are drawn bigger than the image file itself${c.ev[0]?.note ? `, for example a ${c.ev[0].note.replace("shown at", "file shown at")} box` : ""}, so the browser stretches them.`,
        why: "A stretched picture goes soft, and on the sharp screens most phones and laptops now have it looks softer still. Blurry photos make the product look worse and the seller look careless, and for an experience the photo is most of what people judge by. It is almost always a delivery fault, not a photography one: the page asked for a file too small for the space.",
        good: "Well-made pages request each picture at the size it is shown, and at twice that for high-density screens, so photos stay crisp.",
        fix: "Request each image at its rendered width times the screen’s pixel density (srcset with 1x and 2x, or the image service’s width parameter).",
        doubt: "A small picture stretched on purpose as a soft backdrop is counted, unless it sits under a CSS blur.",
        source: "web.dev, “Serve responsive images”.",
        show: "spot",
    },
    "broken-images": {
        name: "Broken pictures",
        title: (c) => `${plural(c.m["image.broken"], "picture")} failed to load`,
        see: (c) => `${plural(c.m["image.broken"], "picture")} on the page did not load and ${c.m["image.broken"] === 1 ? "shows" : "show"} as an empty box or a broken-image icon.`,
        why: "A missing picture is the clearest sign of an unmaintained site, and people extend that judgement to the booking itself: if the page is broken, will my ticket work? It also leaves a hole where the most persuasive thing on the page should be.",
        good: "Well-made pages either show the picture or fall back to a deliberate placeholder in the same shape.",
        fix: "Fix or remove the dead image addresses, and add a fallback so a failed picture shows a neutral placeholder rather than a broken icon.",
        doubt: "A picture blocked for this visit only (a tracker, a network blip) would show the same way.",
        source: "Stanford Web Credibility Guidelines: small errors damage trust out of proportion to their size.",
        show: "spot",
    },
    "sideways-scroll": {
        name: "The page scrolls sideways",
        title: (c) => `The page is ${c.m["layout.hScrollPx"]}px wider than the screen`,
        see: (c) => `At ${c.width}px the page can be dragged ${c.m["layout.hScrollPx"]}px sideways. The boxed element is the widest thing sticking out past the right edge.`,
        why: "A page that slides sideways under the thumb feels broken at once: content jumps out of view, and people cannot tell whether they are missing something off to the right. It is nearly always one element with a fixed width that nobody tried on a small screen.",
        good: "Well-made pages fit the screen width exactly at every size; only deliberate rails scroll sideways, inside their own box.",
        fix: "Give the boxed element a maximum width of 100% (or let it wrap), and check the page at 390px and 320px.",
        doubt: "None to speak of: this is measured directly.",
        source: "WCAG 2.2, success criterion 1.4.10 Reflow.",
        show: "spot",
    },
    "zooming-inputs": {
        name: "Inputs that make phones zoom",
        title: (c) => `${plural(c.m["touch.smallInputs"], "input")} will zoom the page on an iPhone`,
        see: (c) => `${plural(c.m["touch.smallInputs"], "input")} on the phone layout use text smaller than 16px${c.ev[0]?.note ? ` (${c.ev[0].note})` : ""}.`,
        why: "Safari on iPhone zooms the whole page in whenever you tap an input whose text is under 16px, and does not zoom back out. The visitor is left with a cropped page mid-task and has to pinch back before they can carry on, which happens exactly when they are trying to search or pay.",
        good: "Well-made pages set every input, select and textarea to at least 16px on phones.",
        fix: "Set input text to 16px at phone widths.",
        doubt: "None to speak of: the size is read directly.",
        source: "Long-standing iOS Safari behaviour, which Apple does not document: CSS-Tricks, “16px or Larger Text Prevents iOS Form Zoom”.",
        show: "spot",
    },
};

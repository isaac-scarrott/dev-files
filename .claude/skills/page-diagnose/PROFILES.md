# Page types, references and house rules

## Page types

A page is judged as one type, detected from its address and content (`lib/judge.mjs`, `classify`) and overridable with `--type`:

| type | what it is | kind |
|---|---|---|
| home | the front page of a site that sells: search, rows of products | transactional |
| listing | search results or a category: many cards, filters | transactional |
| detail | one product: photos, price, a button to book | transactional |
| availability | choosing a date, time and tickets | transactional |
| cart | what has been chosen so far | transactional |
| checkout | details and payment | transactional |
| form | any other form (contact, enquiry) | transactional |
| table | rows of records with actions | transactional |
| article | long-form reading | content |
| landing | a marketing page: one idea, one hero, a call to action, nothing to search or buy | marketing |

A page with nothing to search, compare or buy is a landing page whatever its address. Marketing and transactional pages are never compared with each other: a dense results page is not marked down for lacking a hero, and a landing page is not held to a results page's rules.

## What a page is compared with

Thresholds are relative. Each number is compared with the same number on the reference pages, and it counts as a problem only when it falls outside their whole range by more than a tolerance (the larger of a fixed slack, a share of the reference median, and 1.5× the spread between references; see `METRICS` in `lib/metrics.mjs`).

- **Structure** numbers (how much there is to browse, what the first screen holds, what a card carries) are compared with references **of the same type** only.
- **Craft** numbers (type, contrast, spacing, images, response) are compared with every reference of the same kind, so the range is well populated.
- A reference picture is only ever shown beside a page of its own type. With no reference of the type, only the craft checks run and the report says so.

The default set, `refs/travel.json`, holds the live home, listing, product and availability pages of Headout, Airbnb, Tiqets and Booking.com that finished loading when it was built. Nobody's cart or checkout is in it: they cannot be reached without adding to a basket.

Build your own for another sector, stating each page's type:

```
node diagnose.mjs refs build <set> home=<url> listing=<url> detail=<url> …
node diagnose.mjs <url> --refs <set>
```

A reference that is blocked, still loading or blank is refused, loudly, and left out of the set. `--against listing=<url> …` compares one run with exactly the pages given.

## House rules

`--profile house.json` adds absolute limits and the house's own wording for fixes:

```json
{
  "name": "Our design rules",
  "rules": [
    { "metric": "type.boldShare", "max": 0.15, "why": "bold is at most 15% of characters" },
    { "metric": "space.medianBand", "min": 16, "widths": "desktop" },
    { "metric": "image.upscaled", "equals": 0 }
  ],
  "fixes": { "equally-loud": "Card titles use the title token at weight 500; …" }
}
```

A rule names a metric from [`METRICS.md`](METRICS.md) with `max`, `min` or `equals`, optionally limited to `"widths": "phone" | "desktop"`. A failed rule is listed in the output and the run exits with code 2. A `fixes` entry replaces a lesson's "how to fix it here" with the house's own rule and token names; the rest of the lesson stays.

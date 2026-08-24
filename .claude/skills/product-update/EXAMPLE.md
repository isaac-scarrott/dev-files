# Worked example

The sentence search bar update, as sent. Annotated for why each part is there.

---

**[Product Update] Product Discovery Inputs**

The new search bar is live on Storefront v3

The old search bar worked, it just didn't feel great to use. Every field
including dates and travellers opened the same free text box, so booking a trip
meant typing things a calendar or a counter should be doing for you. This was
about making it feel snappy and natural to the user

What's changed:

- The bar now reads as a sentence: "In Paris for the dates 25 Aug - 30 Aug with
  2 Adults, 2 Children find anything". Each part is a chip that opens its own
  popover, with an inline ✕ to clear just that field.
- When is a proper range calendar, plus a new morning/afternoon/evening filter
  that actually filters products by their start times, that's new all the way
  through the API.
- Who is simple adult and child steppers instead of a text box.
- Where and What keep free text, with suggested destinations and smart picks
  underneath.
- No more advance/search buttons. Click the next chip or hit Enter and you're
  moving.
- The results grid no longer blanks to loading skeletons on every change.
  Searches you've already run come back instantly from cache, so browsing back
  and forth feels immediate.
- Mobile got the same treatment: the search sheet is now a tidy accordion with
  the calendar and steppers inline. Lots of nice UX improvements around this on
  mobile. Very happy with how mobile feels and behaves

This is being tested as an A/B test. We did have a previous experiment running
for the product discovery inputs, but with these refinements, we restarted the
experiment with this release so the results only measure the refined version,
which means discarding last week's data (sorry Helio). Test is called
productDiscoveryInput_20260824

Have attached some screenshots below of before and after, but as always I'd
advise you to check it out by configuring it in the demo site, the feature is
called "Product Discovery Input"

Thanks Graeme for all the help refining this

---

## Why it reads the way it does

**"live on Storefront v3"** — the product's name. An earlier draft said "live on
the storefront shell (HOL-616, merged this morning)", which means nothing to
most of the room.

**"it worked, it just didn't feel great to use"** — the problem in the user's
terms. No architecture, no ticket history.

**Bullets are behaviour.** "A proper range calendar", "adult and child
steppers", "no more advance/search buttons". The one implementation detail that
survives — "new all the way through the API" — earns its place by showing how
far the change reaches.

**The experiment paragraph names the key.** `productDiscoveryInput_20260824`.
Without it nobody can find the results.

**"(sorry Helio)"** — the restart binned a week of data. Naming the cost and the
person it lands on is better than hoping nobody notices.

**"configuring it in the demo site, the feature is called 'Product Discovery
Input'"** — self-serve. Better than "give me a shout and I'll send a link",
which was in the draft and got cut.

**"Thanks Graeme"** — always.

## Screenshot set

Nine, numbered in paste order, before first:

1. Before — old segmented desktop bar
2. After — new sentence bar
3. Before — dates popover (free-text box, no calendar)
4. After — When calendar + morning/afternoon/evening chips
5. After — Who steppers
6. After — Where suggestions
7. Before — mobile sheet (stacked text boxes)
8. After — mobile sheet (accordion)
9. After — mobile calendar expanded in the sheet

Headline change first, then each sub-change, then mobile. When offering the set,
say which are skippable — here, 5, 6 and 8.

# Worked example — Focus Group on a meditation app's first week

The cast below is shaped for *this* artifact and this domain. A different product needs a different cast — treat the structure (CVs → in-character reactions → convergence → action distribution → punch verdict) as the pattern, not the specific personas.

Everything in steps 4–6 below is what to send back to the user in chat. Nothing is written to disk.

---

User asks:
> "I've drafted the first-week experience for our meditation app — onboarding, daily reminder copy, and the day-5 paywall. What would real users actually do? Get a focus group going."

## Step 1 — name the artifact

Three artefacts at `/tmp/review/`: `onboarding-flow.png`, `daily-reminder-copy.md`, `day5-paywall.png`. Day 1–4 is free; day 5 hits the paywall after the user has built a small streak.

## Step 2 — cast 6 personas spanning who actually downloads this kind of app

1. **Sam, 34, new dad** — sleep-deprived, downloaded the app after his partner suggested he "be more present". 10 minutes of free time per day, all of it contested.
2. **Rachel, 47, high-school teacher** — burned out after a six-year stretch with no break. Looking for help with a hard year, knows she should meditate, hasn't managed it.
3. **Tenzin, 53, long-term practitioner** — 20 years in a Tibetan tradition, occasional teacher in his sangha. Curious about apps because his students keep asking; sceptical that meditation can be unbundled from a tradition.
4. **Priya, 19, anxious college student** — diagnosed GAD, on the family insurance plan. Discovered the app via a TikTok ad. Has tried Headspace and Calm; bounced off both.
5. **Mark, 41, sceptic** — works in adtech, thinks "wellness apps" are a tax on lonely people. Downloaded after his sister gifted him a subscription.
6. **Dr Liu, 44, clinical psychologist** — recommends mindfulness apps to some patients, refuses to recommend others. Evaluating this one professionally.

## Step 3 — dispatch in parallel

Sample prompt for Sam:

> *You are Sam, 34, a new dad to a four-month-old. You sleep in four-hour stretches. Your partner suggested you "try to be more present" after she watched you scroll your phone through bath-time. You have maybe 10 minutes of free time per day and most of that is contested by laundry, work, or sleep itself. You opened this app at 11pm in bed, hoping for something that won't ask too much of you.*
>
> *Look at the three artefacts: `onboarding-flow.png`, `daily-reminder-copy.md`, `day5-paywall.png`. Stay fully in character. Do not break character or add meta-commentary about being an AI. Respond in first person.*
>
> *Tell me honestly what you'd do at each step. Don't be polite. Focus on what would make you put the phone down for good. Under 200 words. End with one specific thing you'd change first.*

## Step 4 — convergence table

```
| Issue                                                  | Flagged by                              | Verdict |
|--------------------------------------------------------|-----------------------------------------|---------|
| "Welcome to your wellness journey" reads as patronising| Sam, Rachel, Mark, Tenzin (4/6)         | High    |
| Onboarding asks 7 questions before showing a session   | Sam, Mark, Priya (3/6)                  | High    |
| Day-5 paywall hits the moment a streak is forming      | Rachel, Priya, Mark (3/6)               | KILL    |
| Daily reminder "Don't break your streak!" is hostile   | Priya, Rachel, Dr Liu (3/6)             | High    |
| No way to log "I tried, it didn't work" without guilt  | Rachel, Dr Liu (2/6)                    | Medium  |
| Tradition-stripped framing reads as marketing copy     | Tenzin (1/6)                            | Low (single voice but the only person who could spot it) |
```

## Step 5 — action distribution + verbatim quotes + punch verdict

> Of 6 personas, after a full week: **Sam opens the app twice, both times for under a minute, deletes on day 4. Rachel completes 4 days, hits the paywall mid-crisis-week, churns angrily. Tenzin deletes after onboarding — *"this is what we call ego dressed in saffron"*. Priya starts a free trial intending to cancel; the streak-loss notification on day 6 triggers her exactly the way she didn't want. Mark uses it twice on different days to test, never converts. Dr Liu completes the week to evaluate, decides she would not recommend it to anxious patients — the streak language is the deal-breaker.**
>
> **Zero conversions. Two churns. Two angry uninstalls. One quiet abandonment. One professional non-recommend.**
>
> *Rachel: "Day five is the worst possible day to ask me for money. I am exactly the user you want — the one who's actually building a habit — and that's the day you cash in your relationship with me."*
>
> *Priya: "I have anxiety. Telling me I'm going to lose something I just built is the most anxiety-inducing notification I could receive."*
>
> *Tenzin: "The teacher who taught me said meditation is not a streak. You are gamifying the one thing that's meant to be free of games."*
>
> **Punch verdict: every persona who'd actually benefit from meditation is the one this onboarding scares off.**

## Step 6 — recommended next action

Three changes before round 2: drop the "wellness journey" framing, move the paywall to a moment that isn't crisis-tied (or remove streak-loss notifications entirely), and let users complete an onboarding-free session as the first action. Round 2 with the same panel after these land — keep Tenzin in the cast even though his finding was single-voice; his lens is the only one that catches the tradition-stripping critique.

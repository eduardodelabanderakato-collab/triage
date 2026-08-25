# Triage — adaptive study scheduler

A single-file static web app that plans every study day around one rule: **when a week
falls apart, the cut order is fixed and never inverts.** Built for an IB DP student
(May 2028 exams, target 45) chasing a 1600 SAT by the end of semester and building
PeakScore. The Today view carries the countdown.

No backend, no accounts, no framework, no build step for the user. Open
[index.html](index.html) directly, or deploy it unchanged.

## The triage ladder (this *is* the algorithm)

| Tier | Contents | Behaviour |
|------|----------|-----------|
| 0 | Sleep, soccer, meals, one social block/week | Never scheduled against. Not in the allocation pool. |
| 1 | Math AA HL, Physics HL, Economics HL | Full weight. Never cut. |
| 1* | PeakScore | A fixed 30-minute daily ritual (Tue/Thu/Fri + both weekend days, skipped on soccer days, 150 min/week). Never competes for flex — school owns those — but still gates Tier 3 like any Tier 1 subject. |
| 2 | Chemistry SL, SAT | Weight ×0.72. Cut when the week is tight. Chemistry carries a ×1.25 priority (effective ≈0.9) — below Physics, above the rest of the tier. |
| 3 | English SL, Portuguese SL | Weight ×0.45. Locked out while **any** Tier 1 subject is >40% behind the week's **pace** (pro-rated target) — a slipping week cuts from the bottom, but a normal Monday doesn't blanket-ban them. Exception: a subject with an assessment ≤10 days away (an imminent IO beats the ladder). |

## How a day is planned

1. **Template** — fixed by weekday: Mon/Wed are soccer days (flex 45+90+45), Tue/Thu/Fri
   run flex 90+70+60 + the PeakScore half hour. Weekends are the get-ahead days:
   Saturday is a 135-min timed full test + flex 100+120 + PeakScore 30, Sunday a
   120-min error autopsy + 60-min weekly review + flex 90+60 + PeakScore 30. Floor
   mode replaces everything with three blocks totalling 25 minutes.
2. **Weight each subject** (`subjectWeight` in [src/engine.js](src/engine.js)):

   ```
   remedial  = Σ over grades ≤21 days old: 30·(7−score)·(1−age/21), capped at 180
   prep      = 180 (test in 1–2d) · 120 (3–5d) · 60 (6–10d) · else 0
   target    = weeklyMinutes + remedial + prep   ← grades AND assessments add minutes
   remaining = max(0, target − minutes logged this week)
   testMult  = 3.0 (test in 1–2d) · 2.2 (≤5d) · 1.6 (≤10d) · 1.25 (≤14d) · else 1
   gradeMult = 1 + Σ 0.22·(7−score)·(1−age/21), capped at 2.6
   shakyMult = 1 + 0.5·(shaky topics / total topics)
   classMult = 1.2 if the subject met in school today (Day 1/Day 2), else 1
   wkndMult  = Sat/Sun only: math ×1.35 · physics ×1.35 · econ ×1.3 · chem ×0.8 · else 1
   staleMult = 1 + 0.15·min(7, days since the subject was last studied)   ← nothing starves
   mult      = min(3.5, testMult · gradeMult · shakyMult)
   score     = (remaining/60 + 0.1) · mult · tierWeight · priority · classMult · wkndMult · staleMult
   ```
   `priority` is an optional per-subject multiplier on the tier weight (only Chemistry
   uses it today, ×1.25). `staleMult` is why big-budget subjects can't monopolise the
   week: a subject untouched for days builds pressure (up to ×2.05) until it wins a
   block, so econ/chem/English/Portuguese surface without waiting for leftovers.
   A test **on its own date** contributes nothing — by the time
   evening blocks start it has been sat, and it never shadows the next upcoming test.
   As a day's slots are assigned, `remaining` is re-evaluated minus what's already
   planned, so a nearly-fed subject stops absorbing surplus and free capacity flows
   back up the ladder. The weekend bias orders *outstanding need* (fresh-week weekend:
   math and physics take the deep blocks, econ next, chem last); it never forces work
   on a subject that has already hit its target.
3. **Placement** — `PLACEMENT` in engine.js interpolates from first to last flex block:
   analytical subjects (math/phys/chem) ×1.35→×0.75, project work (PeakScore/SAT)
   ×0.60→×1.40. Hard problem-solving gets the freshest hour. *Test-eve exception:* ≤2
   days before a test a subject's placement never drops below ×1.0, so urgency wins the
   late blocks too. Spread: a subject is capped at 150 min/day and its live score is
   divided by (1 + planned/90) as slots fill.
4. **Topic pick** — topics named by a test ≤10 days out win outright, then
   shaky → learning → new → solid-past-review-date, least-recently-studied first, no
   repeats within a day.
5. **Instruction + reason** — task text varies by topic status (with dedicated phrasing
   for Economics, English, Portuguese, PeakScore, and oral topics, which get
   record-yourself run-through instructions); each block carries a short reason chip
   ("test in 2d", "grade below target · +90 min"). "Behind weekly target" only appears
   from Thursday when the deficit exceeds 50% — early-week it would be noise.

Every workable block has a **▶ pomodoro** button: 25 minutes focus / 5 break on a
loop in a gold bar above the tabs, purely visual (no notifications, by design).

Ticking a block writes a real log entry (progress is measured, not self-reported),
advances a `new` topic to `learning`, and pins the block so later replans don't
reshuffle finished work. The Saturday block is a full SAT test until you flip
**SAT done**, then it becomes a timed IB past paper and the SAT leaves the pool.

## Day 1 / Day 2 rotation

School alternates Day 1 (English, Economics, Math) and Day 2 (Chemistry, Portuguese,
Physics) across weekdays, carrying over weeks — one week 1-2-1-2-1, the next 2-1-2-1-2.
The engine gives the subjects you sat in class today a ×1.2 consolidation boost (study
it while it's fresh) and the Today header shows the day. The calendar is anchored by
`ANCHOR_MONDAY = '2026-08-24'` (a Day 1 Monday) in engine.js — if the school ever
resets the rotation, change that one constant. Class lists live in `CLASS_DAYS`.

## Retuning

- **Weekly minute budgets** — `SUBJECTS` in [src/seed.js](src/seed.js)
  (`weeklyMinutes`, optional `priority`). Current: Math 210 · Physics 180 · Econ 105 ·
  PeakScore 300 · Chem 140 · SAT 240 · English 45 · Portuguese 30. Subject tunables are
  re-read from the seed on every load, so retuning them updates existing devices too.
- **Time-of-day bias** — `PLACEMENT` in engine.js.
- **Day templates** — `template()` in engine.js.
- **Tier weights** — `TIER_W` in engine.js.
- **SAT goal & deadline** — `satTarget` / `satDeadline` in settings
  ([src/seed.js](src/seed.js)); when you book the real sitting, also add it as a test
  under SAT in the Log tab so the engine ramps up as it approaches.

After any change: `node src/build.js` regenerates index.html, and run the tests.

## Persistence

State lives in localStorage (`triage-state-v1`) and is mirrored into the
`<script type="application/json" id="app-state">` tag (with `<` escaped so the JSON
can't break out of the tag). On load: tag → localStorage → seed. Saving the page from
the browser therefore snapshots your data into the file itself. There is no sync by
design — use **Export backup / Import backup** in the Log tab to move data between
phone and laptop. On a phone, "Add to Home Screen" installs it as a standalone app.

## Development

```
node src/build.js    # concatenate src/ into index.html
node src/test.js     # engine tests (node, no deps)
npm install          # once, for Playwright
node src/uitest.js   # browser tests (uses installed Chrome if Playwright's Chromium is absent)
```

## Deploy to GitHub Pages

Push this folder to a GitHub repo → Settings → Pages → "Deploy from a branch" →
branch `main`, folder `/ (root)`. The committed index.html is served as-is.

## Scope guardrails

By design (and by request): no accounts, auth, backend, sync, or database; no
frameworks or shipped dependencies; no notifications, streaks, XP, badges, or AI
features. If a future request adds one of these, the correct response is "no —
go do chemistry."

MIT licensed — see [LICENSE](LICENSE).

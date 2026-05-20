# Tome of Obligations — Prioritized Improvement Plan

## Agreement/Disagreement with Your Analysis

### I agree with:
- **Onboarding Cliff** — Confirmed. 7 sections, self-care strip, tally bar, focus panel, wards, scry trigger, tabs all visible immediately with zero guidance. The Scry button is 13px font tucked between the tally bar and divider.
- **Too Many Interaction Points Per Task** — Confirmed and arguably understated. Each task renders up to 7 action buttons (focus, edit, notes, checklist, break down, delegate, banish), plus a clarity indicator, age badge, unbound badge, estimate badge, and delegated badge. That is a lot of visual noise per row.
- **Calendar/Day's Rite Disconnected** — Confirmed. The `.rite-panel` uses a simpler card style without the `sectionBreathe` animation, `--accent` color system, or `barGlow` effects that give the main sections their living quality.
- **Self-care strip green aesthetic** — Confirmed. Uses `rgba(60,168,85,...)` border, green `.on` state, feels like a health tracker rather than a grimoire ward system.
- **Brain dump inline colors** — Confirmed. Hard-coded `style="color:#9b50e0"`, `style="color:#3da855"` etc. directly in HTML rather than using CSS variables or the `--accent` system.

### I partially disagree with:
- **"Unbound scolding"** — I see the concern, but the current implementation is a badge plus a breakdown button that only appears for "vague" clarity tasks. The real problem is not scolding but that it appears *instantly* on task creation, when the user just wants to capture a thought. The badge itself is fine in principle; the timing is the issue.
- **Strengths assessment of Scry** — Your strengths list is accurate but I think you understate how good the one-at-a-time focus item display is. The `focusPeekMode` default of showing only the first oath is an excellent ADHD-friendly choice that reduces decision paralysis.

### Additional weaknesses I spotted:

1. **No "quick start" path** — Opening the app cold, there is no single obvious CTA. The user must either: find the tiny Scry button, or manually browse sections. For an ADHD user with low activation energy, the first 3 seconds determine whether they engage or tab away.

2. **Lock-in exit is invisible** — `exitLockIn()` is only accessible via a "release" button text that appears on the focus item. No obvious escape hatch, no keyboard shortcut visible. An ADHD user in a panic-switch moment (wrong task, interrupted) needs an instant, obvious exit.

3. **Thought Catcher only visible during lock-in** — The `.thought-catcher` is `display:none` by default and only shows via `.grimoire.locked-in ~ .thought-catcher` or `.always-on`. This means the most ADHD-relevant capture tool is hidden during the planning phase when intrusive thoughts are most likely.

4. **Timer display uses emoji in JS** — The lock-in timer renders emoji (`🕯`, `☕`) which may display inconsistently across systems and breaks the typographic unity of Cinzel/Crimson Text.

5. **Section collapse state not persisted across page switches** — Collapsing sections resets when switching tabs, forcing the user to re-collapse every time they navigate away and back.

6. **Focus panel shows different content per tab** — The focus panel filters to the active page's sections. This means sworn oaths disappear when switching to Calendar or Day's Rite, creating confusion about what you committed to.

7. **No ambient progress indicator** — There is no persistent "you've done 3/5 oaths today" progress ring or bar visible without opening the focus panel. ADHD users need constant small wins visible.

8. **Day's Rite has no connection to Scry** — You can Scry and commit oaths, but Day's Rite independently calculates its own task order via `scoreTask()`. The two planning systems don't talk to each other clearly.

9. **Drag-to-reorder in Day's Rite requires precision** — `cursor: grab` on small 6px-padded task rows is fiddly on both mobile and desktop. For ADHD users with motor impulsivity, this leads to accidental drags.

---

## Prioritized Improvement Tiers

---

### P0 — Critical ADHD Blockers (do these first)

#### P0.1: Auto-Scry on First Open / "Begin Your Day" CTA
**What:** When the app loads with no sworn oaths for today, show a prominent full-width banner in place of the focus panel that says "Begin Your Day" and launches Scry on click. Make it impossible to miss.
**Why (ADHD):** Eliminates the "staring at the app not knowing what to do" freeze. Reduces activation energy from "find tiny button + understand what it does" to "click the one obvious thing."
**Files:** `src/js/focus.js` (updateFocusPanel empty state), `src/css/focus.css`, `index.html` (scry-trigger sizing)

#### P0.2: One-Click Begin from Focus Panel (already exists, make it louder)
**What:** The "begin" button on the first oath should be larger, more visually prominent (pulsing border, slight glow), and optionally auto-trigger after 5s idle on the focus panel with a "starting in 5..." countdown the user can cancel.
**Why (ADHD):** The gap between "I see my task" and "I'm doing my task" is the #1 ADHD failure point. The current 7px uppercase button does not feel like an invitation.
**Files:** `src/css/focus.css` (.focus-begin-btn), `src/js/focus.js`

#### P0.3: Reduce Default Action Buttons Per Task to 2-3
**What:** Show only the toggle-done click area and ONE contextual icon (edit/expand). Move all other actions (notes, checklist, delegate, focus, banish) into an expanded detail view that appears on click/tap. The "break down" button for vague tasks can remain as a gentle nudge.
**Why (ADHD):** 6-7 buttons per task = decision paralysis + visual clutter. Each visible option is a micro-decision. Hiding rarely-used actions behind one tap preserves functionality while reducing cognitive load.
**Files:** `src/js/tasks.js` (buildTaskEl), `src/css/tasks.css` (if exists) or inline styles in the task HTML

#### P0.4: Delay "Unbound" Badge by 24 Hours
**What:** Don't show the unbound/vague clarity indicator until a task has existed for >24 hours without clarification. On creation, tasks should feel welcomed, not immediately judged.
**Why (ADHD):** Immediate negative feedback on capture kills the capture habit. The thought catcher philosophy ("capture it before it escapes") conflicts with instant "you didn't do enough" badges.
**Files:** `src/js/tasks.js` (buildTaskEl, around line 142 `isUnbound` logic)

#### P0.5: Make Thought Catcher Always Visible
**What:** Remove the `display:none` default on `.thought-catcher`. Show it as a persistent floating button at all times (not just lock-in).
**Why (ADHD):** Intrusive thoughts don't wait for lock-in mode. The whole point of a thought catcher is instant capture from any state.
**Files:** `src/css/components.css` (`.thought-catcher` rule, line 7), `index.html`

---

### P1 — High-Impact UX Improvements

#### P1.1: Visible Escape Hatch in Lock-In Mode
**What:** Add a persistent "Exit Focus" button or `Esc` key handler that's always visible during lock-in. Style it subtly but make it findable (top-right corner of focus panel, or a small "release" text below the timer).
**Why (ADHD):** Feeling trapped increases anxiety, which kills focus. Knowing you CAN leave makes it easier to stay.
**Files:** `src/js/focus.js` (enterLockIn/exitLockIn), `src/css/focus.css`

#### P1.2: Persistent Progress Ring
**What:** Add a small progress indicator near the page title or tally bar showing "X/Y oaths sealed today" as a ring or arc that fills with gold as tasks complete. Animate the fill with a satisfying ease-out.
**Why (ADHD):** Constant micro-reward visibility. The tally bar exists but is just numbers — a visual ring is more emotionally resonant and glanceable.
**Files:** `index.html` (near `.tally-bar`), new CSS for ring, `src/js/focus.js` or `src/js/tasks.js`

#### P1.3: Day's Rite Syncs with Sworn Oaths
**What:** When sworn oaths exist, Day's Rite should use them as the primary ordering rather than independently scoring. Show sworn oaths at the top with their committed order, then fill remaining capacity with auto-scored overflow.
**Why (ADHD):** Two competing planning systems create confusion. "I committed to these in Scry, but Day's Rite shows different priorities" erodes trust in the system.
**Files:** `src/js/dayrite.js` (gatherDayData, task ordering logic)

#### P1.4: Progressive Disclosure of Sections
**What:** On first use (or when total open tasks < 5), collapse all sections except the one with tasks. Show a "tour" tooltip on the Scry button. After Scry is completed once, expand sections that have sworn tasks.
**Why (ADHD):** Reduces initial overwhelm. The app should feel like it grows with you rather than presenting everything at max complexity immediately.
**Files:** `src/js/state.js` (track first-use), `src/js/tasks.js` (section collapse logic), new `src/js/onboarding.js`

#### P1.5: Keyboard Shortcuts for Core Actions
**What:** Add `Space` to start/stop focus on current oath, `Escape` to exit lock-in, `T` to open thought catcher, `S` to open Scry. Show a small `?` hint button that reveals the shortcut list.
**Why (ADHD):** Reduces physical effort-to-start. Keyboard users (common among developers/bioinformaticians) can enter flow without moving to mouse.
**Files:** New `src/js/shortcuts.js`, wire into `src/main.js`

#### P1.6: Focus Panel Always Shows All Sworn Oaths Regardless of Tab
**What:** Remove the page-section filtering from `updateFocusPanel()` when sworn oaths exist. Sworn oaths are your commitments for the day — they shouldn't vanish when you switch to Calendar.
**Why (ADHD):** Object permanence is weak in ADHD. If oaths disappear when you switch tabs, they stop existing mentally.
**Files:** `src/js/focus.js` (updateFocusPanel, lines 24-32)

---

### P2 — Aesthetic Polish & Immersion Consistency

#### P2.1: Day's Rite Gets Section-Style Treatment
**What:** Apply `sectionBreathe` animation, `--accent` color variables, `::before` accent bar, and `barGlow` to `.rite-panel`. Give it the same living quality as task sections.
**Files:** `src/css/dayrite.css` (`.rite-panel` rules)

#### P2.2: Custom Time Inputs Replace Native Widgets
**What:** Replace `<input type="time">` in Day's Rite with a custom styled time picker that uses the Cinzel/Crimson Text fonts and dark-fantasy color scheme. Could be a simple scrolling number picker or a dropdown.
**Why:** Native `color-scheme: dark` only partially themes the widget. The chrome of native time pickers breaks immersion.
**Files:** `src/css/dayrite.css`, `src/js/dayrite.js` (meeting input rendering)

#### P2.3: Self-Care Strip Retheming
**What:** Change the green border to `rgba(212,168,85,0.15)` (gold, matching wards). Change `.on` state from `#3da855` green to a warm gold/amber glow (`#d4a855` with gold drop-shadow). Rename the section concept to "Body Wards" or "Sustenance Runes" to match grimoire language.
**Why:** Green health-app aesthetic breaks the dark fantasy immersion. Gold/amber signifies "charged" vs "depleted" within the existing color language.
**Files:** `src/css/components.css` (`.selfcare-strip`, `.selfcare-icon.on`), `index.html` (labels/naming)

#### P2.4: Brain Dump Section Colors Use CSS Variables
**What:** Replace hard-coded `style="color:#9b50e0"` etc. in the brain dump HTML with CSS classes that reference the existing `--accent` system from `.section-lab`, `.section-bio`, etc.
**Files:** `index.html` (scry-step-dump section, lines 357-383)

#### P2.5: Calendar Page Gets Grimoire Styling
**What:** Wrap `.cal-panel` in the same card treatment as sections (background, border, accent bar, subtle breathing). Apply Cinzel headers and Crimson Text body to calendar content.
**Files:** Calendar CSS (likely `src/css/calendar.css` or within `main.css`), `index.html`

#### P2.6: Replace Emoji in Timer with Themed Icons
**What:** Replace `🕯` and `☕` in the lock-in timer string with Tabler icons (`ti-candle`, `ti-coffee`) rendered as small inline elements, matching the rest of the icon system.
**Files:** `src/js/focus.js` (timer display string construction, around line 247-248)

#### P2.7: Focus Panel "Begin" Button Glow Animation
**What:** Add a subtle pulsing glow to the begin button (matching the `sectionBreathe` timing) so it feels alive and inviting rather than static.
**Files:** `src/css/focus.css` (`.focus-begin-btn`)

---

### P3 — Nice-to-Have Enhancements

#### P3.1: "Quick Oath" — Skip Full Scry
**What:** Add a mini-Scry option that skips the reflection/brain dump steps and goes straight to Energy Oracle + task recommendation. For days when full Scry feels like too much.
**Why (ADHD):** Even a well-designed 5-step ritual can feel like a barrier on low-energy days. A 2-step version (energy level -> here are your tasks) preserves the benefit without the overhead.
**Files:** `src/js/scry.js`, `index.html` (add quick-scry option near trigger)

#### P3.2: Ambient Sound Toggle
**What:** Add optional ambient sounds (rain, crackling fire, quill scratching) that play during lock-in to enhance the body-doubling atmosphere. Small speaker icon in the lock-in card.
**Files:** New `src/js/audio.js`, audio assets, `src/js/focus.js`

#### P3.3: Streak/Consistency Visualization
**What:** In the weekly review or as a small widget, show a "flame streak" for consecutive days of completing at least one oath. Visual shows a growing flame or chain of lit candles.
**Why (ADHD):** Streaks are powerful motivators, but only when low-pressure (don't penalize missed days harshly — show "longest streak" alongside "current streak").
**Files:** `src/js/state.js` (streak tracking), weekly review overlay

#### P3.4: Section Auto-Collapse When Empty
**What:** Sections with zero open tasks automatically collapse to reduce visual noise, with a subtle "all sealed" indicator.
**Files:** `src/js/tasks.js` (renderSection)

#### P3.5: Swipe-to-Complete on Mobile
**What:** Add touch swipe gesture on task rows for quick completion without needing to tap the small rune-box.
**Files:** `src/js/tasks.js` (touch event handlers)

#### P3.6: "Momentum Mode" — Auto-Advance After Seal
**What:** When you complete an oath in lock-in mode, automatically advance to the next oath with a brief celebration pause (3s) rather than dropping back to the full list.
**Why (ADHD):** Maintains hyperfocus momentum. The transition between tasks is where ADHD users get lost.
**Files:** `src/js/focus.js` (seal completion handler)

#### P3.7: Persist Section Collapse State
**What:** Save collapsed/expanded state to localStorage so sections stay collapsed across page switches and app reloads.
**Files:** `src/js/tasks.js` or `src/js/state.js`

---

## Implementation Order Recommendation

For maximum ADHD-friendliness improvement with minimum effort:

1. **P0.5** (Thought Catcher always visible) — 2 lines of CSS change
2. **P0.4** (Delay unbound badge) — 3 lines of JS change
3. **P0.1** (Begin Your Day CTA) — Small HTML + JS addition
4. **P0.3** (Reduce action buttons) — Medium refactor of buildTaskEl
5. **P0.2** (Louder begin button) — CSS animation addition
6. **P1.1** (Escape hatch) — Small JS + CSS
7. **P1.6** (Focus panel shows all oaths) — Remove one filter condition
8. **P2.3** (Self-care retheming) — CSS color swaps
9. **P2.6** (Timer emoji fix) — String replacement
10. **P1.2** (Progress ring) — New component, moderate effort

This ordering front-loads changes that are tiny in code but large in ADHD impact.

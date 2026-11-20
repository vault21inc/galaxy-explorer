# Later: a usability pass for phones and narrow windows

**Status:** L3-T1 to L3-T5 done (2026-11-19) and live in v0.12.0. **L3-T8 and L3-T9 done** (2026-11-19) and live in v0.13.0 (2026-11-20), but for the owner's checks. Both were added after the owner tried v0.12.0 on the iPhone: a tap on an object covered half the map with its details ("Decided after v0.12.0" below). Also left: the owner's checks on an iPhone (L3-T2, L3-T3, L3-T5), the phone performance measurements (L3-T6, the owner's), and the optional L3-T7; L3-T8 and L3-T9 wait for none of them. Written 2026-11-19 after the owner tried the live site on an iPhone; the owner settled its open questions the same day ("Decided" below). The task IDs (`L3-T1` and so on) are provisional: renumber them if this joins a milestone. Do the tasks in order: each one stands on the ones before it and leaves `main` working.

**Goal:** a reader on a phone can do everything a reader on a laptop can: find their way around, search, open and read an object, change what's shown, and record a clip. Nothing is off screen or too small to tap, at any window width from 320 px up. Editing stays with a mouse or trackpad, and the app says so only to the people it affects.

**Depends on:** M8-T10 (done), whose tours point at controls this moves, and D-55/D-56 (done) for L3-T5. It touches no data, no API route and no renderer; L3-T9 alone changes how the camera projects, so it is a rendering task with numbers to report.
**Read first:** [ux.md §1](../ux.md#1-layout) (layout), [§3](../ux.md#3-input-bindings) (the touch column), [§7](../ux.md#7-labels), [§10](../ux.md#10-accessibility), [§12](../ux.md#12-help-and-tours), [§14](../ux.md#14-capture-mode); [rendering.md §2](../rendering.md#2-performance-budget), [§11](../rendering.md#11-labels), [§13](../rendering.md#13-resource-lifecycle-and-quality-settings); `apps/web/src/app/top-bar.tsx`, `apps/web/src/panels/info-panel.tsx`, `apps/web/src/state/side-panel.ts`.

## Why

The app was laid out for a wide laptop window. The plan said little more about small screens than that the info panel becomes a bottom sheet under 768 px (ux.md §1) and that touch devices get view mode (§3). As built:

- **The top bar runs off the screen.** `top-bar.tsx` is one row with no breakpoint: the name, two switchers, the breadcrumbs, then up to nine controls. On a phone everything after the map switcher is out of reach, "Sign in" included. The breadcrumbs, the planned way back up a view on touch (§3), are cut off too.
- **It's not only phones** (see "Measured"). The bar needs about 1,350 px to look right for a signed-in editor, so it's cramped or cut off on every tablet and in any laptop window narrower than that.
- **The label mode can only be changed with the L key.** A phone has no L, no Space and no hover.
- **Panels have fixed widths.** The outliner is 256 px, the Events popover 384 px (wider than a phone), and the home, sign-in and account pages are fixed 320 to 384 px panels.
- **Controls are 32 px high** (`size="sm"`), and objects are picked within 10 px (`PICK_MIN_RADIUS_PX`): both small under a finger.
- **Nothing allows for the notch, the home bar or the browser's own bars:** no `viewport-fit`, no safe-area insets, no dynamic viewport height.
- **Double-tap to enter relies on the browser's `dblclick`,** which touch browsers don't all send (see "Measured").
- **Edit is offered where it can't work.** `EditToggle` shows to anyone who may edit, with no check for a pointer that can do it.
- **Capture mode is all keys** (A, B, P, R, `,` and `.`), and saves its clip as a download, which on an iPhone lands in Files, not Photos.
- **The tests never see a phone.** Playwright has a Desktop Chrome and a Desktop Safari project, both 1280 px wide.

What already works: the touch bindings (one finger rotates, two pan, pinch zooms, tap selects), the info panel's bottom sheet, dialogs (which keep 16 px margins), and the command palette's width.

## Measured (2026-11-19)

**The top bar's width,** on the live site in a system view (the Solar System), headless Chrome:

| Who | Looks right from | Squeezed but on screen from | Below that |
|---|---|---|---|
| Signed-out reader | 1,246 px | 1,094 px (the name and the breadcrumbs wrap onto two lines) | the right-hand controls leave the screen |
| Signed-in editor (Edit, and a username for "Sign in": 108 px more, from the owner's screenshot) | about 1,354 px | about 1,202 px | the same |

An orbit view adds a third breadcrumb, and a longer universe or map name adds its length.

**Screens** (CSS pixels, the makers' published sizes): phones upright are 320 to 440 wide; on their side 568 to 956 wide and 320 to 440 high. An iPad mini upright is 744 wide; other iPads upright 768 to 1,032; iPads on their side 1,024 to 1,376 wide and 744 or more high.

**What Playwright's phone emulation gives** (`devices['Pixel 7']` in Chromium, `devices['iPhone 14']` in WebKit):

- `(any-pointer: fine)` is false and `(pointer: coarse)` true in both, and true/false on the desktop devices. So tests can use the real media queries; no override is needed for them.
- Two quick taps send `dblclick` in Chromium and **not in WebKit**. Real iOS wasn't tried; L3-T3 stops depending on it either way.

## Decided (the owner, 2026-11-19)

1. **The top bar on a phone is a slim bar and a More sheet** (option C below), not a slide-out for everything or a bottom tab bar.
2. **Three widths, not one breakpoint** (delegated to the plan, from the measurements): **slim** under 768 px, **compact** from 768 to 1,279 px, **full** from 1,280 px. 768 keeps the info panel's existing breakpoint, so only phones and an upright iPad mini get the phone layout; the compact bar is for tablets and smaller windows, where the full bar doesn't fit.
3. **Editing is offered wherever there's a mouse or trackpad,** on any size of screen, and not otherwise.
4. **Phones start at Medium quality,** as every device does. The quality guard steps down on its own.
5. **The label mode on a first visit stays the deployment's default** on every device. The new Labels control is how a phone changes it.
6. **Capture mode works on phones,** with buttons for its keys (L3-T5).
7. **Phones on their side** (delegated): a window under 500 px high is **short**. It gets the slim bar whatever its width, and its sheets and info panel come from the right, not the bottom.
8. **The note** (delegated): "Editing needs a mouse or trackpad." No link.
9. **No native apps.** The app stays in the browser; "Add to Home Screen" is the optional last task.

Recorded as D-57 in `decisions.md`.

### Decided after v0.12.0 (2026-11-19)

The owner tapped Jupiter on the iPhone: the details sheet rose to half the screen and covered the lower half of the planet. Asked for options, the owner chose the first two of four ("Other approaches considered" has the rest).

10. **A tap shows a card first** (the owner). A strip with the object's name, what it is and one line of its summary. Pulling it up, or tapping it, opens the details at half the screen; once more, the full height.
11. **The view centres in the space an opened details sheet leaves** (the owner). The picture slides; the camera doesn't move.
12. **The plan's picks, for the owner to overrule** (asked, not answered):
    - **A tap never moves the picture.** The card is small enough to need no shift. The shift comes only when the reader opens the details.
    - **No zoom-out with the shift.** Worked out from the owner's screenshot (Jupiter's orbit view on a 430 px wide iPhone, in Brave): the planet is about 265 px across, and the space between the slim bar and a half-height sheet would be about 285 px high, so it fits. A body the reader has zoomed in on is cropped, as it would be by any panel.
    - **The sheet keeps its height from one object to the next** while something stays selected, and goes back to the card once the details are closed.
    - **Choosing by name opens the details at half:** a search result, a row in the List or in Events. The reader asked for that thing, not for the map around it.

Recorded as D-58 in `decisions.md`. It reverses "No two heights" under "The info panel and the outliner on slim".

## The layout

### Tiers

| Tier | When | Top bar | Panels |
|---|---|---|---|
| **slim** | width < 768 px, or height < 500 px (short) | the mark, the location chip, Search, More | sheets |
| **compact** | 768 to 1,279 px wide, and not short | today's bar with the name reduced to its mark and the right-hand buttons to their icons | as today |
| **full** | 1,280 px and wider, and not short | today's bar | as today |

- **One definition.** `apps/web/src/lib/layout-tier.ts` holds the media queries as strings (slim is `not all and (min-width: 768px) and (min-height: 500px)`: a comma list reads the same in a browser, but Tailwind's `@custom-variant` splits a comma into two selectors) and exports `useLayoutTier()` (`'slim' | 'compact' | 'full'`) and `useShort()`, both from `matchMedia` with change listeners, so a rotation or a resized window is followed. `index.css` declares the same queries as Tailwind custom variants (`slim:`, `compact:`, `full:`, `short:`), and a unit test reads `index.css` and fails if the two disagree (CSS can't import the constants). The test imports it with `?raw`, which Vitest empties unless `test.css.include` names the file (`vite.config.js`).
- **CSS where the markup is the same, the hook where it isn't.** Compact against full is the same controls with or without their text: variants only, no hook. Slim is different markup (the chip and More replace the switchers, breadcrumbs and buttons), so `TopBar` renders one or the other from the hook. Rendering both and hiding one would put every `data-tour` mark and every focusable control on the page twice.
- **Compact and full never wrap or overflow.** The name is "◈ Galaxy Explorer" on full and "◈" on compact (the link keeps its `aria-label`). Switcher names and breadcrumbs truncate (the full name is in each one's tooltip); the breadcrumbs before the current one shrink first, down to four characters, and the current one never shrinks but stops at 24 characters (as built: a minimum of 12 would have padded short names with blank space). Icon-only buttons keep their names as `aria-label` and `title`.
- **Under a finger:** a `coarse` custom variant (`@media (pointer: coarse)`) makes the compact bar's buttons 40 px (`icon-lg`). In the slim bar and in sheets, every control is at least 44 px high.

### The slim bar

One row, left to right, each 44 px high:

```
┌────────────────────────────────────────────┐
│ [◈] [ Solar System              ▾ ] [⌕] [≡] │
└────────────────────────────────────────────┘
```

- **◈** goes home (`aria-label="Galaxy Explorer, home"`).
- **The location chip** (`data-tour="location"`) takes the remaining width and shows the current view's name, truncated: the subject's name in a system or orbit view, the map's name in the galaxy view, the universe's name where there's no map. Outside a universe (home, account, admin) it isn't shown.
- **Search** (`data-tour="search"`) opens the command palette.
- **More** (`data-tour="more"`) opens the More sheet.

**The location sheet,** top to bottom:

1. "You are here": the breadcrumbs as a list, the galaxy first and the current view last and marked. Tapping one goes there (as the breadcrumb does) and closes the sheet.
2. "Map": the current map; tapping it lists the universe's maps in the same sheet. An editor who can use it also gets "Clone map as…" (it's a dialog with two fields, and works by touch).
3. "Universe": the same for universes, then "Universe settings" and "All universes", as the switcher's footer has now.

**The More sheet,** top to bottom. Each row is 44 px, with its icon and name; "opens" means that panel replaces the More sheet's contents, with a back arrow to More.

| Row | Does | Shown | Added in |
|---|---|---|---|
| List (`data-tour="list"`) | opens the outliner | on a map | L3-T2 |
| Events (`data-tour="events"`) | opens the events list | on a map | L3-T2 |
| Layers (`data-tour="layers"`), renamed "Layers and labels" by L3-T3 | opens the layers | on a map | L3-T2 |
| Spoilers (`data-tour="spoilers"`) | a switch in the row, with "Shown" or "Hidden" | always | L3-T2 |
| Display | opens the quality popover's contents | always | L3-T2 |
| Record a clip | lists the three shapes, then enters capture mode | on a map | L3-T5 |
| Help and tours (`data-tour="help"`) | opens the Help menu's items | always | L3-T2 |
| The username, or "Sign in" | opens the account menu's items, or goes to sign-in | always | L3-T2 |
| "Editing needs a mouse or trackpad." | nothing: muted text, not a button | a reader who may edit, where editing isn't offered | L3-T4 |

### Sheets

`apps/web/src/components/ui/sheet.tsx`, built on the Radix dialog the app already has (no new dependency), so focus is trapped and returned, and Esc closes it.

- **From the bottom** when the window isn't short: as wide as the window, at most 85 % of its height (dynamic viewport units), rounded top corners, a grab bar, a title and a close button, padded by `env(safe-area-inset-bottom)`. Its contents scroll inside it.
- **From the right** when short: 360 px wide (at most 60 % of the width), the full height, padded by the right and top safe areas.
- **One at a time.** `apps/web/src/state/sheet.ts`: `useSheet`, with `open: SheetId | null` (`'location' | 'more' | 'list' | 'events' | 'layers' | 'display' | 'help' | 'account' | 'capture'`), `show(id)` and `close()`. Showing one replaces another. `useSidePanel.listOpen` stays the desktop List button's state; on slim, List is `useSheet`'s `'list'`.
- **The same contents as today.** `EventsPopover`, `LayersPopover`, `QualityPopover`, `HelpMenu`, `AccountMenu` and the outliner each split into a body component and a frame. The body is used by both the popover (compact, full) and the sheet (slim). Nothing is written twice.
- **Dragging the grab bar down closes a bottom sheet.** No other gesture: a sheet is open or closed.
- **Not modal** (as built): a modal Radix dialog makes the rest of the page inert, so a tour's step over an open sheet couldn't be used. Sheets are non-modal, as the popovers are: focus moves in and back, Esc and a tap outside close them, but focus isn't trapped. A tap on the top bar is left to its controls, which open their own sheet in place of the open one or close it: on touch, Radix dismisses after the tap's click, which would close the sheet the tap had just opened.
- **Editing in a narrow window** (as built): the edit toggle moves into the More sheet as an "Edit" switch. Whether it's offered is `EditAvailability`, mounted on a map at every width, apart from the toggle.

### The info panel and the outliner on slim

- **The info panel** keeps its bottom sheet (`max-h-[50vh]` becomes `50dvh`, plus the bottom safe area). It is hidden while a sheet from `useSheet` is open and returns when that closes: the map is never under two things. When short, it docks to the right as it does from 768 px (`short:` variants beside the `md:` ones), 360 px wide at most.
- **No two heights** (as built in L3-T2; reversed by D-58, see "The details sheet's three stops"). An earlier draft gave the info sheet a peek and a full height. Left out then: its contents already fold (the description's **More**), and half the screen seemed enough. On the phone it wasn't: half the screen is half the map.
- **The outliner** is the `'list'` sheet. Choosing an item selects it and closes the sheet, so the info panel shows what was chosen. The floating List button isn't shown on slim.
- **Toasts** move under the top bar on slim (as built: above the info panel's edge, which moves, they'd jump), across the screen, inside the safe areas.

### Who is offered editing

- `apps/web/src/lib/pointer-kind.ts` exports `useHasFinePointer()`: true when `(any-pointer: fine)` matches, **or** once any pointer event with `pointerType === 'mouse'` has been seen in this page's life (a mouse plugged into a phone, or a browser whose media query is wrong). It never goes back to false.
- Editing is offered when `useCanEdit()` and `useHasFinePointer()` are both true. `EditToggle` sets `useEditor`'s `available` from both, so everything already gated on `available` follows without its own check: the E key, the shortcut help's Edit section, the editor's tour and its offer. If it turns false while editing, edit mode is left.
- Tier doesn't come into it: a narrow window on a laptop edits (the edit toolbar and the left panels were never meant for 400 px, and that's accepted), and a 13-inch tablet with no trackpad doesn't.
- `useCanEdit()` stays the permission, and still decides the things that aren't 3D editing: universe settings, sharing, "Clone map as…".

### The details sheet's three stops (L3-T8)

On slim, upright, the info panel rests at one of three heights, called stops:

| Stop | Height | Shows |
|---|---|---|
| `card` | its contents: about 88 px, plus the bottom safe area | the handle; the name on one line; what it is (the kind line); one line of the summary; Expand and Close |
| `half` | `50dvh`, as built | the handle and buttons, then the details as today, scrolling inside |
| `full` | from under the slim bar to the bottom (`UNDER_BAR` in `app/panel-classes.ts`) | the same, with room to read |

- **Which stop.** A tap on the map that selects from nothing gives `card`. A selection that changes while the panel shows keeps the stop. Clearing the selection resets it to `card`. Choosing by name (the command palette's result, a row in the List sheet or the Events sheet) raises it to at least `half`. In edit mode a selection opens at `half`, and entering edit mode raises it there: the panel is the form. (As built: the editor can still collapse it by hand.)
- **Moving between stops.** The whole strip above the contents is the handle: dragging it moves the sheet with the finger, and letting go snaps to the nearest stop, or one stop on in the direction of a flick. Pulling the card down by `CLOSE_PULL_PX` (80, shared with `components/ui/sheet.tsx`) clears the selection. A tap on the card, anywhere but its buttons, opens `half`.
- **Buttons, for those who can't drag** (WCAG 2.5.7): "Expand details" (an up arrow: `card` to `half`, `half` to `full`) and "Collapse details" (a down arrow: `full` to `half`, `half` to `card`). `half` shows both. On a bottom sheet up means bigger; today's arrow points the other way because it was drawn for the side panel.
- **Only the strip drags.** The contents scroll inside the sheet (`overscroll-behavior: contain`), and scrolling them never changes the stop.
- **Short windows, and the wider tiers,** keep the side panel with its two states. Its collapsed strip gains the same name and kind line (today it shows two buttons and nothing else). When short it opens collapsed on a tap, as the card does; from 768 px wide and 500 px high it opens expanded, as today.
- It still steps aside while a `useSheet` sheet is open, and comes back at the stop it had.

### The view shift (L3-T9)

With the details opened, the map's centre moves to the middle of what's left uncovered. As map libraries do it with "padding" (Mapbox's `easeTo({ padding })`, Google Maps' `setPadding`): the camera's position and target don't change, only where the centre of its picture falls on the screen.

- **How.** three.js's `PerspectiveCamera.setViewOffset(fullWidth, fullHeight, x, y, width, height)` renders a window of a larger picture. With the window the size of the whole picture and moved by `(x, y)`, the picture slides by `(-x, -y)` and nothing is scaled: a lens shift. It changes only `camera.projectionMatrix`.
- **How far.** The info panel reports what is covered, in CSS pixels, to a small store: `topPx` (the slim bar's bottom edge), `bottomPx` (the sheet's height, at most `half`'s: `full` shifts no further) and `rightPx` (the side panel's width and margin, when short). All zero at `card`, when collapsed, and on the compact and full tiers. The picture moves up by `max(0, (bottomPx - topPx) / 2)` and left by `rightPx / 2`.
- **What follows by itself:** everything that projects with the camera's matrix. Picking (`render/picking/picking.ts`), labels (`labels/label-driver.tsx`), tour anchors, the zoom gate's ring, the globe's hit test, the editor's work plane and every shader use `projectionMatrix`, `.project()` or `.unproject()`. `render/screen-scale.ts` reads only the field of view and the height, and the scale doesn't change.
- **What doesn't:**
  - **camera-controls' zoom to the cursor** (`dollyToCursor` in `render/stage.tsx`, and a pinch's midpoint) works out where the pointer is from the element's rectangle and assumes the picture's centre is the rectangle's. `controls.setViewport(x, y, width, height)` gives it a moved rectangle (`_getClientRect` in camera-controls 3.1.2 adds it; its `y` runs up from the bottom, as WebGL's does). Set it with the shift and clear it with `setViewport(null)`.
  - **A resize.** R3F sets `camera.aspect` and calls `updateProjectionMatrix()`, which re-applies `camera.view` with the old full size. Re-apply the offset whenever `size` changes.
  - **`flyTo`** (`render/camera/fly-to.ts`) fits a sphere to the whole canvas. Scale the sphere's radius by `min(W, H) / min(W - rightPx, H - topPx - bottomPx)` so it fits what's uncovered.
- **Easing.** The shift eases over `VIEW_SHIFT_MS` (200, in `tuning.ts`, the sheet's own transition time), with `invalidate()` each frame while it eases and none after; it jumps under `prefers-reduced-motion`. While the sheet is dragged nothing shifts: the shift follows the stop it lands on.
- **Never in capture mode,** where the frame is the picture: the offset is zero and cleared before a move plays or records.

### Test hooks

`window.__GE_TEST__.layout()` returns `{ tier, short, finePointer, sheet }`. Specs read it instead of guessing from the viewport. L3-T8 adds `details`: `null` with no panel, else `'card'`, `'half'` or `'full'` (the side panel reports `'card'` when collapsed and `'half'` when open). L3-T9 adds `__GE_TEST__.viewShift()`: `{ xPx, yPx }`, how far the picture is moved now, read from `camera.view`.

## Tasks

### L3-T1 The bar fits every window from 768 px

**Where:** `apps/web/src/lib/layout-tier.ts`, `apps/web/src/index.css`, `apps/web/src/app/` (`top-bar.tsx`, `breadcrumbs.tsx`, `switcher.tsx`, and each button in the right-hand group), `apps/web/src/render/test-hooks.ts`, `apps/web/playwright.config.js`, `apps/web/e2e/`.

- The tier definitions, hooks, custom variants and the unit test that keeps them in step.
- The compact bar and the truncation rules above. The slim tier renders the compact bar for now: L3-T2 replaces it.
- `layout()` in the test hooks (`sheet` is always null until L3-T2).
- A helper in `e2e/` that asserts every visible control inside `<header>` has its box wholly inside the viewport, and that the page's scroll width equals its client width.
- The D-entry for "Decided" above; ux.md §1 gains the three tiers.

**Done when:**
- [x] Unit test: `index.css`'s variants and `layout-tier.ts`'s queries are the same.
- [x] E2E (the existing desktop projects, with `page.setViewportSize`): as a signed-in editor in an orbit view, the helper passes at 768, 1,024, 1,279, 1,280 and 1,440 px wide. (As built, `e2e/top-bar.spec.ts` makes its own universe with long names on the API with accounts, which is wider than the demo's.)
- [x] E2E: at 1,024 px the bar's buttons have no visible text but keep their accessible names; at 1,280 px they have text.
- [x] The existing e2e suites pass with no change to their selectors (they run at 1,280 px, the full tier).

### L3-T2 The slim bar and its sheets

**Where:** `apps/web/src/components/ui/sheet.tsx`, `apps/web/src/state/sheet.ts`, `apps/web/src/app/` (`top-bar.tsx`, new `slim-bar.tsx`, `location-chip.tsx`, `location-sheet.tsx`, `more-sheet.tsx`), the popovers and menus named under "Sheets", `apps/web/src/panels/outliner/`, `apps/web/src/panels/info-panel.tsx`, `apps/web/index.html`, `apps/web/src/help/` (`tour-types.ts`, `use-target.ts`), `apps/web/playwright.config.js`.

- `viewport-fit=cover` in `index.html`; safe-area padding on the bars, sheets, info panel and toasts; `dvh` where `vh` is used for a panel's height.
- The Sheet, `useSheet`, the slim bar, the location sheet, and the More sheet with the rows marked L3-T2 in its table.
- The body/frame split of the five popovers and menus and the outliner.
- The info panel and toasts on slim, and the short variants, as above.
- **Two Playwright projects:** `phone-chromium` (`devices['Pixel 7']`) and `phone-webkit` (`devices['iPhone 14']`), which run only specs named `*.phone.spec.ts`; the desktop projects ignore those. CI runs `phone-chromium`, as it runs `chromium`. Update the e2e row of AGENTS.md's command table.
- **Tours point at what's on screen.** A tour's control is found by its `data-tour` mark (`use-target.ts`), and on slim most marks are inside a closed sheet. Add `'more'` and `'location'` to `TOUR_CONTROLS`, and a table in `tour-types.ts`, `SLIM_FALLBACK`: `list`, `layers`, `events`, `spoilers` and `help` fall back to `more`; `breadcrumbs` and `universe-switcher` to `location`. `controlBox()` uses the fallback when the named control isn't on the page, so a step points at More until the reader opens it, then at the row. The steps' completions (`list-opened` and the rest) don't change. The tour's popover keeps clear of the safe areas and of an open sheet (above a bottom sheet, left of a right-hand one).

**Done when:**
- [x] E2E (phone projects): on a map, L3-T1's helper passes at the device's size and at 320 px wide; `layout().tier` is `'slim'`.
- [x] E2E: the chip names the current view at each of the three levels; the location sheet goes back up a view, and switches universe (and map, by the same control).
- [x] E2E: Search, List, Events, Layers, the spoiler switch, Display, Help and "Sign in" each work from the slim bar or the More sheet.
- [x] E2E: showing a second sheet replaces the first (`layout().sheet`); the info panel is hidden while one is open and back when it closes; choosing an outliner item closes the sheet and selects the item.
- [x] E2E: at 844 × 390 (a phone on its side) the tier is slim, and a sheet and the info panel are on the right.
- [x] E2E: the reader's tour runs from first step to last on a phone project.
- [x] The unit test that holds every tour step to the lists passes with the new controls.
- [ ] **Owner's check,** on the iPhone, with the build deployed or on the local network: nothing sits under the notch, the home bar or Safari's bar, upright and on its side. Reported in the commit message, or in a follow-up commit if it's made after release.

### L3-T3 Touch on the canvas, and labels

**Where:** `apps/web/src/input/` (`use-pointer-selection.ts`, `bindings.ts`), `apps/web/src/render/tuning.ts`, `apps/web/src/render/labels/`, `apps/web/src/panels/layers/`, `apps/web/src/panels/shortcut-help/`, `apps/web/src/help/` (`tour-types.ts`, `tours.ts`).

- **Double-tap is ours.** Two touch taps on the same object within `DOUBLE_TAP_MS` (300) and `DOUBLE_TAP_SLOP_PX` (24), in `tuning.ts` beside `CLICK_MAX_MOVE_PX`, enter it. The first tap selects at once, as a click does: nothing waits for a second tap. The native `dblclick` listener ignores a double-click whose last `pointerdown` was a touch, so browsers that do send one don't enter twice. The rule is a pure function, unit-tested.
- **The canvas owns its gestures.** At run time the canvas's computed `touch-action` must be `none` (camera-controls may already set it on the element it's given: check, and set it in CSS if not), and `overscroll-behavior: none` on the page stops pull-to-refresh and the rubber band. (As built: camera-controls listens on R3F's event element, not the canvas, so `index.css` sets it on the canvas.)
- **A wider reach under a finger.** `PICK_MIN_RADIUS_TOUCH_PX` (22, half a 44 px target) and a touch value for `LABEL_HIT_PADDING_PX`, used when the event's `pointerType` is `'touch'`. The nearest object within reach still wins, so close neighbours stay tellable apart.
- **A Labels control** at the top of the Layers panel, on every tier: Hover, Groups, All, bound to `useLabels` (add a `setMode`; `cycle` stays for the L key). On a device with no hover, "Hover" is worded "Selected only". The More row becomes "Layers and labels". The first-visit mode is unchanged (decision 5).
- **Fewer labels on slim.** `LABEL_MARGIN_SLIM_PX` (start at 6) pads every placed label's rectangle in `solveLabels()` on the slim tier, so neighbours are dropped sooner. Font sizes don't change.
- **The shortcut help** leads with a Touch section when there's no fine pointer: the touch column of ux.md §3, from the same bindings table as the other sections. (As built: the sections are Touch, Keyboard, Mouse and trackpad, Capture mode; nothing is folded, since the dialog scrolls.)
- **The reader's tour speaks of the device in hand.** `TourStep` gains an optional `touchText`, used when there's no fine pointer. Every reader step that names the mouse or a key gets one ("Drag with two fingers to slide it", "Double-tap this system", "Tap Search", "Open More, then Help, for every gesture"). A unit test fails for a reader step whose `text` mentions a key or the mouse and has no `touchText`.
- Docs: ux.md §3 (the touch column as built), §7 (the Labels control), rendering.md §10 and §11 (the touch reach, the slim margin).

**Done when:**
- [x] Unit tests: the double-tap rule (inside and outside the time and the distance, and two different objects); `solveLabels()` places fewer labels with the margin than without, none nearer than the margin (on a random crowd of 2,000, standing in for the stress map).
- [x] E2E (phone projects, WebKit included): a tap selects; two taps on a system enter it; the location sheet leads back out.
- [x] E2E: the Labels control changes `__GE_TEST__.visibleLabels()` between its three modes, on a phone project and on desktop, and the choice survives a reload.
- [x] E2E: a tap 18 px from a small body's center, outside what's drawn, selects it by touch; the same point clicked with a mouse selects nothing.
- [x] E2E: the canvas's computed `touch-action` is `none`.
- [ ] `pnpm perf` still meets the galaxy budget (the label margin doesn't apply at its width, and the solver's time must not rise). Numbers in the commit message.
- [ ] **Owner's check,** on the iPhone: one finger rotates, two pan, pinch zooms, double-tap enters, and the page never scrolls, zooms or reloads under the map.

### L3-T4 Pages that fit, and editing only where it works

**Where:** `apps/web/src/lib/pointer-kind.ts`, `apps/web/src/app/edit-toggle.tsx`, `apps/web/src/app/more-sheet.tsx`, `apps/web/src/pages/` (`home-page.tsx`, `login-page.tsx`, `account-page.tsx`, `account-link-page.tsx`, `universe-settings-page.tsx`, `admin/`).

- `useHasFinePointer()` and the rule under "Who is offered editing". The More sheet's note.
- The fixed-width pages become `w-full max-w-…` with 16 px side margins on slim. Tables on the settings and admin pages scroll sideways inside their own box, never the page.
- **Form text is at least 16 px on a touch screen** (as built): one unlayered rule in `index.css` for every `input`, `select` and `textarea` under `(pointer: coarse)`, rather than checking fields one by one: several style themselves `text-sm` (the palette, the outliner's and the events' filters). The rich-text editor is only offered in edit mode, which needs a mouse.
- **Tests tap, not click** (as built): Playwright's `click()` sends mouse pointer events even on an emulated phone, which the app rightly takes as a mouse plugged in. The editing spec uses `tap()`.
- Docs: ux.md §2 (where editing is offered), §13 (the pages on a phone).

**Done when:**
- [x] E2E (phone projects): an editor sees no edit toggle and no Edit row, pressing E does nothing, and the More sheet shows the note. A viewer of the same universe (signed out, as it's public) sees no note.
- [x] E2E (phone project): after a mouse pointer event on the page, `layout().finePointer` is true and Edit is offered. (A `PointerEvent` with that `pointerType` dispatched from the page.)
- [x] E2E (desktop, viewport 600 px wide): an editor still gets the edit toggle, in the More sheet.
- [x] E2E (phone projects): home, sign-in, the account page, universe settings and the admin screens don't scroll sideways, and their panels lie inside the window. (Signing in itself is the account specs'; this signs in through the API.)

### L3-T5 Capture mode by touch

**Where:** `apps/web/src/app/` (new `capture-controls.tsx`, `capture-card.tsx`, `more-sheet.tsx`), `apps/web/src/pages/` (`use-capture-mode.ts`, `record-shot.ts`).

- **Record a clip** in the More sheet lists the three shapes (the palette's commands, which stay) and enters capture mode.
- **Buttons for the keys.** Capture's actions are already a table (`CaptureKeyAction`, run by `runCaptureKey` in `use-capture-mode.ts`). Export the runner, and `capture-controls.tsx` renders one button per action from the table and `CAPTURE_ACTION_DESCRIPTIONS`: Start here, End here, shorter, longer, Play, Record, Leave. No second list of actions.
- **Where they sit:** shown when there's no fine pointer, or on the slim tier. (As built: the keys' card isn't shown then; on a phone its bars are too narrow for it anyway.) A strip along the bottom of the window, over the frame's lower edge, inside the safe area, with one line of the card's text above it (the shot, and what just happened). The card beside the frame stays for wide windows.
- **They can't get into the clip.** A recording is drawn from the WebGL canvas and the painted labels (rendering.md §16), never from the page, so nothing over the frame is recorded. The strip still hides while a move plays or records, so the owner sees the shot and a screen recorder gets a clean frame; a tap during play stops it (a drag already does), and Stop shows alone while recording.
- **Save to where the phone keeps video.** A download on iOS goes to Files; Instagram reads Photos. When `navigator.canShare({ files: [file] })` is true, the finished clip shows **Save or share**, which calls `navigator.share` with the file: the share sheet has "Save Video". It needs a tap of its own (a browser only allows sharing from a user's gesture, and the recording took seconds), so it's a button, not automatic. Elsewhere the download stays.
- The frame needs no change: `captureFrame()` already fits the shape to any window, and recording sets the drawing buffer to 1,080 px wide whatever the screen.
- Docs: ux.md §14, rendering.md §16.

**Done when:**
- [x] E2E (phone projects): from More, enter 9:16; Start here and End here write `cam` and `to` into the address; Play moves the camera and ends; Leave restores the slim bar. (Also: a tap on the frame stops a move.)
- [x] E2E: Record produces an MP4 of the expected size, checked as `e2e/capture.spec.ts` checks it; where sharing isn't available the download happens. (And with sharing stubbed in, the clip goes to `navigator.share` from the button's tap, with no download.)
- [x] Idle stays at 0 frames in capture mode with the strip showing.
- [ ] **Owner's check,** on the iPhone: a 10 s 9:16 clip records, saves to Photos through the share sheet, is 1,080 × 1,920, and uploads to Instagram. If Safari on iOS has no H.264 encoder the card says so already: report which, and the recording time.

### L3-T6 Performance on a phone (the owner's measurements)

**Where:** `docs/perf/`, `docs/plan/rendering.md` §2.

Most of this is by hand, on a real phone: an agent prepares the page and writes up the numbers the owner reads off.

- Record the reference phone in `docs/perf/README.md` (the owner's iPhone, its model and iOS version).
- With the HUD (`?perf=1`) on production, at Medium: the stress map's galaxy view, a busy system and an orbit view. Note draw calls and median and p95 frame times while rotating and zooming, and whether the quality guard stepped down.
- Write a phone column into rendering.md §2 from what's measured. `pnpm perf` stays a desktop run.

**Done when:**
- [ ] `docs/perf/<date>-phone.md` has the numbers for the three views.
- [ ] rendering.md §2 has a phone budget that those numbers meet, or a note of what missed and what the guard did about it.
- [ ] Idle is 0 frames rendered on the phone.

### L3-T7 Add to Home Screen (optional)

**Where:** `apps/web/public/` (the manifest and icons), `apps/web/index.html`.

- `manifest.webmanifest`: the name, theme and background colors, `display: standalone`, and icons (192, 512, a maskable one, and Apple's touch icon). The CSP already has `manifest-src 'self'`.
- **No service worker.** No offline use, and no cache that could serve an old build after a release.
- A standalone window has no Back button and no address bar, so this comes after L3-T2: the location sheet must be a complete way around.

**Done when:**
- [ ] The e2e CSP guard still passes, and the manifest is served with the right type.
- [ ] **Owner's check:** installed on the iPhone, the app opens full screen inside the safe areas, a share link and a camera link (D-52) open in it correctly, and every view can be reached and left.

### L3-T8 A card first: the details sheet's three stops

**Read first:** "Decided after v0.12.0" and "The details sheet's three stops" above; `apps/web/src/panels/info-panel.tsx`, `apps/web/src/components/ui/sheet.tsx` (its `GrabBar`), `apps/web/src/panels/sections/header-section.tsx` and `kind-line.tsx`.
**Where:** `apps/web/src/panels/` (`info-panel.tsx`, new `details-card.tsx` and `details-strip.tsx`), new `apps/web/src/state/details-sheet.ts`, new `apps/web/src/components/ui/sheet-drag.ts`, `apps/web/src/components/ui/sheet.tsx`, the three places that choose by name (`apps/web/src/palette/`, `panels/outliner/outliner-slot.tsx`'s `useCloseOnChoice`, the Events list's `onChose`), `apps/web/src/render/test-hooks.ts`, `apps/web/src/help/` (`tours.ts`, `tour-popover.tsx`), `apps/web/e2e/`.

No rendering code changes in this task.

- **The store.** `useDetailsSheet` (zustand, not persisted): `stop`, `setStop(stop)`, `raise(atLeast)`. `info-panel.tsx`'s local `collapsed` state goes: on the side panel, collapsed is `card` and open is `half`. The rules for which stop are the list above; put them in the store and the panel, not at each call site, except `raise('half')` in the three places that choose by name. (As built: the store follows `useSelection` itself. A choice by name often selects only after a transition between views, which clears the selection first, so `raise` leaves a wish that the next selection within 5 s takes up. The palette's call is in `state/show-entity.ts`, which "On other maps" uses too.)
- **The snap rule** is a pure function in `sheet-drag.ts`: given the stops' heights, the sheet's height at release and the release speed, it returns a stop or "close". `FLICK_PX_PER_MS` (0.5) beside `CLOSE_PULL_PX`, which moves here from `sheet.tsx`. `GrabBar` and the new strip share the pointer handling (capture on press, a transform while dragging, no React state per move). (As built: they share the constants and the rule; the strip's handling is its own hook, `panels/use-details-drag.ts`, since it changes the sheet's height in both directions where `GrabBar` only slides its sheet down. It captures the pointer on press: a mouse isn't held by what it pressed as a finger is, and a quick drag left the strip before moving 6 px.)
- **The strip** (`details-strip.tsx`): the handle bar (not shown on the side panel), then the Expand, Collapse and Close buttons, with today's accessible names. On slim upright the whole strip is the drag area and is `touch-none`.
- **The card** (`details-card.tsx`), shown at `card` and in the side panel's collapsed strip:
  - The name at once, from the view's own row with `labelText(object, policy)`, which already blacks out a hidden name. For several selected, "N selected".
  - The kind line and one line of the summary once `useEntity` has the entry: the same query `EntityPanel` makes, so it's fetched once. Render the summary with `RichTextView` and the summary's spoiler key, clamped to one line, so the spoiler rules are the same code as the panel's. A hidden entry shows no summary.
  - A tap on it opens `half`. It's a button with the name as its accessible name.
- **The stops' heights** are classes on the `<aside>`; moving between them animates over 200 ms (one constant, which L3-T9's `VIEW_SHIFT_MS` reuses) and not at all under `prefers-reduced-motion`. (As built: `SHEET_MOVE_MS` in `sheet-drag.ts`. The card is as tall as its text and `half` is at most `50dvh`, heights CSS can't ease between, so the panel measures the height before and after and animates them with the Web Animations API.) At `half` and `full` the contents are as built, `HeaderSection` included.
- **The tour.** The reader's `select` step has a `touchText` that says the panel opens ("Tap a system to select it. Its panel opens with what’s known about it."). Reword it: a tap shows its card, and pulling the card up shows the rest. `tour-popover.tsx`'s `roomBesideSheet` counts the details sheet at its current stop. (As built, also: the first-visit offer, "New here?", sat at the bottom left, over the card whenever a link opened with something selected, as the home universe's does. On slim it's under the top bar now, as toasts are.)
- **Existing phone specs** that tap an object and then read its details (`touch.phone.spec.ts`, `slim-bar.phone.spec.ts`) expand the card first.
- Docs: ux.md §1 (the three stops, replacing "a bottom sheet"), §3 (the touch column: a tap selects and shows the card); the plan's status.

**Done when:**
- [x] Unit test: the snap rule (the nearest stop; a flick up and down from each stop; a pull down from the card closes; a slow 10 px drag changes nothing).
- [x] E2E (phone projects): a tap on a body in a system view gives `layout().details === 'card'`; the panel is under 140 px high and shows the body's name; the body's center on screen (`__GE_TEST__.screenPositionOf(id)`) isn't under it.
- [x] E2E: a tap on the card gives `half` with the description showing; "Expand details" gives `full`, whose top edge is within 8 px of the slim bar's bottom; "Collapse details" steps back down; Close clears the selection.
- [x] E2E: dragging the strip up from `card` gives `half`; down from `half` gives `card`; down from `card` clears the selection. (As built: dragged with Playwright's mouse, a real pointer that can be captured, which a dispatched event's can't. A finger's drag is the owner's check.)
- [x] E2E: at `half`, a tap on another body keeps `half`; after Close, the next tap gives `card`. A search result, a List row and an Events row each open at `half`.
- [x] E2E: opening More hides the panel, and closing it brings the panel back at the stop it had.
- [x] E2E: with spoilers hidden, a hidden entry's card shows the redaction and no summary.
- [x] E2E (844 × 390): a tap opens the side panel collapsed, with the name on its strip; Expand shows the details on the right.
- [x] E2E (desktop, 1,280 px): a click opens the panel expanded, as before; collapsed, its strip shows the name. The existing desktop suites pass with no change to their selectors.
- [x] E2E: the reader's tour runs first step to last on a phone project.
- [x] Idle is 0 frames with the card showing (`frameCount()` over 500 ms).
- [ ] **Owner's check,** on the iPhone: a tap on Jupiter leaves the planet in view above the card; the card pulls up and down under a thumb without the page moving.

### L3-T9 The view centres above the details

**Depends on:** L3-T8 (the stops decide the shift).
**Read first:** "The view shift" above; [rendering.md §2](../rendering.md#2-performance-budget), [§5](../rendering.md#5-coordinate-frames-and-cameras), [§12](../rendering.md#12-camera-controls), [§14](../rendering.md#14-test-hooks-and-performance-measurement); three.js's [`PerspectiveCamera.setViewOffset`](https://threejs.org/docs/pages/PerspectiveCamera.html); `apps/web/src/render/stage.tsx`, `render/camera/fly-to.ts`, `render/capture/record-move.ts`.
**Where:** new `apps/web/src/state/view-insets.ts`, new `apps/web/src/render/camera/view-shift.ts` (the pure parts) and `view-shift-driver.tsx`, `apps/web/src/render/stage.tsx`, `render/camera/fly-to.ts`, `render/tuning.ts`, `render/test-hooks.ts`, `apps/web/src/panels/info-panel.tsx`, `apps/web/e2e/`.

- **The store** (`view-insets.ts`): a vanilla zustand store like the hover store, `{ topPx, rightPx, bottomPx }`. The info panel sets it in a layout effect from its own and the `<header>`'s rectangles: when the stop changes, when the tier or `short` changes, on a `ResizeObserver` of the panel, and to zeros when it unmounts or steps aside for a sheet. Never from a pointer move. (As built: `panels/use-report-insets.ts`. It measures before the panel's own move between stops begins, and skips a measurement during that move, when the height is only on its way.)
- **The pure parts** (`view-shift.ts`): `shiftFor(insets)` gives `{ xPx, yPx }` by the rule above, and `fitScale(size, insets)` the factor for `flyTo`. Unit-tested.
- **The driver** (`view-shift-driver.tsx`, mounted in `stage.tsx` beside `LabelDriver`): subscribes to the store outside React, eases the applied shift toward the target in `useFrame`, and calls `camera.setViewOffset(...)`, `controls.setViewport(...)` and `invalidate()` only while the two differ. At zero it calls `clearViewOffset()` and `setViewport(null)`. It re-applies on a change of `size`, holds zero while capture mode is on, and allocates nothing per frame. Comment the lens shift in plain words, with the sign of each argument, and link rendering.md §12.
- **`flyTo`** scales its sphere by `fitScale`, so F and a double-tap frame the object in what's uncovered. (As built: it takes the window's size for the canvas's, which fills it.)
- **`viewShift()`** in the test hooks.
- Docs: rendering.md §12 gains "The view shift" (what it is, why the camera's pose and a camera link (D-52) are untouched by it, what follows it and what had to be told); §14 the hook; ux.md §1 a line.

**Done when:**
- [x] Unit tests: `shiftFor` (zero at the card's insets and with no panel; half the difference at `half`; no further at `full`; left by half the side panel when short) and `fitScale` (1 with no insets, and never under 1).
- [x] E2E (phone projects), in an orbit view: at `card`, `viewShift()` is zero. Expanding to `half` puts the planet's center on screen (`screenPositionOf`) within 2 px of the middle of the band between the slim bar's bottom and the panel's top. Collapsing brings it back to the canvas's center. `cameraPose()` is the same before, during and after.
- [x] E2E: with the shift on, a tap where a body is drawn selects that body, and its label's box lies inside the band.
- [x] E2E (`narrow-window.spec.ts`: a mouse at 600 px wide): with the shift on, zooming out with the pointer on the picture's center leaves the camera's target where it was, within a thousandth of the camera's distance. This is the check on `setViewport`; it fails without it (tried: the target moved 3,134 units where 80 were allowed). (As built, not a body under the pointer: camera-controls holds still the point under the pointer at the target's depth, so a body nearer or further drifts by itself. And zooming out, not in: with something selected, zooming in is the app's own move toward it, `zoom-gate.ts`, which goes by direction and is right with or without the shift.)
- [x] E2E (844 × 390): expanding the side panel moves the picture left, by the same band rule.
- [x] E2E: resizing the window with the details at `half` (390 × 844 to 430 × 932) leaves the center in the middle of the new band.
- [x] E2E: F (and a double-tap on a body that opens no view) with the details at `half` frames the body wholly inside the band. (As built: through the `flyTo` hook, the function both call.)
- [x] E2E: entering capture mode with the details at `half` gives `viewShift()` zero, and `capture.phone.spec.ts` passes unchanged.
- [x] After the ease, idle is 0 frames with the details at `half`; the ease itself renders no more than 20 frames.
- [x] `pnpm perf` meets every budget, with draw calls unchanged; median and p95 frame times before and after go in the commit message (the run is at desktop width, where the shift is always zero: say so). ([docs/perf/2026-11-20-L3-T9.md](../../perf/2026-11-20-L3-T9.md).)
- [ ] **Owner's check,** on the iPhone: pulling Jupiter's card up slides the planet into the space above the sheet; a pinch zooms about the fingers, not a point beside them; rotating by one finger turns about the planet. If a large body reads badly cropped at `half`, say so: "A zoom-out with the shift" below is the fallback.

## Not planned

- **Editing in 3D by touch.** Box selection, dragging along a plane, the height gizmo and the context menu all assume a pointer with buttons and a keyboard's modifiers. It stays the README's non-goal.
- **Small edits from the info panel on a phone** (a name, a summary, a spoiler flag, with no 3D editing). The form's fields, the conflict dialog and History were never laid out for a phone. Come back to it if an editor asks.
- **Native apps, or a store wrapper.** See below.
- **The view shift for the side panel on tablets and laptops.** From 768 px wide the 380 px panel covers up to half the window too, and L3-T9's store and driver would take a `rightPx` there with no new code. Not asked for, and on a laptop the picture would slide at every first click, in edit mode as well. Try it if the owner finds the same trouble on an iPad.

## Other approaches considered

| Approach | Why not |
|---|---|
| **A. One slide-out menu for everything** | The smallest change, but Search, the main way to get around on a phone, would be two taps away. |
| **B. A bottom tab bar** | The most phone-like, but it competes with the info panel for the bottom edge and takes a second row from the map. |
| **One breakpoint at 768 px** | Leaves the full bar cut off between 768 and about 1,200 px: every tablet, and half-width laptop windows. |
| **Measuring the bar and collapsing what doesn't fit** (a ResizeObserver) | Adapts to any name's length, but the layout would depend on content and fonts, and tests couldn't name the width at which it changes. Truncation covers long names. |
| **Letting the bar wrap onto more rows** | A few lines of CSS, but it takes a fifth of a phone's screen from the map and leaves 32 px targets and 384 px popovers. |
| **Native apps for iOS and Android** | The 3D would be rewritten twice to gain anything, and the site's reach is its links: previews (M8-T9) and camera links (D-52) open in a browser with nothing to install. Stores add review cycles, fees, and a real chance of rejection for fan maps of someone else's universe. |
| **A store wrapper around the web app** (Capacitor or similar) | The same WebGL in a web view, so no better than the browser, plus two build pipelines and the stores' rules. Possible later, on top of L3-T7. |
| **A separate phone build or `m.` site** | Two apps to keep in step. |
| **Hiding Edit on every touch screen,** whatever is plugged in | An iPad with a keyboard and trackpad edits well. The owner chose the pointer, not the screen, as the test. |
| **The details as a full page with a Back button** (for the covered map, after v0.12.0) | The map is never half covered, and long entries read well, but the reader can't look at the thing while reading about it. L3-T8's `full` stop gives the same room. |
| **Only tidying the half-height sheet** (the name on its collapsed strip, the arrow turned round, a handle, 40 % instead of 50 %) | Cheap, and L3-T8 does all of it but the 40 %. A third of the map would still be covered at every tap. |
| **A zoom-out with the shift,** so whatever filled the canvas fills the uncovered band | A tap or a pull on a sheet would move the camera, which nothing else in the app does without being asked, and a camera link copied then would hold the changed pose. Kept as the fallback if the owner's check on L3-T9 finds large bodies cropped. |
| **Moving the camera's target instead of shifting the picture** (camera-controls' `setFocalOffset`) | It moves the camera sideways, so the pose changes: a camera link copied then would carry the offset, and nearby things would shift against far ones as the sheet opens. The lens shift leaves the pose alone. |

## Also noted

- **Crowded neighbourhoods.** In the owner's first screenshot the stars around the Solar System sit so close that their glows merge and their names line up beside the wrong body. Labels don't overlap, but which name belongs to which star is hard to tell. That's about how near neighbours are drawn at that zoom on any screen: look at it with L3-T3's label margin in place before changing anything.
- **Icon-only buttons on a tablet have no tooltip,** since touch has no hover. The compact bar relies on the icons, the tour and the accessible names. If readers on tablets miss Events or Layers, give the compact bar a More sheet too.
- **The phone's share sheet for "Copy link to this view"** would reuse L3-T5's `navigator.share` call.

# Later: a usability pass for phones and narrow windows

**Status:** ready to pick up, not scheduled. Written 2026-11-19 after the owner tried the live site on an iPhone; the owner settled its open questions the same day ("Decided" below). The task IDs (`L3-T1` and so on) are provisional: renumber them if this joins a milestone. Do the tasks in order: each one stands on the ones before it and leaves `main` working.

**Goal:** a reader on a phone can do everything a reader on a laptop can: find their way around, search, open and read an object, change what's shown, and record a clip. Nothing is off screen or too small to tap, at any window width from 320 px up. Editing stays with a mouse or trackpad, and the app says so only to the people it affects.

**Depends on:** M8-T10 (done), whose tours point at controls this moves, and D-55/D-56 (done) for L3-T5. It touches no data, no API route and no renderer.
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

Record these as one D-entry in `decisions.md` with L3-T1's commit.

## The layout

### Tiers

| Tier | When | Top bar | Panels |
|---|---|---|---|
| **slim** | width < 768 px, or height < 500 px (short) | the mark, the location chip, Search, More | sheets |
| **compact** | 768 to 1,279 px wide, and not short | today's bar with the name reduced to its mark and the right-hand buttons to their icons | as today |
| **full** | 1,280 px and wider, and not short | today's bar | as today |

- **One definition.** `apps/web/src/lib/layout-tier.ts` holds the media queries as strings and exports `useLayoutTier()` (`'slim' | 'compact' | 'full'`) and `useShort()`, both from `matchMedia` with change listeners, so a rotation or a resized window is followed. `index.css` declares the same queries as Tailwind custom variants (`slim:`, `compact:`, `full:`, `short:`), and a unit test reads `index.css` and fails if the two disagree (CSS can't import the constants).
- **CSS where the markup is the same, the hook where it isn't.** Compact against full is the same controls with or without their text: variants only, no hook. Slim is different markup (the chip and More replace the switchers, breadcrumbs and buttons), so `TopBar` renders one or the other from the hook. Rendering both and hiding one would put every `data-tour` mark and every focusable control on the page twice.
- **Compact and full never wrap or overflow.** The name is "◈ Galaxy Explorer" on full and "◈" on compact (the link keeps its `aria-label`). Switcher names and breadcrumbs get `min-w-0` and `truncate`; the breadcrumbs before the current one shrink first, and the current one keeps at least 12 characters. Icon-only buttons keep their names as `aria-label` and `title`.
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

### The info panel and the outliner on slim

- **The info panel** keeps its bottom sheet (`max-h-[50vh]` becomes `50dvh`, plus the bottom safe area). It is hidden while a sheet from `useSheet` is open and returns when that closes: the map is never under two things. When short, it docks to the right as it does from 768 px (`short:` variants beside the `md:` ones), 360 px wide at most.
- **No two heights.** An earlier draft gave the info sheet a peek and a full height. Left out: its contents already fold (the description's **More**), and half the screen is enough.
- **The outliner** is the `'list'` sheet. Choosing an item selects it and closes the sheet, so the info panel shows what was chosen. The floating List button isn't shown on slim.
- **Toasts** move above the info panel's top edge on slim, and inside the safe areas.

### Who is offered editing

- `apps/web/src/lib/pointer-kind.ts` exports `useHasFinePointer()`: true when `(any-pointer: fine)` matches, **or** once any pointer event with `pointerType === 'mouse'` has been seen in this page's life (a mouse plugged into a phone, or a browser whose media query is wrong). It never goes back to false.
- Editing is offered when `useCanEdit()` and `useHasFinePointer()` are both true. `EditToggle` sets `useEditor`'s `available` from both, so everything already gated on `available` follows without its own check: the E key, the shortcut help's Edit section, the editor's tour and its offer. If it turns false while editing, edit mode is left.
- Tier doesn't come into it: a narrow window on a laptop edits (the edit toolbar and the left panels were never meant for 400 px, and that's accepted), and a 13-inch tablet with no trackpad doesn't.
- `useCanEdit()` stays the permission, and still decides the things that aren't 3D editing: universe settings, sharing, "Clone map as…".

### Test hooks

`window.__GE_TEST__.layout()` returns `{ tier, short, finePointer, sheet }`. Specs read it instead of guessing from the viewport.

## Tasks

### L3-T1 The bar fits every window from 768 px

**Where:** `apps/web/src/lib/layout-tier.ts`, `apps/web/src/index.css`, `apps/web/src/app/` (`top-bar.tsx`, `breadcrumbs.tsx`, `switcher.tsx`, and each button in the right-hand group), `apps/web/src/render/test-hooks.ts`, `apps/web/playwright.config.js`, `apps/web/e2e/`.

- The tier definitions, hooks, custom variants and the unit test that keeps them in step.
- The compact bar and the truncation rules above. The slim tier renders the compact bar for now: L3-T2 replaces it.
- `layout()` in the test hooks (`sheet` is always null until L3-T2).
- A helper in `e2e/` that asserts every visible control inside `<header>` has its box wholly inside the viewport, and that the page's scroll width equals its client width.
- The D-entry for "Decided" above; ux.md §1 gains the three tiers.

**Done when:**
- [ ] Unit test: `index.css`'s variants and `layout-tier.ts`'s queries are the same.
- [ ] E2E (the existing desktop projects, with `page.setViewportSize`): as a signed-in editor in an orbit view of the demo universe, the helper passes at 768, 1,024, 1,279, 1,280 and 1,440 px wide.
- [ ] E2E: at 1,024 px the bar's buttons have no visible text but keep their accessible names; at 1,280 px they have text.
- [ ] The existing e2e suites pass with no change to their selectors (they run at 1,280 px, the full tier).

### L3-T2 The slim bar and its sheets

**Where:** `apps/web/src/components/ui/sheet.tsx`, `apps/web/src/state/sheet.ts`, `apps/web/src/app/` (`top-bar.tsx`, new `slim-bar.tsx`, `location-chip.tsx`, `location-sheet.tsx`, `more-sheet.tsx`), the popovers and menus named under "Sheets", `apps/web/src/panels/outliner/`, `apps/web/src/panels/info-panel.tsx`, `apps/web/index.html`, `apps/web/src/help/` (`tour-types.ts`, `use-target.ts`), `apps/web/playwright.config.js`.

- `viewport-fit=cover` in `index.html`; safe-area padding on the bars, sheets, info panel and toasts; `dvh` where `vh` is used for a panel's height.
- The Sheet, `useSheet`, the slim bar, the location sheet, and the More sheet with the rows marked L3-T2 in its table.
- The body/frame split of the five popovers and menus and the outliner.
- The info panel and toasts on slim, and the short variants, as above.
- **Two Playwright projects:** `phone-chromium` (`devices['Pixel 7']`) and `phone-webkit` (`devices['iPhone 14']`), which run only specs named `*.phone.spec.ts`; the desktop projects ignore those. CI runs `phone-chromium`, as it runs `chromium`. Update the e2e row of AGENTS.md's command table.
- **Tours point at what's on screen.** A tour's control is found by its `data-tour` mark (`use-target.ts`), and on slim most marks are inside a closed sheet. Add `'more'` and `'location'` to `TOUR_CONTROLS`, and a table in `tour-types.ts`, `SLIM_FALLBACK`: `list`, `layers`, `events`, `spoilers` and `help` fall back to `more`; `breadcrumbs` and `universe-switcher` to `location`. `controlBox()` uses the fallback when the named control isn't on the page, so a step points at More until the reader opens it, then at the row. The steps' completions (`list-opened` and the rest) don't change. The tour's popover keeps clear of the safe areas and of an open sheet (above a bottom sheet, left of a right-hand one).

**Done when:**
- [ ] E2E (phone projects): on a map, L3-T1's helper passes at the device's size and at 320 px wide; `layout().tier` is `'slim'`.
- [ ] E2E: the chip names the current view at each of the three levels; the location sheet goes back up a view, and switches map and universe.
- [ ] E2E: Search, List, Events, Layers, the spoiler switch, Display, Help and "Sign in" each work from the slim bar or the More sheet.
- [ ] E2E: showing a second sheet replaces the first (`layout().sheet`); the info panel is hidden while one is open and back when it closes; choosing an outliner item closes the sheet and selects the item.
- [ ] E2E: at 844 × 390 (a phone on its side) the tier is slim, and a sheet and the info panel are on the right.
- [ ] E2E: the reader's tour runs from first step to last on a phone project.
- [ ] The unit test that holds every tour step to the lists passes with the new controls.
- [ ] **Owner's check,** on the iPhone, with the build deployed or on the local network: nothing sits under the notch, the home bar or Safari's bar, upright and on its side. Reported in the commit message, or in a follow-up commit if it's made after release.

### L3-T3 Touch on the canvas, and labels

**Where:** `apps/web/src/input/` (`use-pointer-selection.ts`, `bindings.ts`), `apps/web/src/render/tuning.ts`, `apps/web/src/render/labels/`, `apps/web/src/panels/layers/`, `apps/web/src/panels/shortcut-help/`, `apps/web/src/help/` (`tour-types.ts`, `tours.ts`).

- **Double-tap is ours.** Two touch taps on the same object within `DOUBLE_TAP_MS` (300) and `DOUBLE_TAP_SLOP_PX` (24), in `tuning.ts` beside `CLICK_MAX_MOVE_PX`, enter it. The first tap selects at once, as a click does: nothing waits for a second tap. The native `dblclick` listener ignores a double-click whose last `pointerdown` was a touch, so browsers that do send one don't enter twice. The rule is a pure function, unit-tested.
- **The canvas owns its gestures.** At run time the canvas's computed `touch-action` must be `none` (camera-controls may already set it on the element it's given: check, and set it in CSS if not), and `overscroll-behavior: none` on the page stops pull-to-refresh and the rubber band.
- **A wider reach under a finger.** `PICK_MIN_RADIUS_TOUCH_PX` (22, half a 44 px target) and a touch value for `LABEL_HIT_PADDING_PX`, used when the event's `pointerType` is `'touch'`. The nearest object within reach still wins, so close neighbours stay tellable apart.
- **A Labels control** at the top of the Layers panel, on every tier: Hover, Groups, All, bound to `useLabels` (add a `setMode`; `cycle` stays for the L key). On a device with no hover, "Hover" is worded "Selected only". The More row becomes "Layers and labels". The first-visit mode is unchanged (decision 5).
- **Fewer labels on slim.** `LABEL_MARGIN_SLIM_PX` (start at 6) pads every placed label's rectangle in `solveLabels()` on the slim tier, so neighbours are dropped sooner. Font sizes don't change.
- **The shortcut help** leads with a Touch section when there's no fine pointer: the touch column of ux.md §3, from the same bindings table as the other sections.
- **The reader's tour speaks of the device in hand.** `TourStep` gains an optional `touchText`, used when there's no fine pointer. Every reader step that names the mouse or a key gets one ("Drag with two fingers to slide it", "Double-tap this system", "Tap Search", "Open More, then Help, for every gesture"). A unit test fails for a reader step whose `text` mentions a key or the mouse and has no `touchText`.
- Docs: ux.md §3 (the touch column as built), §7 (the Labels control), rendering.md §10 and §11 (the touch reach, the slim margin).

**Done when:**
- [ ] Unit tests: the double-tap rule (inside and outside the time and the distance, and two different objects); `solveLabels()` places no more labels with the margin than without, and fewer on the stress map.
- [ ] E2E (phone projects, WebKit included): a tap selects; two taps on a system enter it; the location sheet leads back out.
- [ ] E2E: the Labels control changes `__GE_TEST__.visibleLabels()` between its three modes, on a phone project and on desktop, and the choice survives a reload.
- [ ] E2E: a tap 18 px outside a small body's drawn edge selects it by touch; the same point clicked with a mouse selects nothing.
- [ ] E2E: the canvas's computed `touch-action` is `none`.
- [ ] `pnpm perf` still meets the galaxy budget (the label margin doesn't apply at its width, and the solver's time must not rise). Numbers in the commit message.
- [ ] **Owner's check,** on the iPhone: one finger rotates, two pan, pinch zooms, double-tap enters, and the page never scrolls, zooms or reloads under the map.

### L3-T4 Pages that fit, and editing only where it works

**Where:** `apps/web/src/lib/pointer-kind.ts`, `apps/web/src/app/edit-toggle.tsx`, `apps/web/src/app/more-sheet.tsx`, `apps/web/src/pages/` (`home-page.tsx`, `login-page.tsx`, `account-page.tsx`, `account-link-page.tsx`, `universe-settings-page.tsx`, `admin/`).

- `useHasFinePointer()` and the rule under "Who is offered editing". The More sheet's note.
- The fixed-width pages become `w-full max-w-…` with 16 px side margins on slim. Tables on the settings and admin pages scroll sideways inside their own box, never the page.
- The shared input is already 16 px on narrow screens (`text-base`), which is what keeps iOS from zooming on focus. Check the two inputs that style themselves: the command palette's and the rich-text editor's.
- Docs: ux.md §2 (where editing is offered), §13 (the pages on a phone).

**Done when:**
- [ ] E2E (phone projects): an editor sees no edit toggle and no Edit row, pressing E does nothing, and the More sheet shows the note. A viewer of the same universe sees no note.
- [ ] E2E (phone project): after a mouse pointer event on the page, `layout().finePointer` is true and Edit is offered. (If the emulated context can't send a `mouse` pointer event, dispatch a `PointerEvent` with that `pointerType` from the page.)
- [ ] E2E (desktop, viewport 600 px wide): an editor still gets the edit toggle, in the More sheet.
- [ ] E2E (phone projects): home, sign-in, the account page, universe settings and the admin screens don't scroll sideways; signing in works.

### L3-T5 Capture mode by touch

**Where:** `apps/web/src/app/` (new `capture-controls.tsx`, `capture-card.tsx`, `more-sheet.tsx`), `apps/web/src/pages/` (`use-capture-mode.ts`, `record-shot.ts`).

- **Record a clip** in the More sheet lists the three shapes (the palette's commands, which stay) and enters capture mode.
- **Buttons for the keys.** Capture's actions are already a table (`CaptureKeyAction`, run by `runCaptureKey` in `use-capture-mode.ts`). Export the runner, and `capture-controls.tsx` renders one button per action from the table and `CAPTURE_ACTION_DESCRIPTIONS`: Start here, End here, shorter, longer, Play, Record, Leave. No second list of actions.
- **Where they sit:** shown when there's no fine pointer, or on the slim tier. A strip along the bottom of the window, over the frame's lower edge, inside the safe area, with one line of the card's text above it (the shot, and what just happened). The card beside the frame stays for wide windows.
- **They can't get into the clip.** A recording is drawn from the WebGL canvas and the painted labels (rendering.md §16), never from the page, so nothing over the frame is recorded. The strip still hides while a move plays or records, so the owner sees the shot and a screen recorder gets a clean frame; a tap during play stops it (a drag already does), and Stop shows alone while recording.
- **Save to where the phone keeps video.** A download on iOS goes to Files; Instagram reads Photos. When `navigator.canShare({ files: [file] })` is true, the finished clip shows **Save or share**, which calls `navigator.share` with the file: the share sheet has "Save Video". It needs a tap of its own (a browser only allows sharing from a user's gesture, and the recording took seconds), so it's a button, not automatic. Elsewhere the download stays.
- The frame needs no change: `captureFrame()` already fits the shape to any window, and recording sets the drawing buffer to 1,080 px wide whatever the screen.
- Docs: ux.md §14, rendering.md §16.

**Done when:**
- [ ] E2E (phone projects): from More, enter 9:16; Start here and End here write `cam` and `to` into the address; Play moves the camera and ends; Leave restores the slim bar.
- [ ] E2E: Record produces an MP4 of the expected size, checked as `e2e/capture.spec.ts` checks it; where sharing isn't available the download happens.
- [ ] Idle stays at 0 frames in capture mode with the strip showing.
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

## Not planned

- **Editing in 3D by touch.** Box selection, dragging along a plane, the height gizmo and the context menu all assume a pointer with buttons and a keyboard's modifiers. It stays the README's non-goal.
- **Small edits from the info panel on a phone** (a name, a summary, a spoiler flag, with no 3D editing). The form's fields, the conflict dialog and History were never laid out for a phone. Come back to it if an editor asks.
- **Native apps, or a store wrapper.** See below.

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

## Also noted

- **Crowded neighbourhoods.** In the owner's first screenshot the stars around the Solar System sit so close that their glows merge and their names line up beside the wrong body. Labels don't overlap, but which name belongs to which star is hard to tell. That's about how near neighbours are drawn at that zoom on any screen: look at it with L3-T3's label margin in place before changing anything.
- **Icon-only buttons on a tablet have no tooltip,** since touch has no hover. The compact bar relies on the icons, the tour and the accessible names. If readers on tablets miss Events or Layers, give the compact bar a More sheet too.
- **The phone's share sheet for "Copy link to this view"** would reuse L3-T5's `navigator.share` call.

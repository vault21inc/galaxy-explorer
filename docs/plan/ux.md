# UX

What the app looks like and how it responds to the mouse, trackpad, touch and keyboard. The implementation details of the 3D side are in [rendering.md](rendering.md).

## 1. Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◈ Warhammer 40,000 ▾  M41 ▾   Galaxy › Gudrun System › Gudrun          ⌘K   Spoilers: Hidden   ✎ Edit │
├────────────────┬───────────────────────────────────────────────────────┬─────────────────┤
│ Outliner       │                                                       │ Panel           │
│ (edit mode;    │                  3D view (canvas)                     │ info for the    │
│ in view mode   │                                                       │ selection, or   │
│ via "List")    │                                                       │ the edit form   │
│                │                                                       │ in edit mode    │
├────────────────┴───────────────────────────────────────────────────────┴─────────────────┤
│ Edit toolbar (edit mode only):  Select · Add ▾ · Group · Route · Underlay · Undo · Redo · History │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:**
  - universe and map switchers;
  - breadcrumbs (the subject's ancestors, each clickable);
  - search / command palette (M7);
  - the spoiler toggle;
  - the edit toggle, owner only.
- **Right panel:** about 380 px wide, collapsible. It shows the selection's details, or for several selected items, a summary with bulk actions. On screens narrower than 768 px it becomes a bottom sheet.
- **Left outliner:** a tree of the current view's contents, grouped by group. It's always available in edit mode, and in view mode through a "List" button. It is also the accessible alternative to the canvas (§10).
- **Bottom toolbar:** edit mode only.
- **Overlays:** the shortcut help (`?`) and toasts in the bottom-right corner.

## 2. Modes

| | View mode | Edit mode |
|---|---|---|
| Who | everyone (public) | the owner (no login locally; login in production, M8) |
| Toggle | — | ✎ button or `E` |
| Plain left-drag on empty space | rotates the camera | draws a selection box |
| Left-drag on a selected object | rotates the camera | moves the object |
| Panel | read-only info | edit form (autosaves each field on blur; Enter saves single-line fields) |
| Spoilers | hidden by default, toggleable | always shown, with spoiler content marked |
| Drafts | not visible | visible, with a "Draft" badge |

Edit mode changes **only** what a plain left-drag does. Everything else is identical, so moving between the modes doesn't require relearning the controls.

## 3. Input bindings

These follow widely used conventions (T3):

- the standard web 3D viewer mapping (three.js OrbitControls, Sketchfab, Google Earth on the web) for navigation;
- 3D editors and RTS games (Blender, Unity, Sins of a Solar Empire) for box selection in edit mode;
- design tools for Cmd/Ctrl-click multi-select.

They're defined once in `apps/web/src/input/bindings.ts` and resolved by `resolveBinding(gesture, modifiers, mode, target)`, a pure, unit-tested function.

| Action | Mouse | Mac trackpad | Touch (viewing only) |
|---|---|---|---|
| Rotate | left-drag anywhere (view mode), middle-drag, or Option/Alt + left-drag (any mode) | drag (view mode) or Option + drag (any mode) | one-finger drag |
| Pan | right-drag, or Cmd (Mac) / Ctrl (Windows, Linux) + left-drag | Cmd + drag | two-finger drag |
| Zoom toward the cursor | wheel | two-finger scroll or pinch | pinch |
| Select | click | click | tap |
| Add to or remove from the selection | Shift + click, or Cmd/Ctrl + click | same | — |
| Box select (edit) | left-drag on empty space; Shift + drag adds to the selection | drag on empty space | — |
| Move (edit) | drag a selected object along the galactic or ecliptic plane; drag the gizmo's vertical arrow for height (T4) | same | — |
| Enter, or fly to | double-click, Enter, or keep zooming in past the threshold | same | double-tap |
| Back up a view | Esc, zoom out past the threshold, breadcrumb, or browser Back | same | breadcrumb, pinch out |
| Context menu (edit) | right-click without dragging | two-finger click | — |

- **Cmd, not Ctrl, on Macs.** Ctrl-click on a Mac opens the context menu, so the "primary modifier" is Cmd on macOS and Ctrl elsewhere (`isPrimaryModifier(event)`). The owner's "control-click" becomes Cmd-click on the Mac.
- **Click versus drag:** a press that moves less than 4 px before release is a click.
- **Right-click versus right-drag:** a right press that doesn't move opens the context menu (edit mode); one that moves pans. The browser's own context menu is suppressed on the canvas.
- **Why the wheel always zooms:** browsers can't reliably tell a trackpad's two-finger scroll from a mouse wheel, so both zoom. Pinch arrives as ctrl+wheel (Safari also sends gesture events) and is normalized to feel the same.
- **Touch editing** is out of scope for the proof of concept. Touch devices get view mode.
- **Configurable later:** the table is data, so a user-facing keymap editor can come later without touching the controls.

## 4. Keyboard shortcuts

Shortcuts are ignored while focus is in a text field. `?` opens this list as an overlay.

| Keys | Action | Mode |
|---|---|---|
| Esc | Clear the selection; if nothing is selected, go up one view | both |
| Enter | Enter the selected explorable object | both |
| F | Frame the selection | both |
| H or Home | Reset the camera for this view | both |
| Arrow keys | Pan | both |
| `+` / `−` | Zoom | both |
| L | Cycle labels: hover → groups → all | both |
| Space (hold) | Show all labels while held | both |
| Shift + S | Toggle "Show potential spoilers" | both |
| ⌘/Ctrl + K | Search / command palette (M7) | both |
| ? | Shortcut help | both |
| E | Toggle edit mode | owner |
| N | Add an object at the cursor (opens the type menu) | edit |
| ⌘/Ctrl + G | Group the selection | edit |
| ⌘/Ctrl + Shift + G | Remove the selection from its group | edit |
| ⌘/Ctrl + D | Duplicate the selection | edit |
| Delete / Backspace | Delete the selection (with confirmation) | edit |
| ⌘/Ctrl + A | Select everything in this view | edit |
| ⌘/Ctrl + Z | Undo | edit |
| ⌘/Ctrl + Shift + Z (or Ctrl + Y on Windows) | Redo | edit |

## 5. Selecting and editing

- **Selection** is one list of ids in the selection store. Selecting in the canvas, the outliner, search results or the events list all go through `select(ids, { add, toggle })`.
- **Creating an object:**
  1. Choose Add ▾ (or press N) and pick a base type, then optionally a subtype. Only types allowed in the current view appear.
  2. A ghost follows the cursor on the work plane; click to place it.
  3. The object is created with the name "New planet" and selected, and the panel focuses its name field.
  4. Esc cancels placement.
- **Moving:**
  - Pressing on an unselected object selects it first; dragging then moves the whole selection along the plane, keeping offsets.
  - The gizmo's vertical arrow changes height.
  - Hold Shift while dragging to snap to the grid (10 units by default; set in the toolbar).
  - The panel shows the position as numbers that can be edited.
  - One drag is one change batch, so undo restores the whole drag.
- **Edit form:**
  - Generated from the entity kind's registry entry: name, summary, description, subtype, explorable, status, appearance, then aspect sections (facts, images, links, relations, location, members).
  - Inherited appearance values appear greyed out with "reset to default".
  - Each field saves on blur. A 409 conflict shows "Changed elsewhere: reload or overwrite", with a diff.
- **Grouping:**
  1. Select objects and press ⌘/Ctrl + G (or Group in the toolbar).
  2. In the dialog, pick a group type (from universe settings), a name, an outline color (defaulting to the type's color) and an optional parent group.
  3. An object already in a group of that type triggers "Move N objects from Helican to Ophidian?"
  4. The new group is selected. Adding objects to it later works by drag-select, then "Add to group ▸" in the context menu.
- **Deleting:** a confirmation that lists what goes with it, for example "Delete Gudrun System? 7 child objects, 3 group memberships; 4 events become unplaced". Deletes can be undone.
- **Undo and redo:** ⌘/Ctrl + Z and the shift variant walk this session's batches. The History panel lists all batches, including those from other sessions and API tokens, with actor, description and time, each with a Revert button. A conflict explains which item changed since.
- **Duplicating** (⌘/Ctrl + D) copies the selected objects 20 units to the right, including their appearance and facts but not their relations or memberships.

## 6. Spoilers

The default is spoiler-free for every visitor (P3). The toggle in the top bar, **Spoilers: Hidden / Shown**, is remembered per browser, and Shift + S switches it.

How hidden content looks (P2, black out rather than remove):

| Hidden item | How it appears |
|---|---|
| A text field or part of one | a black bar about the length of the hidden text; hovering shows "Potential spoiler: click to reveal" |
| A whole entity | the panel shows a redacted title, "This entry contains potential spoilers", and a Reveal button |
| An object in 3D | neutral grey body; its label is a redaction bar |
| A group | neutral grey outline; its label is a redaction bar |
| An image | blurred heavily with a "Spoiler" chip |
| A fact, link or relation | the row's value is blacked out |
| A group membership | the object is still drawn, but isn't counted inside that group's outline |
| An event or place | a grey pin with a "?" glyph; the title is blacked out |
| A location | the pin isn't drawn at all, because drawing it would reveal the place; the panel says "Location: ▇▇▇▇" |

- Clicking a redaction reveals **that item only**, until the page reloads. The global toggle reveals everything.
- When spoilers are shown, spoiler content carries a small eye-slash marker, so readers know it was flagged.
- In edit mode everything is visible. Spoiler content has a subtle striped background, and every field and row has its own spoiler switch.
- Search (M7) with spoilers hidden matches only non-spoiler text and never shows spoiler snippets.

## 7. Labels

- **Default:** labels appear on hover and selection, so the galaxy stays uncluttered.
- **L cycles** hover → groups (group names always visible) → all (decluttered). **Holding Space** shows all labels while held.
- Labels never overlap; lower-priority ones are dropped (rendering.md §11). Raising an object's label priority (0–10) in the appearance editor keeps it visible ahead of others.

## 8. Rich text

- **Every text field** (names, summaries, descriptions, captions, relation roles) has a format menu: Plain, Markdown or HTML (U4).
  - Single-line editor for names; CodeMirror 6 for Markdown and HTML, with syntax highlighting.
  - A Preview toggle shows the rendered output.
  - A **Spoiler** switch for the whole field, and a **"Mark as spoiler"** button that wraps the selected text: `||…||` in Markdown, `<span data-spoiler>…</span>` in HTML.
- **Switching format** keeps the source text and warns that formatting may not carry over. Nothing is converted automatically.
- **Allowed HTML:** `p, br, strong, em, u, s, blockquote, ul, ol, li, h2, h3, h4, a[href], code, pre, table, thead, tbody, tr, th, td, hr, span[data-spoiler], img[src, alt]`. Image sources must be this site's `/media/` URLs. Everything else is removed on save, and the editor shows what was removed.

## 9. Moving between views

- **URLs:**
  - `/u/{universeSlug}/{mapSlug}` is the galaxy view;
  - `/u/{universeSlug}/{mapSlug}/view/{objectId}` is the system or orbit view of that object (the level comes from its type);
  - `?select={id},{id}` restores the selection.

  Every state can be shared as a link, and the browser's Back and Forward move between views.
- **Entering** (S1, S2): double-click, Enter, or keep zooming toward an explorable object. A progress ring fills while you push past the threshold, then the camera flies in and fades.
- **Not explorable:** zooming stops at a comfortable distance and its info opens.
- **Leaving:** zoom out past the threshold, press Esc, use a breadcrumb, or go Back. The camera returns to where it was.
- **Following a link** (from search, events or an outliner of another view) chains the transitions: galaxy → system → orbit, each shortened to 250 ms.

## 10. Accessibility

- **Outliner:** an ARIA tree of the current view's items, navigable with the arrow keys. Enter enters, Space selects. It mirrors canvas selection both ways, so every canvas action has a keyboard path.
- **Controls:** all menus, dialogs and toolbars use shadcn/ui (Radix) components, which handle keyboard and screen readers. Focus is always visible.
- **Canvas:** `role="application"` with an `aria-label` that names the view and points to the outliner. Selection changes are announced through an `aria-live="polite"` region ("Selected Gudrun, planet, Gudrun System").
- **Motion:** `prefers-reduced-motion` turns camera flights into a quick fade, turns off ambient motion and stops the progress-ring animation.
- **Contrast:** panel text meets WCAG AA. Group colors are user-chosen, so labels get a dark outline (text-shadow) to stay readable on any background.

## 11. Visual direction

The references (G4):

- **Mass Effect galaxy map:** cluster → system → planet, thin orbit rings, a holographic and tactical UI.
- **Sins of a Solar Empire:** strategic zoom. Objects never vanish when you zoom out, and labels and outlines stay readable at any distance.

Design rules:

- **Palette:** near-black space (`#03050a`); panels translucent dark (`rgb(10 14 22 / 0.85)`) with a 1 px hairline border (`rgb(255 255 255 / 0.08)`).
- **Accent color:** set per universe in its settings. The default is cyan `#4fd1ff`; a suggestion for 40k is brass `#c8a24a`.
- **Typography:**
  - Inter, or the system UI font, for the interface;
  - uppercase with 0.08em letter spacing for group labels and section headers;
  - a universe-specific display font for headings, later.
- **3D style:** bright small cores with soft glow, crisp thin lines (1–2 px), restrained color. Group fills are barely there (about 6 % opacity) so the stars stay the subject.
- **Iconography:** Lucide for the UI. Event-category and pin icons come from a bundled set chosen in M6. Options are Lucide (ISC license) or game-icons.net (CC BY 3.0, which needs an attribution line on the site).
- **Open item:** the owner adds 3–6 reference screenshots to `docs/design/references/` before M2-T3, and the visual tuning in M2 and M5 follows them.

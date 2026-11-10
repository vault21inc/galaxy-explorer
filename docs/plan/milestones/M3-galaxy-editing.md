# M3: Galaxy editing

**Goal:** build a galaxy by hand. In edit mode the owner can create, place, move, describe and delete objects; select several at once; undo anything; upload images; shape the galaxy itself; and trace positions over a reference map.

**Depends on:** M2.
**Read first:** [ux.md §2–5, §8](../ux.md), [architecture.md §4, §8](../architecture.md), [data-model.md §9](../data-model.md#9-history-batches-audit-trigger-revert).
**Demo at the end:**
1. Turn on edit mode. In Map settings, pick the "Barred spiral" preset, widen its bar and loosen its arms, then add a reference image under the galaxy.
2. Place three systems on it, set one system's height with the gizmo, and rename one with Markdown in its description.
3. Box-select two systems and move them together.
4. Undo everything step by step, then redo it.
5. Upload an image with a credit line, and mark it as a spoiler.

**Out of scope:** groups (M4), editing inside systems (M5), custom fields and subtypes (M7).

---

### M3-T1 Edit mode

**Where:** `apps/web/src/state/editor.ts`, `src/editor/`.

- The edit toggle: a top-bar button and the `E` key, available when `useCanEdit()` is true. That's always the case while the API reports `authMode: 'none'` (add `authMode` to `/api/health`).
- Entering edit mode:
  1. Switch the input mode, so plain left-drag goes to the editor (ux.md §2).
  2. Show the bottom toolbar and the outliner.
  3. Load drafts with `includeDrafts=true`, shown with a "Draft" badge and a translucent look.
  4. Show spoiler content with its striped marker (ux.md §6).

**Done when:**
- [x] E2E: in edit mode a left-drag on empty space draws a selection box instead of rotating; turning edit mode off restores rotation.
- [x] Drafts appear only in edit mode.

**Notes (done 2026-11-08):**
- **`/api/health` reports `authMode`.** `useCanEdit()` is true while it's `none`; M8 adds the owner's session.
- **The edit toggle** (✎ Edit) sits in the top bar on map pages, and E works while it's shown. `state/editor.ts` holds `editing` and `available`. Leaving the map pages leaves edit mode; switching maps keeps it.
- **Input:** the input mode follows the store, so the bindings table hands plain left-drag to the editor: `box-select` on empty space, `move` on an object (M3-T3).
- **Box selection works already** (`editor/use-box-select.ts`), though M3-T5 lists it. The rectangle is a DOM element moved with styles. Releasing selects every object whose projected center is inside it (`ScreenPicker.pickRect`), and Shift adds to the selection. M3-T5 keeps ⌘/Ctrl + A, delete, duplicate and the context menu.
- **The bottom toolbar** has ux.md §1's items. Select is active; the others are shown disabled, naming the task that brings them, so the layout won't shift. It also shows on an empty map, where Add will be needed.
- **The outliner** is M3-T9; nothing stands in for it yet.
- **Drafts:**
  - in edit mode, reads ask for `includeDrafts=true` (`useReadOptions`), which gives edit mode its own cache entries, so drafts never linger after leaving it;
  - the view keeps its current payload while the other one loads, for the same subject only;
  - drafts draw with M2-T3's see-through checkerboard, and the panel shows the "Draft" badge;
  - the demo seed gains a draft system, Halcyon, so 26 objects now (readers' payloads and snapshots are unchanged).
- **Spoilers in edit mode:** the effective policy is "show all", so bodies, labels and the panel show everything. Spoiler content gets a subtle striped background (`spoiler-marked`), and a flagged whole entry says so. The spoiler toggle is disabled until edit mode ends.
- **Tests:**
  - 3 unit tests: the box helpers and the editor store;
  - 5 e2e tests: E and the toggle, box select instead of rotate and rotation back after, drafts only in edit mode, marked spoilers, and no toggle off the map pages.

### M3-T2 Create objects

**Where:** `apps/web/src/editor/tools/create.ts`, `src/editor/add-menu.tsx`.

- The Add ▾ menu and the `N` key list only the base types allowed in the current view, read from `objectTypes[*].parents`. Subtypes join in M7.
- The placement ghost follows a ray–plane intersection with the work plane at y = 0. Click to create through the API (one batch), then:
  - select the new object;
  - open the panel with the name field focused;
  - give it the default name "New system" (or the type's name);
  - update the cache optimistically, and roll back if the request fails.
- Esc cancels placement.

**Done when:**
- [x] E2E: adding a system at a clicked point puts it within 1 % of the camera distance of that point. It is selected and its name field is focused.
- [x] A failed create (simulated with a 500) leaves no ghost and shows a toast.

**Notes (done 2026-11-08):**
- **Add ▾** in the toolbar (and N) lists `placeableTypes(level)`: the base types whose parents include the view's subject, from the object-types registry. In the galaxy view: system, planet, station, nebula, anomaly, black hole and marker.
- **The placement ghost** (`editor/placement.tsx`) is a see-through sphere of the type's color and clamped size, following `workPlanePoint()`: the camera ray through the pointer, meeting y = 0.
  - A click (under 4 px of movement) creates the object.
  - Esc or a right-click cancels; the toolbar says "Click to place a system · Esc cancels".
  - Selection and box selection ignore the pointer while placing.
- **Creating** (`useCreateObject`) is one POST with the batch description "Add system", through generic create and update helpers derived from the entity-kinds registry (`entityCreateRequest`, `entityUpdateRequest`, `useUpdateEntity`). Their paths are checked against the OpenAPI document.
  - New objects are named "New system" and so on, and are explorable when their type opens a view.
  - The cached galaxy payload gets an optimistic entry, resolved with `resolveAppearance`; a failure restores it and shows a toast.
  - On success the object is selected and its name field focused, and the views refetch.
- **A minimal name field** in the panel in edit mode, for plain-text names: Enter or leaving the field saves with `version`, Esc reverts. M3-T4 replaces it with the full rich-text field and the 409 dialog; for now, failures show a toast.
- **Toasts** (`state/toasts.ts`, `app/toaster.tsx`) sit bottom right (ux.md §1). Errors stay until dismissed; others go after 5 s.
- **Test hooks:** `workPlanePointAt(clientX, clientY)` and `placement()`.
- **Tests:**
  - 6 unit tests: placeable types per view, default names, the work-plane ray;
  - write paths for every kind checked against `openapi.json`;
  - 3 e2e tests, each on its own new universe: create at a point, selected, name focused, rename updates the label; Esc cancels; a failed create rolls back and shows a toast.

### M3-T3 Move objects

**Where:** `apps/web/src/editor/tools/move.ts`.

- Pressing on an object selects it if needed. Dragging moves **the whole selection** along the work plane, keeping offsets.
- Height uses drei `<TransformControls>` with only the Y handle visible (`showX={false} showZ={false}`), attached to the selection's center.
- Hold Shift while dragging to snap to the grid; the grid size is set in the toolbar.
- Live preview updates local positions only, followed by one `POST /batch` on release with the description "Moved N objects". A failure rolls the positions back.
- The panel's position fields (x, y, z, in the view's unit) save through the same path.

**Done when:**
- [x] E2E:
  - dragging an object follows the cursor on screen, and the database position is updated;
  - dragging two objects keeps their offset;
  - the gizmo changes only y;
  - a typed position applies.
- [x] A drag produces exactly one change batch.

**Notes (done 2026-11-08):**
- **The move preview** (`scene-index.ts`): a moving set and one delta. Nothing in React or the query cache changes during a drag.
  - `drawnObject` and `drawnObjects` apply it, so the picker, rings, labels and test hooks follow; `savedObject` gives the saved position.
  - `InstancedBodies` and `RegionCloud` shift only the moving instances' centers in place (`useMovePreview`) and put them back from a copy, so a drag never rebuilds the buffers.
- **Dragging on the plane** (`editor/move-tool.tsx`): a press that the bindings resolve to `move` (edit mode, on an object) starts a drag after 4 px.
  - An unselected object becomes the selection first; the whole selection then moves across the plane at the grabbed object's height.
  - Shift snaps the grabbed object to the grid (`moveDelta`), so offsets are kept. The grid size is a field in the toolbar, 10 units by default (ux.md §5).
- **Height:** drei `<TransformControls>` with only the Y arrow, at the selection's center. Its pointer state (`gizmo-state.ts`) keeps selection, box select and plane dragging out of its way.
- **Saving:** one `POST /batch` per drag (`useSaveMove`), "Moved N objects". The preview stays until the views have refetched, so nothing jumps; a failure ends it, which puts everything back, and shows a toast.
  - Writes need versions, so **`ViewObject` gains `version`** (view payloads, API and domain); the view snapshot changed only by those lines.
- **Typed positions:** a Position section in edit mode, from the panel-sections registry, for kinds with x, y and z. Fields save on Enter or blur through the same batch.
- **Test hooks:** `gizmoHandleAt()` (mirroring three-stdlib's handle scale) and `gizmoAxis()`.
- **Tests:**
  - 4 unit tests: `moveDelta`, snapping, the preview;
  - 4 e2e tests, each on its own universe: drag follows the cursor and saves as one batch; two objects keep their offset; the gizmo changes only y; a typed position applies.
- **Performance:** `pnpm perf` still passes every budget (Chrome 4.2 / 4.8 ms, 6 draw calls). The galaxy view chunk grows to 18 kB gzipped with TransformControls; initial JavaScript is unchanged.

### M3-T4 Generated editor forms and rich text editor

**Where:** `apps/web/src/panels/entity-form/`, `src/richtext/editor/`.

- `EntityForm` is generated from the kind's `form` metadata and Zod schema. Widgets:
  - `RichTextField`: format menu, CodeMirror 6 for Markdown and HTML, a single-line input for names, a preview toggle, the field-level spoiler switch, and **Mark as spoiler** (ux.md §8);
  - `ColorField`;
  - `PerViewScaleField`: a slider per view, with inherited values greyed out and a reset button;
  - `SwitchField`, used for `explorable` and shown only when `objectTypes[baseType].explorableAs` is set;
  - `SelectField` (status);
  - `PositionField`.
- Fields save on blur (single-line fields also on Enter), sending `version`. A 409 conflict opens the "Changed elsewhere" dialog with "Reload" and "Overwrite". Overwrite resends with the new version.
- After saving, the server returns the sanitized value, and the form shows what was removed if it differs.

**Done when:**
- [x] Component tests:
  - each format renders its editor;
  - Mark as spoiler wraps the selection correctly in Markdown and HTML;
  - forms generate for every registered kind, with no per-kind form files.
- [x] E2E:
  - renaming an object updates its label;
  - a Markdown description renders formatted in view mode;
  - marking a phrase as a spoiler blacks it out in view mode.

**Notes (done 2026-11-08):**
- **Forms as data (D-27):** each entity kind's `form` in `@ge/domain` lists its own fields and widgets; `formGroups` wraps them in the shared fields (name, summary, description; status and "Whole entry is a spoiler"; then appearance). `fieldSchema(kind, path)` finds a field's Zod schema, also inside documents (`appearance.scale.galaxy`), for validation, limits and nullability.
  - Objects: subtype (from the universe's subtypes for its base type), Explorable (only for types with `explorableAs`), position, color, size per view, label priority. Groups: group type and outline color; the parent group waits for M4. Events: date text, sort key, category. Places and characters: the shared fields.
- **The web side** (`panels/entity-form/`): `EntityForm` renders each field with its widget from `widgets.ts`. In edit mode it replaces the panel's name and text sections (sections gain a `mode`), and the position section became `PositionField`.
  - Widgets: `RichTextField` (names and texts), `SwitchField`, `SelectField`, `ColorField` (picker and hex), `PerViewScaleField` (a logarithmic slider per view the type is drawn in), `PositionField`, and `TextField` (text and numbers, limits from the schema). Inherited appearance values are dimmed, with Reset once overridden.
- **The rich-text editor** (`richtext/editor/`): format menu, a one-line input for names, a textarea for plain text, CodeMirror 6 for Markdown and HTML (lazy-loaded, 167 kB gzipped, never for readers), Preview, the field's Spoiler switch, and Mark as spoiler, which also unwraps when pressed again. Switching formats keeps the text and says formatting may not carry over.
- **Saving:** a field saves when focus leaves it (names also on Enter), and also if it disappears with an edit in it, since a click on the canvas can close the panel without moving focus. Saves queue per form and send the last version seen. A 409 opens "Changed elsewhere" with now-and-yours values: Reload or Overwrite. Saved HTML is compared with what was sent, and a note names what the sanitizer removed.
- **Fixes found on the way:**
  - The batch description header couldn't carry “quotes” or non-Latin names (header values are Latin-1), so it's now percent-encoded (D-27, architecture.md §5).
  - `refreshAfterWrite` cancels reads still in flight before invalidating. TanStack Query reuses an in-flight fetch for a query that has no data yet, so leaving edit mode right after a save could show the old text. Create, move and update all use it.
- **Tests:**
  - 6 domain tests per kind (every field's path and widget against the update schema), plus helpers;
  - 15 unit tests: Mark as spoiler, removed markup, field paths;
  - 17 component tests: the form for every kind, each format's editor;
  - 1 API test: a percent-encoded description;
  - 5 e2e tests, each on its own universe: renaming updates the label, Markdown renders, a marked phrase is blacked out, each format's editor and the removed-HTML note, Reload and Overwrite on a conflict.
- **Bundle:** initial JavaScript unchanged at 441 kB gzipped; the info panel chunk is 71 kB, CodeMirror's 167 kB.

### M3-T5 Multi-select, box select, delete, duplicate, context menu

**Where:** `apps/web/src/editor/tools/box-select.ts`, `src/editor/actions/`.

- Box select: left-drag on empty space in edit mode; Shift adds to the selection. Projected centers are tested against the rectangle. *Done in M3-T1.* ⌘/Ctrl + A selects everything in the view.
- Delete (Delete/Backspace or the context menu):
  1. A **dry-run batch** (M1-T7) returns the impact.
  2. The confirmation dialog lists it (ux.md §5).
  3. Confirming performs the real batch.
- Duplicate (⌘/Ctrl + D) creates copies 20 units to the right as one batch, with ` copy` appended to their names.
- Context menu on right-click without dragging: Rename, Duplicate, Delete, Enter (M5), and Add to group ▸ (M4).

**Done when:**
- [x] E2E: box-selecting 3 of 5 objects selects exactly those 3. Deleting one with children shows the impact counts and removes it; duplicating creates offset copies.

**Notes (done 2026-11-08):**
- **Shortcuts:** `EDIT_KEY_BINDINGS` in `input/bindings.ts`, with `resolveEditKey`: ⌘/Ctrl + A, ⌘/Ctrl + D, and Delete or Backspace. They work only in edit mode, not while typing, and the primary key must match the platform exactly, with Shift and Alt up.
- **`EditorActions`** (`editor/actions/`), on the map page, runs them from the keyboard or the context menu.
  - **Select all** selects every object in the view.
  - **Delete:**
    - a dry-run batch first; the dialog shows its impact in words (`summarizeImpact` and `describeImpact`): "2 child objects, 3 group memberships; 4 places or events become unplaced", or "Nothing else is affected";
    - Delete stays disabled until the count is in;
    - confirming sends the same batch for real ("Delete “West 1”" or "Delete 3 objects") and drops the deleted objects from the selection.
  - **Duplicate:**
    - reads each object with its facts, then creates the copies in one batch (`duplicateOperations`): every writable field from the create schema except `externalKey`, the name plus " copy", x + 20, then `setFacts` on `$op:N`;
    - relations, memberships and children aren't copied (ux.md §5);
    - the copies become the selection.
- **Context menu:** a right-click (or a Mac Ctrl-click) without dragging on an object in edit mode. It selects the object unless it's already in the selection, then offers Rename (focuses the name field), Duplicate and Delete. Enter joins with the system view (M5), and Add to group ▸ with groups (M4).
- **API fix:** a batch whose operations were all deletes wasn't listed in any universe's history, because a delete returns no data to read the universe from. `deleteEntity` now returns the universe, and the batch records it (integration test added). Undo (M3-T6) needs this.
- **Tests:**
  - 10 unit tests: shortcuts per platform, delete request and impact text, duplicate operations and names;
  - 1 API test;
  - 7 e2e tests, each on its own universe: box-select 3 of 5, select all, delete with children (impact, cascade, history), Cancel, duplicate two (offsets, one batch, selection), the context menu's Rename, and nothing outside edit mode.
- **Bundle:** initial JavaScript 445 kB gzipped (was 441 kB); the dialog now ships in the first chunk.

### M3-T6 Undo, redo and the history panel

**Where:** `apps/web/src/state/history.ts`, `src/panels/history/`.

- The undo stack is the batch ids returned by this session's mutations. ⌘/Ctrl + Z reverts the top batch; redo reverts that revert. A new edit clears the redo stack.
- The History panel lists `GET /universes/{id}/history` with actor, description and relative time, and a Revert button per batch. It works for batches from other sessions and API tokens too.
- After a revert, invalidate the affected queries, determined from the batch detail's entity kinds. A 409 conflict shows a toast naming the conflicting entity.

**Done when:**
- [x] E2E: create, move and rename, then undo three times back to nothing, then redo three times back to the end state.
- [x] Reverting an older batch from the History panel works.
- [x] A conflicting revert shows the conflict and changes nothing.

**Notes (done 2026-11-08):**
- **The stacks** (`state/history.ts`): the API client's `onBatch` records every write's batch id. It skips the revert route, whose batches undo and redo manage themselves.
  - Recording happens only while a universe's map is open; opening another universe starts afresh, and pages without one keep the stacks.
  - A new edit clears redo.
- **Undo and redo** (`editor/use-undo.ts`): ⌘/Ctrl + Z, ⌘/Ctrl + Shift + Z, Ctrl + Y elsewhere (`EDIT_KEY_BINDINGS`), and the toolbar's Undo and Redo, which are disabled when there's nothing to do.
  - Presses queue, so three quick ⌘Z are three undos. Undo reverts the top batch and keeps the revert's id; redo reverts that.
  - `useRevert` reads the batch detail first. Afterwards it refreshes the entity kinds, settings, maps and universes the batch touched, plus every view and the history (`affectedQueries`), and drops entities the revert deleted from the selection.
  - A 409 leaves the stacks alone and shows the API's message, which names what changed since.
- **The History panel** (`panels/history/`): the toolbar's History opens it on the left (the outliner's place until M3-T9). It lists every batch in the universe, newest first and from any session or token, with actor, description and relative time, and pages with "Show older changes".
  - Revert on any batch; it's disabled once a batch has been reverted.
  - A revert from the panel is pushed onto the undo stack, so ⌘Z takes it back.
  - The list refetches on every recorded change.
- **Fixes:**
  - Undo works on an empty map: the editor actions are rendered there too, so deleting the last object can be undone.
  - The Add menu no longer takes focus back from a new object's name field when its closing animation ends after a quick click.
- **Tests:**
  - 12 unit tests: the undo and redo keys per platform, the stacks, affected queries, created entities, relative time;
  - 3 e2e tests: create, move, rename, then 3 undos and 3 redos; reverting an older batch from another session in the panel, then ⌘Z on that; a conflicting revert.

### M3-T7 Assets and image upload

**Where:** `apps/api/src/routes/assets.ts`, `apps/api/src/storage/`, `apps/web/src/panels/images/`.

- The API side, as architecture §8 describes:
  - the `BlobStore` interface and `LocalBlobStore`;
  - `POST /universes/{id}/assets`, multipart via `@fastify/multipart`, limited to 25 MB;
  - type sniffing with `file-type`;
  - sharp producing the variants and stripping metadata;
  - deduplication by SHA-256, which returns the existing asset;
  - `PATCH` for metadata (alt text, credit, source URL, license);
  - `/media/*` served in development.
- The UI side:
  - the panel's Images section: gallery, cover image, caption (RichText), and a spoiler flag per image;
  - an asset picker over the universe's library with upload by drag-and-drop;
  - credit shown under every displayed image.

**Done when:**
- [x] Integration tests:
  - a PNG upload produces WebP variants of the expected sizes;
  - EXIF data is gone;
  - a renamed `.exe` is rejected;
  - a file over 25 MB is rejected;
  - uploading the same file twice returns the same asset.
- [x] E2E: adding an image to an object shows it with its credit; flagging it as a spoiler blurs it in view mode.

**Notes (done 2026-11-08):**
- **Storage** (`apps/api/src/storage/`): `BlobStore` and `LocalBlobStore` under `GE_MEDIA_DIR`. The default is `./.data/media`, read from the repository root; e2e runs use `./.data/e2e-media` and clear it at the start.
  - Keys are `u/{universeId}/{assetId}/{variant}.webp`.
  - `/media/*` serves only keys of exactly that shape, with immutable caching, in development and tests. Vite already proxies `/media`.
- **Pipeline** (`image-pipeline.ts`):
  - file-type sniffs the bytes, accepting PNG, JPEG, WebP, AVIF and GIF (first frame); anything else is 415;
  - sharp turns the image upright by its EXIF orientation and re-encodes WebP `thumb` (256 px) and `display` (1,600 px), never enlarging;
  - the metadata is left behind;
  - a damaged image is 415, and over 25 MB is 413 (@fastify/multipart).
  - The `texture` variant waits for planet textures (M6).
- **Routes** (`routes/assets.ts`):
  - `POST /universes/{id}/assets` takes the file as multipart field `file`. It returns 201 as one batch ("Upload “nebula.png”"), or 200 with the existing asset for the same bytes (SHA-256, also when two uploads race).
  - `GET /universes/{id}/assets` lists the library, newest first.
  - `GET` and `PATCH /assets/{id}` read and change alt text, credit, source URL and license; empty text clears a field.
  - Files are written inside the batch under the new id and deleted if the row isn't stored.
- **`ImageRead.asset`:** each attached image carries its asset's URLs, size, alt text and credit (`ImageAsset`), so the panel needs no second request. Redaction drops it with the rest of a hidden image. `mediaUrl()` in `@ge/domain` builds the URLs from the rich-text policy's `/media/` prefix.
- **The panel** (`panels/images/`):
  - In view mode: the cover across the panel, the gallery two to a row, each with its caption and credit (with license and source link). A hidden spoiler image is heavily blurred under a "Spoiler" chip, without caption or credit, and a click reveals it.
  - In edit mode (lazy-loaded): Add image opens the picker, which shows the library (images already added are disabled) and takes uploads by the button or by dropping files. Uploaded files are added at once, and the first image becomes the cover.
  - Per image: credit and alt text (saved on blur, shared by every entity using the image), caption (the rich-text editor, compact), Spoiler, Cover, and Remove.
- **Fixes found on the way:**
  - The rich-text editor saves the latest draft from a ref. A click that ends editing right after Mark as spoiler could arrive before React re-rendered, and save the text from before the change. Seen once under parallel e2e load.
  - The picker doesn't send focus back to "Add image" after a choice, which could swallow typing in the new image's fields.
- **Tests:**
  - 10 integration tests: variant sizes, no enlarging, EXIF and orientation, a renamed `.exe`, over 25 MB, the same file twice, the history entry, metadata (and a rejected `javascript:` source), image reads with and without spoilers, `/media/*` refusing other paths;
  - 1 config test;
  - 2 e2e tests: upload, credit, spoiler blur and reveal; the library disabling an image already added.
- **Dependencies (API):** @fastify/multipart 10.1.6, file-type 22.2.0, sharp 0.35.5. Each was the newest release at least two weeks old.

### M3-T8 Map settings: galaxy shape and reference underlay

**Where:** `packages/domain/src/galaxy/`, `apps/web/src/panels/map-settings/`, `apps/web/src/render/galaxy/`.

- **The Map settings panel**, opened from the toolbar's Map button (ux.md §1), has two sections. Every change is one batch, so undo and history cover it.
- **Galaxy shape** (D-24), editing `maps.galaxy_settings`:
  - **Presets** first: a row of named shapes, each a thumbnail of its disc. Picking one fills the settings, and the sliders then edit from there. Nothing remembers which preset was picked.
  - **Sliders** for arms (0–8), arm twist, arm spread, bar length, bulge radius, radius and thickness; three color pickers (core, arm, dust); a seed field with a "shuffle" button.
  - **Live preview while dragging:** the disc re-bakes at 512² into one reused render target, debounced by 150 ms (rendering.md §9). The full 2,048² bake runs on release, so dragging never fills the bake cache with full-size textures. The depth stars regenerate in the worker on release.
  - "Reset to default" restores `GALAXY_DEFAULTS`.
- **Presets are data** (`packages/domain/src/galaxy/presets.ts`): an id, a label and partial `GalaxySettings`, parsed by the schema in a unit test. A new preset needs no code change. The starting set:

  | Preset | Shape |
  |---|---|
  | Grand-design spiral | the defaults: 4 well-defined arms |
  | Two-armed spiral | 2 long, open arms |
  | Barred spiral | 2 arms starting from the ends of a central bar |
  | Flocculent spiral | 6–8 short, patchy arms with a wide spread |
  | Tightly wound spiral | 3–4 arms with a high twist |
  | Lenticular | no arms, a thin disc and a modest bulge |
  | Elliptical | no arms, a thick disc and a large bulge |

- **A central bar** (`barLengthRadii`, data-model §4): the shape the current formula can't make.
  - The bar is an elongated, flattened ellipsoid through the center along the galaxy's X axis, and the arms start at its ends instead of at the center.
  - Add it to `sampleGalaxyPosition` and to the disc's bake shader together; both read `GALAXY_SHAPE`.
  - With `barLengthRadii` 0 (the default), the sampler must draw exactly the same random numbers as before, so existing maps, the stress seed and the pinned point hash (`apps/web/test/galaxy-points.test.ts`) don't change.
- **Reference underlay:**
  - choose or upload an image;
  - set its width in the galaxy unit, rotation, X and Z offsets and opacity;
  - turn it on or off.

  These are saved in `maps.underlay` and `maps.underlay_asset_id`. The underlay renders only in edit mode, under everything, with depth writes off.
- **Not covered:** ring and irregular galaxies. Each would be another shape term in the sampler and the shader; add them as later presets if wanted.

**Done when:**
- [x] Unit tests: every preset parses as `GalaxySettings`; a bar puts disc stars along the X axis near the center (density test, as in `galaxy-density.test.ts`); with no bar, the sampler's first 1,000 positions are unchanged.
- [x] E2E: picking a preset and moving a slider changes the disc (its bake key and `renderInfo()`), survives a reload, and undoes in one step. While dragging, the texture count stays at most one above its starting value.
- [x] E2E: the underlay is visible in edit mode, invisible in view mode, and its settings persist after a reload.

**Notes (done 2026-11-09):**
- **The bar** (`barLengthRadii`, 0–0.6, default 0):
  - In the sampler, a quarter of the disc's stars go to an elongated, flattened ellipsoid along X (triangle-shaped along it, `GALAXY_SHAPE.barWidth` across).
  - The spiral is measured from the bar's ends, so arm 0 starts at +X.
  - The disc shader mirrors both and dims arm light inside the bar.
  - With no bar the sampler takes the same path and draws the same random numbers. Hashes of the first 1,000 positions were pinned before the change (three settings), and the web app's pinned point hash is unchanged.
- **Presets** (`galaxy/presets.ts`): the seven from the table, as partial settings. Grand-design equals the defaults.
- **The Map settings panel** (`panels/map-settings/`, lazy-loaded), from the toolbar's Map button on the left. History and Map settings share the left side, one at a time (`state/side-panel.ts`).
  - Preset thumbnails are drawn on a 2D canvas from `sampleGalaxyPosition`, with no WebGL.
  - The sliders take their limits from the schema (the bulge capped at 60,000 ly); radius and thickness use a log scale. A linear slider's arrow key moves one step.
  - Also: three colors (preview while picking, save on blur), the seed with Shuffle, and Reset to default (an empty document; a set `starPoints` is kept).
  - Every save is one PATCH, so one batch, queued with the last version seen (`useMapSave`).
- **Live preview** (`state/galaxy-preview.ts`):
  - Sliders write the preview on every step and save on release (the input's native `change`).
  - The disc re-bakes the preview at 512² into one reused target after 150 ms of rest (`bakeInto`), and the glow follows. The depth stars keep the saved settings until the save, then regenerate in the worker.
  - The preview ends once the saved map has refetched, so nothing jumps back.
  - Test hook `galaxyDisc()` gives the bake key and whether it's the preview.
- **Underlay:**
  - choose or upload with the M3-T7 picker; it starts 2.4 radii wide, centred, at 50% opacity;
  - width, rotation (previewed), X and Z offsets, opacity (previewed), shown, replace and remove;
  - drawn only in edit mode, as one plane at render order −10 with depth testing and writing off;
  - test hook `underlay()`.
- **Fixes found on the way:**
  - The empty-map hint still said Add was "arriving in M3-T2".
  - e2e reads used in polls go through `e2e/api.ts` with a 3 s timeout. A read through `vite preview`'s proxy stalled once under parallel load and used up a whole poll. That also explains one earlier unexplained M3-T6 failure.
- **Tests:**
  - domain: 9 new tests (the pinned no-bar hashes, the bar's density, presets parsing and resolving);
  - web unit: 3 tests (slider scales, the preview store);
  - e2e: 3 tests: a preset, a dragged slider (preview, at most one extra texture), reload and undo; undo of a preset; the underlay in edit mode only, persisting.
- **Performance** (`pnpm perf`, owner's Mac, Chrome and Playwright WebKit): all budgets pass.

  | | Before (M3-T3) | After |
  |---|---|---|
  | Chrome median / p95 | 4.2 / 4.8 ms | 4.2 / 4.7 ms |
  | WebKit median / p95 | 17.0 / 18.0 ms | 17.0 / 18.0 ms |
  | Draw calls | 6 | 6 |
  | Frames rendered while idle | 0 | 0 |
  | Initial JavaScript, gzipped | 441 kB | 452 kB |

  - The underlay adds one draw call in edit mode only.
  - The first galaxy frame was 531 ms in Chrome and 511 ms in WebKit, under its budget.

### M3-T9 Outliner

**Where:** `apps/web/src/panels/outliner/`.

- A tree of the current view's items (flat until M4 adds groups), with a filter box, an "Unplaced" section for places and events without a location (filled by M6), and badges for drafts and spoilers.
- Keyboard: it's an ARIA tree. Arrow keys move, Enter enters (M5), Space selects, Shift extends the selection. Selection syncs both ways with the canvas.
- Shown always in edit mode, and through the "List" button in view mode.

**Done when:**
- [x] Component tests cover keyboard navigation.
- [x] E2E: selecting in the outliner selects in 3D and the reverse; axe reports no violations on the shell with the outliner open.

**Notes (done 2026-11-09):**
- **The tree** (`panels/outliner/`): an ARIA tree (`role="tree"`, multi-selectable, one row reachable by Tab) of the view's objects, sorted by what's shown.
  - Each row has its type, a Draft badge, and a spoiler marker.
  - A hidden spoiler shows the same redaction bar as its 3D label (`labelText`) and is named "Hidden potential spoiler, System". The filter matches only what's shown, so it can't reveal a hidden name (ux.md §6).
  - Flat until M4's groups. The Unplaced section is a marked place in the component for M6.
- **Keyboard** (`outliner-keys.ts`, pure):
  - arrows and Home/End move focus; Space selects; Shift with an arrow or Space adds to the selection; Cmd/Ctrl + Space toggles; Escape clears;
  - Enter selects until entering arrives in M5;
  - clicks select, with Shift to add and Cmd/Ctrl to toggle.
  - Camera keys don't fire inside the tree (`ignoresCameraKeys` already skips `role="tree"`).
- **Selection** is the selection store's, both ways; a canvas selection scrolls its row into view.
- **Where:** in edit mode the outliner is always on the left, unless History or Map settings is open there; closing those brings it back (`state/side-panel.ts`). In view mode a List button opens it, with a close button.
- **Fixes:** a row's accessible name comes from its visible content, after axe's `label-content-name-mismatch` rule. The edit-mode box-select test starts its drag right of the outliner, which now covers the canvas's top-left corner in edit mode.
- **Tests:**
  - 10 component and unit tests: every key of the tree; the tree's roles, sorting, Tab stop, Draft badge and hidden spoiler;
  - 4 e2e tests: selection both ways, the keyboard (and no camera movement), the filter, and List with axe clean.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [x] Performance in edit mode, with the underlay visible and 100 objects selected, still meets the galaxy budget (re-run `pnpm perf` with `--edit`).
  - 2026-11-10, [report](../../perf/2026-11-10-M3-edit.md): Chrome 4.2 / 4.6 ms, 12 draw calls (6 in view mode), labels at 1.0 ms p95, 0 idle frames.
  - Chrome's window was on the 240 Hz external display.
- [ ] The owner has built a small real map, for example a dozen systems traced from a reference image, and has filed any friction as issues.

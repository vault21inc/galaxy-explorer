# M3: Galaxy editing

**Goal:** build a galaxy by hand. In edit mode the owner can create, place, move, describe and delete objects; select several at once; undo anything; upload images; and trace positions over a reference map.

**Depends on:** M2.
**Read first:** [ux.md §2–5, §8](../ux.md), [architecture.md §4, §8](../architecture.md), [data-model.md §9](../data-model.md#9-history-batches-audit-trigger-revert).
**Demo at the end:**
1. Turn on edit mode and add a reference image under the galaxy.
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
- [ ] E2E: in edit mode a left-drag on empty space draws a selection box instead of rotating; turning edit mode off restores rotation.
- [ ] Drafts appear only in edit mode.

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
- [ ] E2E: adding a system at a clicked point puts it within 1 % of the camera distance of that point. It is selected and its name field is focused.
- [ ] A failed create (simulated with a 500) leaves no ghost and shows a toast.

### M3-T3 Move objects

**Where:** `apps/web/src/editor/tools/move.ts`.

- Pressing on an object selects it if needed. Dragging moves **the whole selection** along the work plane, keeping offsets.
- Height uses drei `<TransformControls>` with only the Y handle visible (`showX={false} showZ={false}`), attached to the selection's center.
- Hold Shift while dragging to snap to the grid; the grid size is set in the toolbar.
- Live preview updates local positions only, followed by one `POST /batch` on release with the description "Moved N objects". A failure rolls the positions back.
- The panel's position fields (x, y, z, in the view's unit) save through the same path.

**Done when:**
- [ ] E2E:
  - dragging an object follows the cursor on screen, and the database position is updated;
  - dragging two objects keeps their offset;
  - the gizmo changes only y;
  - a typed position applies.
- [ ] A drag produces exactly one change batch.

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
- [ ] Component tests:
  - each format renders its editor;
  - Mark as spoiler wraps the selection correctly in Markdown and HTML;
  - forms generate for every registered kind, with no per-kind form files.
- [ ] E2E:
  - renaming an object updates its label;
  - a Markdown description renders formatted in view mode;
  - marking a phrase as a spoiler blacks it out in view mode.

### M3-T5 Multi-select, box select, delete, duplicate, context menu

**Where:** `apps/web/src/editor/tools/box-select.ts`, `src/editor/actions/`.

- Box select: left-drag on empty space in edit mode; Shift adds to the selection. Projected centers are tested against the rectangle. ⌘/Ctrl + A selects everything in the view.
- Delete (Delete/Backspace or the context menu):
  1. A **dry-run batch** (M1-T7) returns the impact.
  2. The confirmation dialog lists it (ux.md §5).
  3. Confirming performs the real batch.
- Duplicate (⌘/Ctrl + D) creates copies 20 units to the right as one batch, with ` copy` appended to their names.
- Context menu on right-click without dragging: Rename, Duplicate, Delete, Enter (M5), and Add to group ▸ (M4).

**Done when:**
- [ ] E2E: box-selecting 3 of 5 objects selects exactly those 3. Deleting one with children shows the impact counts and removes it; duplicating creates offset copies.

### M3-T6 Undo, redo and the history panel

**Where:** `apps/web/src/state/history.ts`, `src/panels/history/`.

- The undo stack is the batch ids returned by this session's mutations. ⌘/Ctrl + Z reverts the top batch; redo reverts that revert. A new edit clears the redo stack.
- The History panel lists `GET /universes/{id}/history` with actor, description and relative time, and a Revert button per batch. It works for batches from other sessions and API tokens too.
- After a revert, invalidate the affected queries, determined from the batch detail's entity kinds. A 409 conflict shows a toast naming the conflicting entity.

**Done when:**
- [ ] E2E: create, move and rename, then undo three times back to nothing, then redo three times back to the end state.
- [ ] Reverting an older batch from the History panel works.
- [ ] A conflicting revert shows the conflict and changes nothing.

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
- [ ] Integration tests:
  - a PNG upload produces WebP variants of the expected sizes;
  - EXIF data is gone;
  - a renamed `.exe` is rejected;
  - a file over 25 MB is rejected;
  - uploading the same file twice returns the same asset.
- [ ] E2E: adding an image to an object shows it with its credit; flagging it as a spoiler blurs it in view mode.

### M3-T8 Reference underlay

**Where:** `apps/web/src/render/galaxy/underlay.tsx`, `src/panels/map-settings/`.

- The Map settings panel, opened from the toolbar's Underlay button:
  - choose or upload an image;
  - set its width in the galaxy unit, rotation, X and Z offsets and opacity;
  - turn it on or off.

  These are saved in `maps.underlay` and `maps.underlay_asset_id`.
- The underlay renders only in edit mode, under everything, with depth writes off.

**Done when:**
- [ ] E2E: the underlay is visible in edit mode, invisible in view mode, and its settings persist after a reload.

### M3-T9 Outliner

**Where:** `apps/web/src/panels/outliner/`.

- A tree of the current view's items (flat until M4 adds groups), with a filter box, an "Unplaced" section for places and events without a location (filled by M6), and badges for drafts and spoilers.
- Keyboard: it's an ARIA tree. Arrow keys move, Enter enters (M5), Space selects, Shift extends the selection. Selection syncs both ways with the canvas.
- Shown always in edit mode, and through the "List" button in view mode.

**Done when:**
- [ ] Component tests cover keyboard navigation.
- [ ] E2E: selecting in the outliner selects in 3D and the reverse; axe reports no violations on the shell with the outliner open.

---

## Milestone acceptance

- [ ] All tasks are checked off; CI is green.
- [ ] Performance in edit mode, with the underlay visible and 100 objects selected, still meets the galaxy budget (re-run `pnpm perf` with `--edit`).
- [ ] The owner has built a small real map, for example a dozen systems traced from a reference image, and has filed any friction as issues.

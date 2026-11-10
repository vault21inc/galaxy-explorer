import type { ViewGroup, ViewGroupType } from '@ge/domain';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import {
  conflictsFor,
  moveQuestion,
  parentChoices,
  type Conflict,
} from '@/editor/actions/group.ts';
import { useGroupActions } from '@/editor/actions/use-group-actions.ts';
import { useGroupDialog } from '@/state/group-dialog.ts';
import { useLayers } from '@/state/layers.ts';
import { useSelection } from '@/state/selection.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';

/**
 * "Group the selection" (M4-T2, ux.md §5): a group type, a name, an outline color that follows
 * the type's color until changed, and a parent group of the type's parent type. If selected
 * objects are already in a group of that type, it asks "Move 2 objects from Helican to
 * Ophidian?" first. Saving is one batch; the new group is then selected.
 */
export function GroupDialog({
  mapId,
  universeSlug,
  objectIds,
  groups,
  groupTypes,
}: {
  mapId: string;
  universeSlug: string;
  /** The selected objects in this view. */
  objectIds: readonly string[];
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
}) {
  const open = useGroupDialog((state) => state.open);
  const close = useGroupDialog((state) => state.close);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {open && (
        <DialogContent>
          <GroupForm
            mapId={mapId}
            universeSlug={universeSlug}
            objectIds={objectIds}
            groups={groups}
            groupTypes={groupTypes}
            onDone={close}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function GroupForm({
  mapId,
  universeSlug,
  objectIds,
  groups,
  groupTypes,
  onDone,
}: {
  mapId: string;
  universeSlug: string;
  objectIds: readonly string[];
  groups: readonly ViewGroup[];
  groupTypes: readonly ViewGroupType[];
  onDone: () => void;
}) {
  const id = useId();
  const types = groupTypes.toSorted((a, b) => a.sortKey - b.sortKey);
  const activeLayer = useLayers((state) => state.activeLayer);
  const [typeId, setTypeId] = useState(
    () => (types.find((type) => type.layer === activeLayer) ?? types[0])?.id ?? '',
  );
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [parentId, setParentId] = useState('');
  const [moving, setMoving] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const actions = useGroupActions(groups, groupTypes);

  const type = types.find((item) => item.id === typeId);
  const outlineColor = color ?? type?.defaultColor ?? '#4fd1ff';
  const parents = parentChoices(typeId, groups, groupTypes);
  const count = objectIds.length;

  if (types.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Group the selection</DialogTitle>
          <DialogDescription>
            This universe has no group types yet, such as Sector or Sub-sector.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to={`/u/${universeSlug}/settings`} onClick={onDone}>
              Add group types in Universe settings
            </Link>
          </Button>
        </DialogFooter>
      </>
    );
  }

  const save = async (conflicts: Conflict[]) => {
    setSaving(true);
    try {
      const groupId = await actions.group(
        {
          mapId,
          name: name.trim(),
          groupTypeId: typeId,
          outlineColor,
          parentGroupId: parentId === '' ? null : parentId,
        },
        objectIds,
        conflicts,
      );
      onDone();
      // ux.md §5: the new group is selected.
      if (groupId) useSelection.getState().select([groupId]);
    } catch {
      // useGroupActions showed the reason.
      setSaving(false);
      setMoving(null);
    }
  };

  const submit = () => {
    if (name.trim() === '') {
      setError('Give the group a name.');
      return;
    }
    if (!/^#[0-9a-f]{6}$/i.test(outlineColor)) {
      setError('A color is # and six hex digits, such as #c8a24a.');
      return;
    }
    setError(null);
    const conflicts = conflictsFor(objectIds, typeId, groups);
    if (conflicts.length > 0) setMoving(conflicts);
    else void save([]);
  };

  if (moving) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{moveQuestion(moving, name.trim())}</DialogTitle>
          <DialogDescription>
            An object is in at most one {type?.name.toLowerCase() ?? 'group'} at a time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setMoving(null);
            }}
          >
            Back
          </Button>
          <Button disabled={saving} onClick={() => void save(moving)}>
            Move
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Group {count.toString()} {count === 1 ? 'object' : 'objects'}
        </DialogTitle>
        <DialogDescription>A new group of the selection, with its own outline.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <label htmlFor={`${id}-type`} className="text-muted-foreground">
          Group type
        </label>
        <select
          id={`${id}-type`}
          className={INPUT_CLASS}
          value={typeId}
          onChange={(event) => {
            setTypeId(event.currentTarget.value);
            setParentId('');
          }}
        >
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.layer})
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-name`} className="text-muted-foreground">
          Name
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          className={INPUT_CLASS}
          value={name}
          aria-invalid={error !== null && name.trim() === '' ? true : undefined}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        <label htmlFor={`${id}-color`} className="text-muted-foreground">
          Outline color
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label="Outline color picker"
            value={/^#[0-9a-f]{6}$/i.test(outlineColor) ? outlineColor : '#ffffff'}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
            onChange={(event) => {
              setColor(event.currentTarget.value);
            }}
          />
          <input
            id={`${id}-color`}
            spellCheck={false}
            className={`${INPUT_CLASS} font-mono`}
            value={outlineColor}
            onChange={(event) => {
              setColor(event.currentTarget.value.trim().toLowerCase());
            }}
          />
        </div>
        <label htmlFor={`${id}-parent`} className="text-muted-foreground">
          Parent group
        </label>
        <select
          id={`${id}-parent`}
          className={INPUT_CLASS}
          value={parentId}
          disabled={parents.length === 0}
          onChange={(event) => {
            setParentId(event.currentTarget.value);
          }}
        >
          <option value="">None</option>
          {parents.map((group) => (
            <option key={group.id} value={group.id}>
              {group.namePlain}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          Group
        </Button>
      </DialogFooter>
    </form>
  );
}

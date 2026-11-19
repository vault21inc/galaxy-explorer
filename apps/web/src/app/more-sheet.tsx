import {
  CalendarDays,
  ChevronRight,
  CircleHelp,
  CircleUser,
  Eye,
  EyeOff,
  Layers,
  List,
  Pencil,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { SHEET_ROW } from '@/components/ui/sheet.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useEditor } from '@/state/editor.ts';
import { useSheet, type SheetId } from '@/state/sheet.ts';
import { useSpoilers } from '@/state/spoilers.ts';
import { useAccountEntry } from './account-menu.tsx';

/**
 * The slim bar's More sheet (docs/plan/later/phone-usability.md, "The slim bar"): everything
 * the full bar has on its right, as rows. A row that opens a panel replaces this sheet with
 * that panel's, which has a way back here.
 */
export function MoreSheet() {
  const { mapSlug } = useParams();
  const onMap = mapSlug !== undefined;
  const account = useAccountEntry();
  const close = useSheet((state) => state.close);
  return (
    <div className="flex flex-col">
      {onMap && <EditRow />}
      {onMap && <OpenRow sheet="list" icon={List} label="List" tourName="list" />}
      {onMap && <OpenRow sheet="events" icon={CalendarDays} label="Events" tourName="events" />}
      {onMap && <OpenRow sheet="layers" icon={Layers} label="Layers" tourName="layers" />}
      <SpoilerRow />
      <OpenRow sheet="display" icon={Settings2} label="Display" />
      <OpenRow sheet="help" icon={CircleHelp} label="Help and tours" tourName="help" />
      {account.state === 'signed-in' && (
        <OpenRow sheet="account" icon={CircleUser} label={account.username} />
      )}
      {account.state === 'signed-out' && account.signInHref !== null && (
        <Link to={account.signInHref} className={SHEET_ROW} onClick={close}>
          <CircleUser aria-hidden className="size-5 text-muted-foreground" />
          Sign in
        </Link>
      )}
    </div>
  );
}

/** A row that opens another sheet in this one's place. */
function OpenRow({
  sheet,
  icon: Icon,
  label,
  tourName,
}: {
  sheet: SheetId;
  icon: LucideIcon;
  label: string;
  tourName?: string;
}) {
  const show = useSheet((state) => state.show);
  return (
    <button
      type="button"
      className={SHEET_ROW}
      data-tour={tourName}
      onClick={() => {
        show(sheet);
      }}
    >
      <Icon aria-hidden className="size-5 text-muted-foreground" />
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </button>
  );
}

/** A row holding a switch: the whole row is its label. */
function SwitchRow({
  icon,
  label,
  checked,
  disabled,
  onChange,
  title,
  tourName,
  state,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  tourName?: string;
  /** What the switch's position means, shown beside it ("Hidden"). */
  state?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={SHEET_ROW} title={title} data-tour={tourName}>
      {icon}
      <span className="flex-1">{label}</span>
      {state && <span className="text-xs text-muted-foreground">{state}</span>}
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/** "Spoilers": the full bar's spoiler toggle (ux.md §6), as a switch. */
function SpoilerRow() {
  const showAll = useSpoilers((state) => state.showAll);
  const toggle = useSpoilers((state) => state.toggle);
  const editing = useEditor((state) => state.editing);
  const shown = editing || showAll;
  return (
    <SwitchRow
      icon={
        shown ? (
          <Eye aria-hidden className="size-5 text-muted-foreground" />
        ) : (
          <EyeOff aria-hidden className="size-5 text-muted-foreground" />
        )
      }
      label="Spoilers"
      state={shown ? 'Shown' : 'Hidden'}
      checked={shown}
      disabled={editing}
      title={editing ? 'Edit mode shows every spoiler, marked' : undefined}
      tourName="spoilers"
      onChange={toggle}
    />
  );
}

/**
 * Edit mode, for a reader who may edit here: the full bar's edit toggle. A narrow window with a
 * mouse still edits; the edit toolbar and panels are its own (L3-T4 decides who sees this).
 */
function EditRow() {
  const available = useEditor((state) => state.available);
  const editing = useEditor((state) => state.editing);
  const toggle = useEditor((state) => state.toggle);
  const close = useSheet((state) => state.close);
  if (!available) return null;
  return (
    <SwitchRow
      icon={<Pencil aria-hidden className="size-5 text-muted-foreground" />}
      label="Edit"
      checked={editing}
      tourName="edit-toggle"
      onChange={() => {
        close();
        toggle();
      }}
    />
  );
}

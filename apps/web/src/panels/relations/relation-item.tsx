import { spoilerKeys, toPlainText } from '@ge/domain';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Redactable } from '@/richtext/redactable.tsx';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import type { RelationRead } from './relation-writes.ts';

/** The words that differ between relation types' rows. */
export interface RelationWording {
  /** The role field's placeholder. */
  rolePlaceholder: string;
  /** Beside the spoiler switch. */
  spoilerText: string;
  /** The switch's accessible name, for the other end's name. */
  spoilerLabel: (name: string) => string;
}

/**
 * One relation in a panel section, seen from the panel's entity (M6-T6): the other end's name,
 * which opens it, and the role. In edit mode the role is a text field saved on blur, with the
 * relation's spoiler switch and a remove button. Shared by the typed sections (an event's
 * people) and "Related to".
 */
export function RelationItem({
  relation,
  editing,
  wording,
  detail,
  onOpen,
  onRole,
  onSpoiler,
  onRemove,
}: {
  relation: RelationRead;
  editing: boolean;
  wording: RelationWording;
  /** Muted after the name: an event's date, an entry's kind. */
  detail?: ReactNode;
  onOpen: () => void;
  onRole: (text: string) => void;
  onSpoiler: (isSpoiler: boolean) => void;
  onRemove: () => void;
}) {
  const key = spoilerKeys.relation(relation.id);
  const { other } = relation;
  const roleText = relation.role ? toPlainText(relation.role) : '';
  const nameButton = (
    <button
      type="button"
      className="text-left font-medium hover:text-primary hover:underline"
      onClick={onOpen}
    >
      <Redactable
        flagged={other.isSpoiler || other.nameSpoiler}
        revealKey={spoilerKeys.record(other.id)}
        hiddenText={other.namePlain}
      >
        <span>{other.namePlain}</span>
      </Redactable>
    </button>
  );
  if (editing) {
    return (
      <li className="flex flex-col gap-1 rounded border p-2">
        <div className="flex items-center justify-between gap-2">
          <span>
            {nameButton}
            {detail && <span className="text-muted-foreground"> · {detail}</span>}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${other.namePlain}`}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </div>
        <input
          // Remounted with each saved role, which replaces what's typed.
          key={roleText}
          aria-label={`Role of ${other.namePlain}`}
          placeholder={wording.rolePlaceholder}
          defaultValue={roleText}
          className={INPUT_CLASS}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next !== roleText) onRole(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={relation.isSpoiler}
            aria-label={wording.spoilerLabel(other.namePlain)}
            onCheckedChange={onSpoiler}
          />
          {wording.spoilerText}
        </label>
      </li>
    );
  }
  return (
    <li>
      <Redactable flagged={relation.isSpoiler} revealKey={key} hiddenText={other.namePlain}>
        {nameButton}
        {detail && <span className="text-muted-foreground"> · {detail}</span>}
        {relation.role && (
          <span className="block text-muted-foreground">
            <RichTextView value={relation.role} fieldKey={`${key}/role`} inline />
          </span>
        )}
      </Redactable>
    </li>
  );
}

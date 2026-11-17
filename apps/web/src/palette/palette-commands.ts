import { searchTerms } from '@ge/domain';
import { copyViewLink } from '@/app/copy-view-link.ts';
import { useEditor } from '@/state/editor.ts';
import { useHelp } from '@/state/help.ts';
import { useSpoilers } from '@/state/spoilers.ts';

/**
 * The command palette's commands (M7-T6): what can be done from anywhere by name. Each is a
 * label and what it does; the palette lists those whose words start with the query's.
 */

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void;
}

export interface CommandContext {
  universeSlug: string | undefined;
  /** The map being viewed, if any. */
  mapSlug: string | undefined;
  maps: readonly { slug: string; label: string }[];
  canEdit: boolean;
  editing: boolean;
  showAll: boolean;
  navigate: (path: string) => void;
}

export function paletteCommands(context: CommandContext): PaletteCommand[] {
  const { universeSlug, mapSlug, maps, canEdit, editing, showAll, navigate } = context;
  const commands: PaletteCommand[] = [
    {
      id: 'spoilers',
      label: showAll ? 'Hide spoilers' : 'Show spoilers',
      run: () => {
        useSpoilers.getState().toggle();
      },
    },
  ];
  if (universeSlug !== undefined) {
    for (const map of maps) {
      if (map.slug === mapSlug) continue;
      commands.push({
        id: `map:${map.slug}`,
        label: `Go to map: ${map.label}`,
        run: () => {
          navigate(`/u/${universeSlug}/${map.slug}`);
        },
      });
    }
  }
  if (mapSlug !== undefined) {
    commands.push({
      id: 'copy-view-link',
      label: 'Copy link to this view',
      run: () => {
        void copyViewLink();
      },
    });
  }
  if (mapSlug !== undefined && canEdit) {
    commands.push(
      {
        id: 'new-system',
        label: 'New system',
        run: () => {
          // Edit mode, then the placement ghost, as the Add menu does (ux.md §4).
          useEditor.getState().setEditing(true);
          useEditor.getState().startPlacing('system');
        },
      },
      {
        id: 'edit',
        label: editing ? 'Leave edit mode' : 'Edit this map',
        run: () => {
          useEditor.getState().toggle();
        },
      },
    );
  }
  if (universeSlug !== undefined && canEdit) {
    commands.push({
      id: 'settings',
      label: 'Universe settings',
      run: () => {
        navigate(`/u/${universeSlug}/settings`);
      },
    });
  }
  commands.push(
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      run: () => {
        useHelp.getState().setOpen(true);
      },
    },
    {
      id: 'universes',
      label: 'All universes',
      run: () => {
        // Not `/`: a signed-out visitor there goes to the site's home universe (D-51).
        navigate('/universes');
      },
    },
  );
  return commands;
}

/** Whether every word of the query starts a word of the label, as search matches. */
export function commandMatches(label: string, query: string): boolean {
  const words = searchTerms(label);
  return searchTerms(query).every((term) => words.some((word) => word.startsWith(term)));
}

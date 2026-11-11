import { useRef } from 'react';
import { objectTypes } from '@ge/domain';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { levels } from '@/levels/registry.ts';
import { useEditor } from '@/state/editor.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { placeableTypes } from './placeable-types.ts';

/**
 * Add ▾ (ux.md §5): the base types allowed in the view being edited (the galaxy, or a system:
 * stars, planets, belts…), then a click on the plane places one. N opens it from the keyboard.
 * Subtypes join in M7.
 */
export function AddMenu() {
  const level = useNavigation(topView)?.level ?? 'galaxy';
  const open = useEditor((state) => state.addMenuOpen);
  const setOpen = useEditor((state) => state.setAddMenuOpen);
  // A type was chosen: the menu mustn't take focus back when it finishes closing.
  const chose = useRef(false);
  const startPlacing = useEditor((state) => state.startPlacing);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" title="Add an object (N)">
          <Plus aria-hidden />
          Add
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        // Once a type is chosen, focus doesn't go back to the Add button: the menu returns it at
        // the end of its closing animation, which can come after a quick click has created the
        // object and focused its name field.
        onCloseAutoFocus={(event) => {
          if (chose.current) event.preventDefault();
          chose.current = false;
        }}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground label-caps">
          {levels[level].edit?.addLabel ?? 'Add'}
        </DropdownMenuLabel>
        {placeableTypes(level).map((type) => (
          <DropdownMenuItem
            key={type}
            onSelect={() => {
              chose.current = true;
              startPlacing(type);
            }}
          >
            {objectTypes[type].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

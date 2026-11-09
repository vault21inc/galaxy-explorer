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
import { useEditor } from '@/state/editor.ts';
import { placeableTypes } from './placeable-types.ts';

/**
 * Add ▾ (ux.md §5): the base types allowed in the galaxy view, then a click on the plane
 * places one. N opens it from the keyboard. Subtypes join in M7.
 */
export function AddMenu() {
  const open = useEditor((state) => state.addMenuOpen);
  const setOpen = useEditor((state) => state.setAddMenuOpen);
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
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground label-caps">
          Add to the galaxy
        </DropdownMenuLabel>
        {placeableTypes('galaxy').map((type) => (
          <DropdownMenuItem
            key={type}
            onSelect={() => {
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

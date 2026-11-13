import { useRef } from 'react';
import { entityKinds, objectTypes, type BaseType } from '@ge/domain';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { useConfigList } from '@/api/hooks.ts';
import { useEditView } from '@/levels/use-edit-view.ts';
import { levels } from '@/levels/registry.ts';
import { useEditor } from '@/state/editor.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { placeableTypes } from './placeable-types.ts';

/**
 * Add ▾ (ux.md §5): the base types allowed in the view being edited (the galaxy, or a system:
 * stars, planets, belts…), then a click on the plane places one. N opens it from the keyboard.
 * A base type the universe has subtypes for opens a submenu (M7-T2): the plain type first, then
 * each subtype in the settings' order ("Planet ▸ Hive World"). A subtype's defaults (its look,
 * through `resolveAppearance`) apply to what it places.
 */
export function AddMenu() {
  const level = useNavigation(topView)?.level ?? 'galaxy';
  const open = useEditor((state) => state.addMenuOpen);
  const setOpen = useEditor((state) => state.setAddMenuOpen);
  // A type was chosen: the menu mustn't take focus back when it finishes closing.
  const chose = useRef(false);
  const startPlacing = useEditor((state) => state.startPlacing);
  const startPlacingLocated = useEditor((state) => state.startPlacingLocated);
  // Places and events (M6-T5): on the globe, or an event at a point in space.
  const located = levels[level].edit?.located;
  const universeId = useEditView()?.payload?.map.universeId;
  const subtypes = useConfigList('object_subtypes', universeId).data ?? [];
  const place = (type: BaseType, subtypeId: string | null = null) => {
    chose.current = true;
    startPlacing(type, subtypeId);
  };
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
        {placeableTypes(level).map((type) => {
          const ofType = subtypes.filter((subtype) => subtype.baseType === type);
          if (ofType.length === 0) {
            return (
              <DropdownMenuItem
                key={type}
                onSelect={() => {
                  place(type);
                }}
              >
                {objectTypes[type].label}
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuSub key={type}>
              <DropdownMenuSubTrigger>{objectTypes[type].label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent aria-label={`${objectTypes[type].label} subtypes`}>
                <DropdownMenuItem
                  onSelect={() => {
                    place(type);
                  }}
                >
                  {objectTypes[type].label}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {ofType.map((subtype) => (
                  <DropdownMenuItem
                    key={subtype.id}
                    onSelect={() => {
                      place(type, subtype.id);
                    }}
                  >
                    {subtype.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
        {located && (
          <>
            <DropdownMenuSeparator />
            {located.kinds.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => {
                  chose.current = true;
                  startPlacingLocated(kind);
                }}
              >
                {located.mode === 'surface'
                  ? entityKinds[kind].label.one
                  : `${entityKinds[kind].label.one} here`}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

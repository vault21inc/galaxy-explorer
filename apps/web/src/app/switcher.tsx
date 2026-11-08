import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';

export interface SwitcherOption {
  value: string;
  label: string;
}

interface SwitcherProps {
  /** What is being switched, such as "Universe": the menu's heading and the button's prefix. */
  label: string;
  value: string;
  current: string;
  options: readonly SwitcherOption[];
  onSelect: (value: string) => void;
  /** Extra items under a separator, such as a link to every universe. */
  footer?: ReactNode;
}

/**
 * A top-bar menu that picks one of several (ux.md §1): the universe and map switchers. Radix
 * gives it arrow-key navigation, type-ahead and focus return.
 */
export function Switcher({ label, value, current, options, onSelect, footer }: SwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="pointer-events-auto gap-1 px-2">
          {/* The visible text stays part of the name, so speech input can say what it sees. */}
          <span className="sr-only">{label}: </span>
          {current}
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground label-caps">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onSelect}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {footer && (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

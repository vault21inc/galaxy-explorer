import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { BAR_BUTTON, BAR_TEXT } from '@/app/bar-classes.ts';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { EventsList } from './events-list.tsx';

/** The Events panel in the top bar (M6-T7, ux.md §1): the list (events-list.tsx) in a popover. */
export function EventsPopover() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${BAR_BUTTON} gap-1.5`}
          data-tour="events"
          title="Events"
        >
          <CalendarDays aria-hidden />
          <span className={BAR_TEXT}>Events</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Events"
        className="flex max-h-[70dvh] w-96 flex-col gap-2 text-sm"
      >
        <EventsList
          active={open}
          onChose={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

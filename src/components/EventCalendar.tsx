import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Event } from "@/types/event";

interface EventCalendarProps {
  date: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  events: Event[];
}

const EventCalendar = ({ date, onDateSelect, events }: EventCalendarProps) => {
  const getEventCountForDate = (date: Date) => {
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateStr = localDate.toLocaleDateString('en-CA');
    return events.filter((event) => event.date === dateStr).length;
  };

  return (
    <Card className="p-6">
      <Calendar
        mode="single"
        selected={date}
        onSelect={onDateSelect}
        className="rounded-md border w-full"
        components={{
          DayContent: ({ date }) => {
            const count = getEventCountForDate(date);
            return (
              <div className="relative w-full h-full flex items-center justify-center">
                {date.getDate()}
                {count > 0 && (
                  <div className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs">
                    {count}
                  </div>
                )}
              </div>
            );
          },
        }}
      />
    </Card>
  );
};

export default EventCalendar;
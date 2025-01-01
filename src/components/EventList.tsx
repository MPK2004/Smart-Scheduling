import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { Event } from "@/types/event";

interface EventListProps {
  events: Event[];
  onEditEvent: (event: Event) => void;
  onDeleteEvent: (eventId: string) => void;
}

const getCategoryColor = (category: string) => {
  switch (category) {
    case "work":
      return "bg-blue-500";
    case "personal":
      return "bg-green-500";
    case "family":
      return "bg-purple-500";
    case "health":
      return "bg-red-500";
    case "social":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
};

const EventList = ({ events, onEditEvent, onDeleteEvent }: EventListProps) => {
  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <p className="text-muted-foreground">No events scheduled for this day</p>
      ) : (
        events.map((event) => (
          <div 
            key={event.id} 
            className="p-4 border rounded-lg bg-card hover:bg-accent transition-colors group"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium">{event.title}</h3>
                  {event.category && (
                    <Badge variant="secondary" className={`${getCategoryColor(event.category)} text-white`}>
                      {event.category}
                    </Badge>
                  )}
                  {event.recurrence && event.recurrence !== "none" && (
                    <Badge variant="outline">
                      {event.recurrence}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(`${event.date}T${event.time}`).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {event.description && (
                  <p className="text-sm mt-2 text-muted-foreground">{event.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onEditEvent(event)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDeleteEvent(event.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default EventList;
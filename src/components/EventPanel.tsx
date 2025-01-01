import { Card } from "@/components/ui/card";
import EventSearch from "./EventSearch";
import EventFilters from "./EventFilters";
import EventList from "./EventList";
import { Event } from "@/types/event";

interface EventPanelProps {
  date: Date | undefined;
  events: Event[];
  categories: string[];
  selectedCategories: string[];
  searchQuery: string;
  onSearch: (query: string) => void;
  onCategoryToggle: (category: string) => void;
  onEditEvent: (event: Event) => void;
  onDeleteEvent: (eventId: string) => void;
}

const EventPanel = ({
  date,
  events,
  categories,
  selectedCategories,
  searchQuery,
  onSearch,
  onCategoryToggle,
  onEditEvent,
  onDeleteEvent,
}: EventPanelProps) => {
  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-semibold mb-4">
        {formatDate(date)} Events
      </h2>
      
      <div className="space-y-4">
        <EventSearch onSearch={onSearch} />
        
        {categories.length > 0 && (
          <EventFilters
            categories={categories}
            selectedCategories={selectedCategories}
            onCategoryToggle={onCategoryToggle}
          />
        )}
        
        <EventList
          events={events}
          onEditEvent={onEditEvent}
          onDeleteEvent={onDeleteEvent}
        />
      </div>
    </Card>
  );
};

export default EventPanel;
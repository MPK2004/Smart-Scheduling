import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AddEventDialog from "@/components/AddEventDialog";
import EditEventDialog from "@/components/EditEventDialog";
import EventCalendar from "@/components/EventCalendar";
import EventPanel from "@/components/EventPanel";
import QuickActions from "@/components/QuickActions";
import { Event } from "@/types/event";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useEventManager } from "@/components/EventManager";

const Index = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const { events, addEvent, updateEvent, deleteEvent } = useEventManager();

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const getEventsForDate = useCallback((date: Date | undefined) => {
    if (!date) return [];
    
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateStr = localDate.toLocaleDateString('en-CA');
    
    return events
      .filter((event) => {
        const matchesDate = event.date === dateStr;
        const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            event.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategories.length === 0 || 
                              (event.category && selectedCategories.includes(event.category));
        
        return matchesDate && matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [events, searchQuery, selectedCategories]);

  const handleEditClick = (event: Event) => {
    setSelectedEvent(event);
    setIsEditEventOpen(true);
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const categories = Array.from(new Set(events.map((event) => event.category).filter(Boolean))) as string[];
  const selectedDateEvents = getEventsForDate(date);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Smart Schedule</h1>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <EventCalendar
            date={date}
            onDateSelect={handleDateSelect}
            events={events}
          />

          <EventPanel
            date={date}
            events={selectedDateEvents}
            categories={categories}
            selectedCategories={selectedCategories}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onCategoryToggle={handleCategoryToggle}
            onEditEvent={handleEditClick}
            onDeleteEvent={deleteEvent}
          />
        </div>

        <QuickActions onAddEvent={() => setIsAddEventOpen(true)} />

        <AddEventDialog 
          open={isAddEventOpen} 
          onOpenChange={setIsAddEventOpen}
          onSubmit={addEvent}
          selectedDate={date}
        />

        <EditEventDialog
          open={isEditEventOpen}
          onOpenChange={setIsEditEventOpen}
          onSubmit={updateEvent}
          event={selectedEvent}
        />
      </div>
    </div>
  );
};

export default Index;
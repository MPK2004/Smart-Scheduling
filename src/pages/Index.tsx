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
import { UserCircle } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [guestEvents, setGuestEvents] = useState<Event[]>([]);
  const [isGuestMode, setIsGuestMode] = useState(false);

  const { events, addEvent, updateEvent, deleteEvent } = useEventManager();

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleGuestMode = () => {
    setIsGuestMode(true);
    toast.success("Entered guest mode - events will not be saved");
  };

  const handleGuestAddEvent = (newEvent: Omit<Event, "id">) => {
    const guestEvent = {
      ...newEvent,
      id: crypto.randomUUID(),
    };
    setGuestEvents((prev) => [...prev, guestEvent]);
    toast.success("Event added (guest mode)");
  };

  const handleGuestUpdateEvent = (updatedEvent: Event) => {
    setGuestEvents((prev) =>
      prev.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
    );
    toast.success("Event updated (guest mode)");
  };

  const handleGuestDeleteEvent = (eventId: string) => {
    setGuestEvents((prev) => prev.filter((event) => event.id !== eventId));
    toast.success("Event deleted (guest mode)");
  };

  const getEventsForDate = useCallback((date: Date | undefined) => {
    if (!date) return [];
    
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateStr = localDate.toLocaleDateString('en-CA');
    
    const currentEvents = isGuestMode ? guestEvents : events;
    
    return currentEvents
      .filter((event) => {
        const matchesDate = event.date === dateStr;
        const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            event.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategories.length === 0 || 
                              (event.category && selectedCategories.includes(event.category));
        
        return matchesDate && matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [events, guestEvents, searchQuery, selectedCategories, isGuestMode]);

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

  const categories = Array.from(
    new Set(
      (isGuestMode ? guestEvents : events)
        .map((event) => event.category)
        .filter(Boolean)
    )
  ) as string[];
  
  const selectedDateEvents = getEventsForDate(date);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Smart Schedule</h1>
          <div className="flex gap-4">
            {!isGuestMode && (
              <Button variant="outline" onClick={handleGuestMode}>
                <UserCircle className="mr-2" />
                Guest Mode
              </Button>
            )}
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <EventCalendar
            date={date}
            onDateSelect={handleDateSelect}
            events={isGuestMode ? guestEvents : events}
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
            onDeleteEvent={isGuestMode ? handleGuestDeleteEvent : deleteEvent}
          />
        </div>

        <QuickActions onAddEvent={() => setIsAddEventOpen(true)} />

        <AddEventDialog 
          open={isAddEventOpen} 
          onOpenChange={setIsAddEventOpen}
          onSubmit={isGuestMode ? handleGuestAddEvent : addEvent}
          selectedDate={date}
        />

        <EditEventDialog
          open={isEditEventOpen}
          onOpenChange={setIsEditEventOpen}
          onSubmit={isGuestMode ? handleGuestUpdateEvent : updateEvent}
          event={selectedEvent}
        />
      </div>
    </div>
  );
};

export default Index;

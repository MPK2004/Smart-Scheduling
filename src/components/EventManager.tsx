import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Event } from "@/types/event";
import { supabase } from "@/integrations/supabase/client";

export const useEventManager = () => {
  const [events, setEvents] = useState<Event[]>([]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*');

    if (error) {
      toast.error("Failed to fetch events");
      console.error("Error fetching events:", error);
      return;
    }

    setEvents(data.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description || '',
      date: new Date(event.start_date).toLocaleDateString('en-CA'),
      time: new Date(event.start_date).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      }),
      category: event.category || '',
      recurrence: event.recurrence || 'none'
    })));
  };

  const addEvent = async (newEvent: Omit<Event, "id">) => {
    const startDate = new Date(`${newEvent.date}T${newEvent.time}`);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in to add events");
      return;
    }

    const { error } = await supabase
      .from('events')
      .insert([{
        title: newEvent.title,
        description: newEvent.description,
        start_date: startDate.toISOString(),
        category: newEvent.category,
        recurrence: newEvent.recurrence,
        user_id: user.id  // Add this line to set the user_id
      }]);

    if (error) {
      toast.error("Failed to add event");
      console.error("Error adding event:", error);
      return;
    }

    await fetchEvents();
    toast.success("Event added successfully!");
  };

  const updateEvent = async (updatedEvent: Event) => {
    const startDate = new Date(`${updatedEvent.date}T${updatedEvent.time}`);
    
    const { error } = await supabase
      .from('events')
      .update({
        title: updatedEvent.title,
        description: updatedEvent.description,
        start_date: startDate.toISOString(),
        category: updatedEvent.category,
        recurrence: updatedEvent.recurrence
      })
      .eq('id', updatedEvent.id);

    if (error) {
      toast.error("Failed to update event");
      console.error("Error updating event:", error);
      return;
    }

    await fetchEvents();
    toast.success("Event updated successfully!");
  };

  const deleteEvent = async (eventId: string) => {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      toast.error("Failed to delete event");
      console.error("Error deleting event:", error);
      return;
    }

    await fetchEvents();
    toast.success("Event deleted successfully!");
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  return {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
  };
};
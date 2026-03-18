import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Event } from "@/types/event";
import { CalendarRange, Trash2, CalendarOff } from "lucide-react";

interface DeleteRecurringDialogProps {
  eventToDelete: { event: Event; targetDateStr: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleteOption: (option: 'this' | 'future' | 'all') => void;
}

const DeleteRecurringDialog = ({ eventToDelete, onOpenChange, onDeleteOption }: DeleteRecurringDialogProps) => {
  return (
    <Dialog open={!!eventToDelete} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Recurring Event</DialogTitle>
          <DialogDescription>
            This event repeats. How do you want to delete it?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          <Button 
            variant="outline" 
            className="flex justify-start gap-4 h-14"
            onClick={() => onDeleteOption('this')}
          >
            <CalendarOff className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold text-foreground">This event only</span>
              <span className="text-xs text-muted-foreground">Keep all other occurrences intact</span>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="flex justify-start gap-4 h-14"
            onClick={() => onDeleteOption('future')}
          >
            <CalendarRange className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold text-foreground">This and following events</span>
              <span className="text-xs text-muted-foreground">Stop repeating from this date forward</span>
            </div>
          </Button>

          <Button 
            variant="destructive" 
            className="flex justify-start gap-4 h-14"
            onClick={() => onDeleteOption('all')}
          >
            <Trash2 className="h-5 w-5" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">All events</span>
              <span className="text-xs opacity-90">Delete exactly every instance forever</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteRecurringDialog;

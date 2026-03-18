import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseEventFromAI, ParsedEvent } from "@/lib/ai";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface TextInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (event: ParsedEvent) => void;
}

const TextInputDialog = ({ open, onOpenChange, onParsed }: TextInputDialogProps) => {
  const [text, setText] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsParsing(true);
    try {
      const parsedEvent = await parseEventFromAI(text, "text");
      if (parsedEvent) {
        onParsed(parsedEvent);
        onOpenChange(false);
        setText("");
      } else {
        toast.error("Could not understand event details. True manually.");
      }
    } catch (error) {
      toast.error("Something went wrong.");
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Smart Event Creation</DialogTitle>
          <DialogDescription>
            Type your event details naturally. For example: "Lunch with Sarah tomorrow at 12pm for 1 hour".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="Describe your event..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isParsing}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={isParsing || !text.trim()}>
              {isParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isParsing ? "Analyzing..." : "Process Text"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TextInputDialog;

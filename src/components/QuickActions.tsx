import { Button } from "@/components/ui/button";
import { Plus, Mic, Image, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface QuickActionsProps {
  onAddEvent: () => void;
}

const QuickActions = ({ onAddEvent }: QuickActionsProps) => {
  return (
    <div className="fixed bottom-8 right-8 flex flex-col gap-4">
      <Button
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={() => toast.info("Voice input will be available soon!")}
      >
        <Mic className="h-6 w-6" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={() => toast.info("Image upload will be available soon!")}
      >
        <Image className="h-6 w-6" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={() => toast.info("Text input will be available soon!")}
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
      <Button
        size="icon"
        className="rounded-full bg-primary hover:bg-primary/90"
        onClick={onAddEvent}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default QuickActions;
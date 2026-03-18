import { Button } from "@/components/ui/button";
import { Plus, Mic, Image, MessageSquare } from "lucide-react";

interface QuickActionsProps {
  onAddEvent: () => void;
  onVoiceClick: () => void;
  onImageClick: () => void;
  onTextClick: () => void;
}

const QuickActions = ({ onAddEvent, onVoiceClick, onImageClick, onTextClick }: QuickActionsProps) => {
  return (
    <div className="fixed bottom-8 right-8 flex flex-col gap-4">
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-md"
        onClick={onVoiceClick}
      >
        <Mic className="h-6 w-6 text-primary" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-md"
        onClick={onImageClick}
      >
        <Image className="h-6 w-6 text-primary" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-md"
        onClick={onTextClick}
      >
        <MessageSquare className="h-6 w-6 text-primary" />
      </Button>
      <Button
        size="icon"
        className="rounded-full bg-primary hover:bg-primary/90 shadow-lg ml-auto w-14 h-14"
        onClick={onAddEvent}
      >
        <Plus className="h-8 w-8" />
      </Button>
    </div>
  );
};

export default QuickActions;
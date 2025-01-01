import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface EventSearchProps {
  onSearch: (query: string) => void;
}

const EventSearch = ({ onSearch }: EventSearchProps) => {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search events..."
        className="pl-8"
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
};

export default EventSearch;
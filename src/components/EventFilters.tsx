import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EventFiltersProps {
  categories: string[];
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
}

const EventFilters = ({ categories, selectedCategories, onCategoryToggle }: EventFiltersProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <Button
          key={category}
          variant={selectedCategories.includes(category) ? "default" : "outline"}
          size="sm"
          onClick={() => onCategoryToggle(category)}
        >
          {category}
        </Button>
      ))}
    </div>
  );
};

export default EventFilters;
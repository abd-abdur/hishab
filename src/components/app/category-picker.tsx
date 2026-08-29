import { CategoryDot } from "@/components/app/category-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CategoryOption = {
  id: string;
  name: string;
  color: string;
  kind: "expense" | "income" | "transfer";
};

export function CategoryPicker({
  categories,
  value,
  onChange,
  size = "default",
}: {
  categories: CategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  size?: "sm" | "default";
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={
          size === "sm" ? "h-7 w-40 border-0 bg-transparent px-1.5 text-xs shadow-none" : "w-48"
        }
      >
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <span className="flex items-center gap-2">
              <CategoryDot color={category.color} />
              {category.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

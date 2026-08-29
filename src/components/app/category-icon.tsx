import {
  ArrowLeftRight,
  Banknote,
  Car,
  CircleDashed,
  Clapperboard,
  Fuel,
  HeartPulse,
  House,
  Plane,
  PlugZap,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Tag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { chartColor } from "@/lib/categories";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  car: Car,
  fuel: Fuel,
  "shopping-bag": ShoppingBag,
  "plug-zap": PlugZap,
  smartphone: Smartphone,
  house: House,
  "heart-pulse": HeartPulse,
  clapperboard: Clapperboard,
  plane: Plane,
  receipt: Receipt,
  "arrow-left-right": ArrowLeftRight,
  banknote: Banknote,
  "circle-dashed": CircleDashed,
  tag: Tag,
};

export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color?: string;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? CircleDashed;
  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      style={color ? { color: chartColor(color) } : undefined}
      aria-hidden
    />
  );
}

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: chartColor(color) }}
      aria-hidden
    />
  );
}

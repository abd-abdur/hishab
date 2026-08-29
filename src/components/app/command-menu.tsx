import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const PAGES = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/app/statements", label: "Statements", icon: FileText },
  { to: "/app/recurring", label: "Recurring", icon: CalendarClock },
  { to: "/app/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/app/reports", label: "Reports", icon: ChartColumn },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or search transactions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((page) => (
            <CommandItem key={page.to} onSelect={() => go(page.to)}>
              <page.icon className="size-4" />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/app/statements")}>
            <Upload className="size-4" />
            Upload statements
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

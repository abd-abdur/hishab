import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Search,
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

/** Anything can open the palette by dispatching this event (sidebar Search button). */
export const OPEN_COMMAND_MENU_EVENT = "hishab:open-command-menu";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    void navigate({ to });
  };

  const searchTransactions = () => {
    const q = query.trim();
    setOpen(false);
    void navigate({ to: "/app/transactions", search: q ? { q } : {} });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Jump to a page or search transactions…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {query.trim() ? (
          <CommandGroup heading="Transactions">
            <CommandItem value={`search-${query}`} onSelect={searchTransactions}>
              <Search className="size-4" />
              Search transactions for “{query.trim()}”
            </CommandItem>
          </CommandGroup>
        ) : null}
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

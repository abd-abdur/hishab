import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Search as SearchIcon,
  Settings,
} from "lucide-react";

import { OPEN_COMMAND_MENU_EVENT } from "@/components/app/command-menu";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth-client";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/app/statements", label: "Statements", icon: FileText },
  { to: "/app/recurring", label: "Recurring", icon: CalendarClock },
  { to: "/app/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/app/reports", label: "Reports", icon: ChartColumn },
] as const;

export function AppSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const initials =
    user.name
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/app" className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary font-display text-base font-semibold text-primary-foreground">
            h
          </span>
          <span className="font-display text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            hishab
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search (⌘K)"
                  onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT))}
                >
                  <SearchIcon />
                  <span className="flex flex-1 items-center justify-between">
                    Search
                    <kbd className="rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">
                      ⌘K
                    </kbd>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {NAV.map((item) => {
                const active =
                  "exact" in item && item.exact
                    ? pathname === item.to
                    : pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/app/settings")}
              tooltip="Settings"
            >
              <Link to="/app/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={user.name}>
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{user.name}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <Globe className="size-4" />
                    Home page
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void signOut().then(() => navigate({ to: "/login" }));
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app/app-sidebar";
import { CommandMenu } from "@/components/app/command-menu";
import { IdleLogout } from "@/components/app/idle-logout";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSessionFn } from "@/lib/auth-middleware";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar user={{ name: session.name, email: session.email }} />
      <SidebarInset id="main">
        <Outlet />
      </SidebarInset>
      <CommandMenu />
      <IdleLogout />
    </SidebarProvider>
  );
}

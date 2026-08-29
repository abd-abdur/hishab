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
      <AppSidebar user={{ name: session.name, email: session.email }} />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <CommandMenu />
      <IdleLogout />
    </SidebarProvider>
  );
}

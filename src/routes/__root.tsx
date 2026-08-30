import "@fontsource-variable/inter";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * A tab opened before a deploy asks for route chunks the new deploy no longer
 * serves; the import fails and lands here. One automatic reload fetches the
 * fresh build, so the person never sees an error screen for a stale tab.
 * The sessionStorage latch stops a reload loop when the error is real.
 */
function isStaleChunkError(error: Error): boolean {
  return /dynamically imported module|Loading chunk|error loading|Importing a module script failed|Failed to fetch/i.test(
    `${error.name} ${error.message}`,
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  if (typeof window !== "undefined" && isStaleChunkError(error)) {
    let reloaded = false;
    try {
      reloaded = sessionStorage.getItem("hishab-chunk-reload") === "1";
      if (!reloaded) sessionStorage.setItem("hishab-chunk-reload", "1");
    } catch {
      /* storage unavailable; fall through to the error screen */
      reloaded = true;
    }
    if (!reloaded) {
      window.location.reload();
      return null;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hishab · every dirham, accounted for" },
      {
        name: "description",
        content:
          "Upload your bank statements, whether PDF, scans, CSV or Excel, and Hishab turns them into searchable transactions, budgets and trends. Built AED-first, fluent in any currency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico?v=3", sizes: "256x256" },
      { rel: "icon", href: "/icon-32.png?v=3", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=3", sizes: "180x180" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          // restore the saved theme before first paint to avoid a flash
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("hishab-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // a page rendered, so the build in this tab is coherent again; re-arm the
  // stale-chunk auto-reload for the next deploy
  useEffect(() => {
    try {
      sessionStorage.removeItem("hishab-chunk-reload");
    } catch {
      /* storage unavailable */
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
      {/* Vercel Web Analytics + Speed Insights — cookieless, page views and
          Core Web Vitals only; no-ops outside Vercel deployments */}
      <Analytics />
      <SpeedInsights />
    </QueryClientProvider>
  );
}

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // start loading the next page's code the moment a link is hovered/touched
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};

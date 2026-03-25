export const appRoutes = {
  login: "/login",
  dashboard: "/dashboard",
  create: "/create",
  editor: "/editor",
} as const;

export const legacyAppRouteAliases = {
  // Deprecated creation entrypoint kept only as a redirect/compatibility alias.
  creationFlow: "/wizard",
} as const;

export const protectedAppRoutes = [
  appRoutes.dashboard,
  appRoutes.create,
  appRoutes.editor,
  legacyAppRouteAliases.creationFlow,
] as const;

export function isProtectedAppPathname(pathname: string) {
  return protectedAppRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const appRoutes = {
  login: "/login",
  dashboard: "/dashboard",
  create: "/create",
  wizard: "/wizard",
  editor: "/editor",
} as const;

export const protectedAppRoutes = [
  appRoutes.dashboard,
  appRoutes.create,
  appRoutes.wizard,
  appRoutes.editor,
] as const;

export function isProtectedAppPathname(pathname: string) {
  return protectedAppRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

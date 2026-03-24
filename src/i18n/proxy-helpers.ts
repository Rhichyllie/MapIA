import { appRoutes } from "../lib/routes";
import {
  buildLocalizedPathname,
  resolveLocaleFromPathname,
  type AppLocale,
} from "./routing";

export function resolveProxyLocale(pathname: string): AppLocale {
  return resolveLocaleFromPathname(pathname);
}

export function buildProtectedLoginRedirect(input: {
  requestUrl: string;
  resolvedPathname: string;
  requestPathname: string;
  requestSearch: string;
}) {
  const locale = resolveProxyLocale(input.resolvedPathname);
  const loginPathname = buildLocalizedPathname(appRoutes.login, locale);
  const loginUrl = new URL(loginPathname, input.requestUrl);
  const callbackUrl = `${input.requestPathname}${input.requestSearch}`;

  loginUrl.searchParams.set("callbackUrl", callbackUrl);

  return loginUrl;
}

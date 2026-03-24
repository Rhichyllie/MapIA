export function resolvePostLoginNavigationTarget(input: {
  callbackUrl: string;
  resultUrl?: string | null;
  currentOrigin: string;
}) {
  const rawTarget = input.resultUrl ?? input.callbackUrl;

  try {
    const resolvedUrl = new URL(rawTarget, input.currentOrigin);

    if (resolvedUrl.origin === input.currentOrigin) {
      return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
    }

    return resolvedUrl.toString();
  } catch {
    return input.callbackUrl;
  }
}

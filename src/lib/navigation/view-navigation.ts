const extendedViewOnlyRoutes = ["/users", "/offline-players"];

export function getViewSwitchDestination(pathname: string, enablingSimpleView: boolean) {
  if (!enablingSimpleView) return null;

  const isExtendedViewOnlyRoute = extendedViewOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return isExtendedViewOnlyRoute ? "/stations" : null;
}

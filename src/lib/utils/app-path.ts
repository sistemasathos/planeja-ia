/** URL path no browser com prefixo Vite `base` (ex.: `/planeja-ia/login` no GitHub Pages). */
export function appPath(path: string): string {
  const segment = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/") return segment;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}${segment}`;
}

export function appOriginPath(path: string): string {
  if (typeof window === "undefined") return appPath(path);
  return `${window.location.origin}${appPath(path)}`;
}

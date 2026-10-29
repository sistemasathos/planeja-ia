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

/** Normaliza `?redirect=` do login (URL completa ou path com base) → rota interna do router. */
export function redirectPathAfterLogin(raw?: string): string {
  const fallback = "/dashboard";
  if (!raw?.trim()) return fallback;

  let path = raw.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      if (typeof window !== "undefined" && u.origin !== window.location.origin) {
        return fallback;
      }
      path = u.pathname + u.search + u.hash;
    } catch {
      return fallback;
    }
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (base) {
    if (path.startsWith(`${base}/`)) path = path.slice(base.length);
    else if (path === base) path = "/";
  }

  return path.startsWith("/") ? path : fallback;
}

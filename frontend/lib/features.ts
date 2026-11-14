/**
 * Feature flags. Next.js inlines `NEXT_PUBLIC_*` at build time, so flipping a flag needs a
 * rebuild (a redeploy on Vercel).
 */

/**
 * Living sky, Candidates, Discoveries, Journal, Login and the Spectral lab page. Hidden by
 * default to keep the product on one flow (observatory → time explorer); set
 * `NEXT_PUBLIC_SHOW_EXTRA_PAGES=true` to bring them back exactly as they were.
 */
export const SHOW_EXTRA_PAGES = process.env.NEXT_PUBLIC_SHOW_EXTRA_PAGES === "true";

/** Locale-less paths (and their sub-paths) that exist only when `SHOW_EXTRA_PAGES` is on. */
export const EXTRA_PAGE_PATHS = ["/living-sky", "/candidates", "/discoveries", "/journal", "/login", "/spectral-lab"] as const;

/** True when `pathname` (locale-less) is one of the extra pages or below one. */
export function isExtraPage(pathname: string): boolean {
  return EXTRA_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

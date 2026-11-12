import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, type NextResponse } from "next/server";
import { splitLocale } from "./i18n/paths";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);

const isJournal = (pathname: string) => pathname === "/journal" || pathname.startsWith("/journal/");

/**
 * 1. Language: the URL prefix or the remembered `NEXT_LOCALE` cookie decide; the browser
 *    language is ignored on purpose so a first visit is always English.
 * 2. Route guard: only the journal needs a Supabase session; exploration and analysis stay public.
 */
export async function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("accept-language");
  const req = new NextRequest(request, { headers });

  const response: NextResponse = intl(req);
  if (response.headers.has("location")) return response;

  const { locale, pathname } = splitLocale(request.nextUrl.pathname);
  if (
    isJournal(pathname) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const { updateSession } = await import("./lib/supabase/middleware");
    return updateSession(req, response, { locale, pathname });
  }
  return response;
}

export const config = {
  // Every page route; skips API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

/** Supabase session refresh + route guard (official @supabase/ssr pattern). */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";

/**
 * Refreshes the session cookies onto the i18n `response` and redirects anonymous users to the
 * login page of their language. `next` is the locale-less path, resolved again after sign-in.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
  route: { locale: Locale; pathname: string },
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  // getUser() validates the session with the Supabase server (secure).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(route.locale, "/login");
    url.searchParams.set("next", route.pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

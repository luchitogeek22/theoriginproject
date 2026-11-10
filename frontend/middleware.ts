import { NextResponse, type NextRequest } from "next/server";

/** Route guard: active Supabase session required for research routes.
 * When Supabase is not configured the app stays usable in anonymous mode. */
export async function middleware(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }
  const { updateSession } = await import("./lib/supabase/middleware");
  return updateSession(request);
}

export const config = {
  matcher: ["/time-explorer", "/journal", "/journal/:path*", "/discoveries"],
};

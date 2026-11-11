import { NextResponse, type NextRequest } from "next/server";

/** Route guard: only the journal needs a Supabase session; exploration and analysis stay public. */
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
  matcher: ["/journal", "/journal/:path*"],
};

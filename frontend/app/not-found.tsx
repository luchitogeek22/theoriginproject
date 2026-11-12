"use client";

import NextError from "next/error";

/** Requests outside the locale middleware (rare); localized 404s live in `app/[locale]/not-found.tsx`. */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <NextError statusCode={404} />
      </body>
    </html>
  );
}

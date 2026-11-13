import { notFound } from "next/navigation";

/** Unknown paths render the localized 404 of `app/[locale]/not-found.tsx`. */
export default function CatchAll(): never {
  notFound();
}

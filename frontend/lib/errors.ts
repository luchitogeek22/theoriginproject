import { useTranslations } from "next-intl";
import type lib from "@/locales/en/lib.json";

export type ErrorCode = keyof typeof lib.errors;
export type ErrorValues = Record<string, string | number>;

/**
 * Error raised by app code. `code` names a translated message (`errors.<code>`); without a
 * code the message came from the server and is shown verbatim. `message` stays in English
 * for logs.
 */
export class TranslatableError extends Error {
  readonly code?: ErrorCode;
  readonly values?: ErrorValues;
  constructor(message: string, code?: ErrorCode, values?: ErrorValues) {
    super(message);
    this.code = code;
    this.values = values;
  }
}

/** Turns any caught error into user-facing text in the active language. */
export function useErrorText(): (error: unknown, fallback: string) => string {
  const t = useTranslations("errors");
  return (error, fallback) => {
    if (error instanceof TranslatableError) {
      return error.code ? t(error.code, error.values) : error.message || fallback;
    }
    return fallback;
  };
}

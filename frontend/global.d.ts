import type { Locale } from "@/i18n/config";
import type analysis from "./locales/en/analysis.json";
import type common from "./locales/en/common.json";
import type components from "./locales/en/components.json";
import type landing from "./locales/en/landing.json";
import type lib from "./locales/en/lib.json";
import type pages from "./locales/en/pages.json";
import type sky from "./locales/en/sky.json";

/** English is the reference catalogue: a key missing from it is a type error. */
type Messages = typeof common & typeof lib & typeof pages & typeof analysis & typeof sky & typeof components & typeof landing;

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

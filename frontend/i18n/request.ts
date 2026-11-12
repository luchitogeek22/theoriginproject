import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { loadMessages } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: await loadMessages(locale),
    // Observation dates are UTC; a fixed zone also keeps server and client output identical.
    timeZone: "UTC",
    onError(error) {
      // Missing translations surface loudly during development and stay quiet in production.
      if (process.env.NODE_ENV !== "production") console.error(error.message);
    },
    getMessageFallback({ namespace, key }) {
      return [namespace, key].filter(Boolean).join(".");
    },
  };
});

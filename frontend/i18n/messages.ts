import { MESSAGE_FILES, type Locale } from "./config";

/** Loads and merges every message file of a locale. Each file owns distinct top-level namespaces. */
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const parts = await Promise.all(
    MESSAGE_FILES.map((file) => import(`../locales/${locale}/${file}.json`).then((m) => m.default)),
  );
  return Object.assign({}, ...parts);
}

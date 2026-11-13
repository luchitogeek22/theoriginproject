import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded border border-line bg-deep p-5 text-center">
        <h1 className="text-base font-bold text-starlight">{t("notFound.title")}</h1>
        <p className="mt-2 text-xs text-mutedstar">{t("notFound.body")}</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-pulse px-3 py-1.5 text-xs font-bold text-starlight hover:brightness-110"
        >
          {t("common.goHome")}
        </Link>
      </div>
    </div>
  );
}

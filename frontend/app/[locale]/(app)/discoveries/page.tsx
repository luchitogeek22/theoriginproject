import type { Locale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";

export default function DiscoveriesRedirect({ params }: { params: { locale: Locale } }) {
  return redirect({ href: "/candidates", locale: params.locale });
}

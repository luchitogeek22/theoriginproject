"use client";

/** Session button for the sidebar: email + logout, or login link. */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { LogIn, LogOut } from "lucide-react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";

export default function AuthButton() {
  const t = useTranslations("authButton");
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sb = supabaseBrowser();
    if (!sb) return;
    sb.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) =>
        setEmail(data.user?.email ?? null)
      );
    const { data: sub } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) =>
        setEmail(session?.user?.email ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!mounted || !isSupabaseConfigured()) return null;

  if (!email) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-mutedstar hover:bg-panel hover:text-starlight"
      >
        <LogIn size={17} />
        <span className="hidden md:inline">{t("signIn")}</span>
      </button>
    );
  }

  const logout = async () => {
    await supabaseBrowser()?.auth.signOut();
    setEmail(null);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs">
      <span className="hidden min-w-0 flex-1 truncate text-mutedstar md:inline" title={email}>
        {email}
      </span>
      <button
        onClick={() => void logout()}
        title={t("signOut")}
        aria-label={t("signOut")}
        className="text-mutedstar hover:text-starlight"
      >
        <LogOut size={17} />
      </button>
    </div>
  );
}

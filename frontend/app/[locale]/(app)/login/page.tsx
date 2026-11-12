"use client";

/** Login / registration via Supabase Auth (email + password). */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/errors";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";

const DEFAULT_NEXT = "/living-sky";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_NEXT;
  }
  if (/[\\\u0000-\u001f]/.test(raw)) return DEFAULT_NEXT;
  return raw;
}

const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "over_request_rate_limit",
] as const;
type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Supabase auth error code (`AuthError.code`) when it is one we have a translation for. */
function authErrorCode(e: unknown): AuthErrorCode | null {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  return (AUTH_ERROR_CODES as readonly unknown[]).includes(code) ? (code as AuthErrorCode) : null;
}

function LoginForm() {
  const t = useTranslations("loginPage");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded border border-line bg-deep p-6 text-center">
        <p className="text-sm font-semibold text-starlight">{t("notConfiguredTitle")}</p>
        <p className="mt-1 text-xs text-mutedstar">
          {t("notConfiguredBody")}
        </p>
      </div>
    );
  }

  const submit = async () => {
    const sb = supabaseBrowser();
    if (!sb || busy) return;
    if (!email.includes("@") || password.length < 6) {
      setError(t("invalidInput"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        const { error: err } = await sb.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await sb.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) {
          setNotice(t("confirmEmail"));
          return;
        }
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      const code = authErrorCode(e);
      setError(code ? t(`authErrors.${code}`) : errorText(e, t("authFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 w-[min(92vw,380px)] rounded border border-line bg-deep p-6">
      <p className="text-[11px] tracking-[0.25em] text-pulse">{tc("brand")}</p>
      <h1 className="mt-1 text-xl font-bold text-starlight">
        {mode === "login" ? t("signIn") : t("createAccount")}
      </h1>
      <p className="mt-1 text-xs text-mutedstar">
        {t("intro")}
      </p>
      <div className="mt-3 flex rounded border border-line bg-abyss p-0.5 text-xs" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
              setNotice("");
            }}
            className={`flex-1 rounded px-2 py-1.5 ${
              mode === m ? "bg-panel text-pulse" : "text-mutedstar"
            }`}
          >
            {m === "login" ? t("signIn") : t("register")}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-mutedstar">
        {t("email")}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          autoComplete="email"
          className="mt-1 w-full rounded border border-line bg-abyss px-2 py-2 text-sm text-starlight outline-none focus:border-pulse"
        />
      </label>
      <label className="mt-2 block text-xs text-mutedstar">
        {t("password")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="mt-1 w-full rounded border border-line bg-abyss px-2 py-2 text-sm text-starlight outline-none focus:border-pulse"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {notice && <p className="mt-2 text-xs text-gold">{notice}</p>}
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded bg-pulse px-3 py-2 text-sm font-bold text-starlight hover:brightness-110 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : mode === "login" ? (
          <LogIn size={15} />
        ) : (
          <UserPlus size={15} />
        )}
        {mode === "login" ? t("signIn") : t("createAccount")}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const tc = useTranslations("common");
  return (
    <div className="h-full overflow-y-auto p-4">
      <Suspense fallback={<p className="mt-16 text-center text-xs text-mutedstar">{tc("loading")}</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

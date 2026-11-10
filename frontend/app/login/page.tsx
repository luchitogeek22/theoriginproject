"use client";

/** Login / registration via Supabase Auth (email + password). */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/living-sky";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded border border-line bg-deep p-6 text-center">
        <p className="text-sm font-semibold text-starlight">Autenticación no configurada</p>
        <p className="mt-1 text-xs text-mutedstar">
          Este despliegue no tiene Supabase configurado y funciona en modo anónimo:
          puedes explorar, analizar y guardar investigaciones locales sin cuenta.
        </p>
      </div>
    );
  }

  const submit = async () => {
    const sb = supabaseBrowser();
    if (!sb || busy) return;
    if (!email.includes("@") || password.length < 6) {
      setError("Indica un correo válido y una contraseña de al menos 6 caracteres.");
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
          setNotice("Cuenta creada. Revisa tu correo para confirmarla antes de entrar.");
          return;
        }
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 w-[min(92vw,380px)] rounded border border-line bg-deep p-6">
      <p className="text-[11px] tracking-[0.25em] text-pulse">THE ORIGIN PROJECT</p>
      <h1 className="mt-1 text-xl font-bold text-starlight">
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </h1>
      <p className="mt-1 text-xs text-mutedstar">
        Tu bitácora de investigación y tus descubrimientos quedarán asociados a tu cuenta.
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
            {m === "login" ? "Entrar" : "Registrarse"}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-mutedstar">
        Correo
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
        Contraseña
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
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded bg-pulse px-3 py-2 text-sm font-bold text-abyss hover:brightness-110 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : mode === "login" ? (
          <LogIn size={15} />
        ) : (
          <UserPlus size={15} />
        )}
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <Suspense fallback={<p className="mt-16 text-center text-xs text-mutedstar">Cargando…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

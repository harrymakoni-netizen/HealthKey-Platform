"use client";
import { useEffect, useState } from "react";
import { api, Icon } from "./ui";
import { useLocale } from "./locale";
import { Shell, ErrorNotice } from "./upgrade-shared";
import Operations from "./operations";
import type { Staff } from "@/lib/contracts";
export default function StaffWorkspace({
  initialAdmin = false,
}: {
  initialAdmin?: boolean;
}) {
  const { t } = useLocale();
  const [user, setUser] = useState<Staff | null>(null),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [mfa, setMfa] = useState<{ id: string; name: string }[] | null>(null),
    [otp, setOtp] = useState(""),
    [enrollment, setEnrollment] = useState<{
      secret: string;
      qr_code: string;
    } | null>(null);
  async function me() {
    try {
      setUser(await api<Staff>("staff/me"));
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    me();
  }, []);
  async function logout() {
    setUser(null);
    setMfa(null);
    setEnrollment(null);
    setPassword("");
    try {
      await api("auth/logout", {});
    } catch {
      setError("error");
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        mfa: boolean;
        factors: { id: string; name: string }[];
      }>("auth/login", { email, password });
      setPassword("");
      if (r.mfa) setMfa(r.factors);
      else await me();
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("auth/mfa", { factor: mfa?.[0]?.id, code: otp });
      setOtp("");
      setMfa(null);
      setEnrollment(null);
      await me();
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }
  if (user) return <Operations user={user} logout={logout} />;
  return (
    <Shell>
      <section className="login-page">
        <p className="eyebrow">{t(initialAdmin ? "admin" : "staff")}</p>
        <h1>{t(checking ? "loading" : mfa ? "verification" : "staff")}</h1>
        <ErrorNotice error={error} />
        {!checking &&
          (mfa ? (
            <form onSubmit={verify}>
              {mfa.length ? (
                <>
                  {enrollment && (
                    <div className="notice">
                      <p>{t("mfaNote")}</p>
                      <img
                        width={200}
                        height={200}
                        alt={t("verification")}
                        src={
                          enrollment.qr_code.startsWith("data:")
                            ? enrollment.qr_code
                            : "data:image/svg+xml;charset=utf-8," +
                              encodeURIComponent(enrollment.qr_code)
                        }
                      />
                      <p style={{ overflowWrap: "anywhere" }}>
                        {enrollment.secret}
                      </p>
                    </div>
                  )}
                  <label className="field">
                    {t("verification")}
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    {t("continue")}
                  </button>
                </>
              ) : (
                <>
                  <p>{t("mfaNote")}</p>
                  <button
                    className="button"
                    type="button"
                    onClick={async () => {
                      try {
                        const r = await api<{
                          id: string;
                          secret: string;
                          qr_code: string;
                        }>("auth/mfa/enroll", {});
                        setEnrollment(r);
                        setMfa([{ id: r.id, name: "TOTP" }]);
                      } catch {
                        setError("error");
                      }
                    }}
                  >
                    {t("mfaSetup")}
                  </button>
                </>
              )}
              <button className="text-button" type="button" onClick={logout}>
                {t("back")}
              </button>
            </form>
          ) : (
            <form onSubmit={login}>
              <label className="field">
                {t("email")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                {t("password")}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {t("login")}
                <Icon name="arrow" size={18} />
              </button>
            </form>
          ))}
        <p className="quiet">{t("receptionNote")}</p>
      </section>
    </Shell>
  );
}

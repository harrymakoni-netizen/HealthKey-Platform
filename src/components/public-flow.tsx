"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./locale";
import { api, Icon, Dialog, resetPrivateView } from "./ui";
import {
  Shell,
  Status,
  ErrorNotice,
  ListingCard,
  Disclosure,
  Conversation,
  purposes,
  type Referral,
} from "./upgrade-shared";
import { assess, type Listing } from "@/lib/matching";
import { locales, type ClinicConfig } from "@/lib/contracts";
import { languageNames } from "@/i18n/copy";
type Step =
  | "welcome"
  | "preferences"
  | "review"
  | "receipt"
  | "room"
  | "access"
  | "directory"
  | "neutral"
  | "display";
export default function PublicFlow({ code }: { code: string }) {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>("welcome"),
    [config, setConfig] = useState<ClinicConfig | null>(null),
    [list, setList] = useState<Listing[]>([]),
    [preference, setPreference] = useState("writing"),
    [kind, setKind] = useState("private_conversation"),
    [requestedLanguage, setRequestedLanguage] = useState("en"),
    [receipt, setReceipt] = useState<{
      public_code: string;
      private_code: string;
    } | null>(null),
    [entry, setEntry] = useState(""),
    [showKey, setShowKey] = useState(false),
    [referrals, setReferrals] = useState<Referral[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [demo, setDemo] = useState(false),
    [kiosk, setKiosk] = useState(false),
    [large, setLarge] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [warning, setWarning] = useState(false),
    [area, setArea] = useState(""),
    [accessible, setAccessible] = useState(false),
    [options, setOptions] = useState<
      | (Listing & { tier: string; reasons: string[]; questions: string[] })[]
      | null
    >(null);
  const nonce = useRef(""),
    generation = useRef(0),
    lastActivity = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const clear = useCallback((neutral = false) => {
    generation.current++;
    resetPrivateView();
    setReceipt(null);
    setEntry("");
    setReferrals([]);
    setShowKey(false);
    setError("");
    setBusy(false);
    setPreference("writing");
    setKind("private_conversation");
    setStep(neutral ? "neutral" : "welcome");
    setWarning(false);
    nonce.current = "";
    fetch("/api/v2/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
  }, []);
  const extendSession = async () => {
    try {
      if (step === "receipt" || step === "room")
        await api("v2/private/renew", {});
      lastActivity.current = Date.now();
      setWarning(false);
    } catch {
      clear();
      setError("session_expired");
    }
  };
  useEffect(() => {
    api<ClinicConfig>(`public/clinics/${code}/config`)
      .then(setConfig)
      .catch(() => setError("error"));
    api<{ listings: Listing[]; demo: boolean }>("v2/directory")
      .then((r) => {
        setList(r.listings);
        setDemo(r.demo);
      })
      .catch(() => {});
    setKiosk(new URLSearchParams(location.search).get("kiosk") === "1");
    setOnline(navigator.onLine);
    lastActivity.current = Date.now();
    const change = () => setOnline(navigator.onLine),
      exit = () => clear();
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    window.addEventListener("pagehide", exit);
    window.addEventListener("popstate", exit);
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) clear();
    };
    window.addEventListener("pageshow", restore);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((r) =>
          r.active?.postMessage({
            type: "CACHE_PUBLIC",
            urls: [
              location.pathname,
              `/api/public/clinics/${code}/config`,
              ...performance
                .getEntriesByType("resource")
                .map((r) => r.name)
                .filter((x) => x.includes("/_next/static/")),
            ],
          }),
        )
        .catch(() => {});
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      window.removeEventListener("pagehide", exit);
      window.removeEventListener("popstate", exit);
      window.removeEventListener("pageshow", restore);
    };
  }, [code, clear]);
  useEffect(() => {
    heading.current?.focus();
    lastActivity.current = Date.now();
  }, [step]);
  useEffect(() => {
    if (!kiosk) return;
    const timer = setInterval(() => {
      if (step === "welcome" || step === "neutral") return;
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed > 90000) clear();
      else if (elapsed > 70000) setWarning(true);
    }, 1000);
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [kiosk, step, clear]);
  const matchingActive = options !== null;
  useEffect(() => {
    if (!online || !["welcome", "review", "directory"].includes(step)) return;
    const gen = generation.current;
    const refresh = async () => {
      if (document.hidden || !navigator.onLine) return;
      try {
        const value = await api<{ listings: Listing[] }>("v2/directory");
        if (gen !== generation.current) return;
        setList(value.listings);
        if (step === "directory" && matchingActive) {
          const matched = await api<{ options: NonNullable<typeof options> }>(
            "v2/match",
            { category: kind, language: requestedLanguage, area, accessible },
          );
          if (gen === generation.current) setOptions(matched.options);
        }
      } catch {}
    };
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [online, step, kind, requestedLanguage, area, accessible, matchingActive]);
  const sourceListing = list.find((l) => l.clinic_id === config?.id);
  const source = sourceListing ? assess(sourceListing) : undefined;
  const sourceReady =
    source?.available === "accepting" && source.open && source.monitored;
  async function prepareDemo(start = false) {
    if (!online || busy) return;
    const gen = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ listings: Listing[] }>("v2/demo/prepare", {});
      if (gen !== generation.current) return;
      setList(result.listings);
      if (start) setStep("preferences");
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "error");
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  async function submit() {
    if (!online) {
      setStep("display");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    const gen = generation.current;
    if (!nonce.current) nonce.current = crypto.randomUUID();
    try {
      const service = config?.services.find((x) => x.key === kind)?.id;
      const r = await api<NonNullable<typeof receipt>>("v2/request", {
        clinic: code,
        nonce: nonce.current,
        communication_pref: preference || null,
        language: requestedLanguage,
        kiosk,
        ...(service ? { service_id: service } : {}),
      });
      if (gen !== generation.current) return;
      setReceipt(r);
      setShowKey(false);
      setStep("receipt");
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "error");
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  async function open(e: React.FormEvent) {
    e.preventDefault();
    const gen = generation.current;
    setBusy(true);
    try {
      await api("v2/session", { private_code: entry, kiosk });
      if (gen === generation.current) {
        setEntry("");
        setStep("room");
        setError("");
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "error");
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  async function consent(r: Referral, action: string) {
    const gen = generation.current;
    setBusy(true);
    try {
      await api("v2/private/referrals", {
        id: r.id,
        version: r.version,
        hash: r.snapshot_hash,
        action,
      });
      const rows = await api<Referral[]>("v2/private/referrals");
      if (gen === generation.current) {
        setReferrals(rows);
        setError("");
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "error");
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  const titles: Record<Step, string> = {
    welcome: "welcome",
    preferences: "preferences",
    review: "review",
    receipt: "submitted",
    room: "check",
    access: "check",
    directory: "directory",
    neutral: "neutral",
    display: "display",
  };
  return (
    <Shell
      large={large}
      exit={() => clear(true)}
      accessibility={
        <button
          className="icon-button accessibility-button"
          aria-label={t("large")}
          aria-pressed={large}
          onClick={() => setLarge(!large)}
        >
          <Icon name="access" />
        </button>
      }
    >
      <div
        onPointerDown={() => {
          if (!warning) lastActivity.current = Date.now();
        }}
        onKeyDown={() => {
          if (!warning) lastActivity.current = Date.now();
        }}
      >
        <div className="journey-bar">
          <span className="quiet">{t(kiosk ? "kiosk" : "personal")}</span>
          {!["welcome", "neutral"].includes(step) && (
            <button className="text-button" onClick={() => clear()}>
              {t("clear")}
            </button>
          )}
        </div>
        <ErrorNotice error={error} />
        {!online && (
          <p className="connection-banner" role="status">
            {t("offline")}
          </p>
        )}
        <h1 ref={heading} tabIndex={-1}>
          {t(titles[step])}
        </h1>
        {step === "neutral" ? (
          <>
            <p>{t("exitNote")}</p>
            <button className="button" onClick={() => setStep("welcome")}>
              {t("return")}
            </button>
          </>
        ) : null}
        {step === "welcome" && (
          <div className="entry-grid">
            <section>
              <p className="lead">{t("intro")}</p>
              {demo && <p className="quiet">{t("demoStartNote")}</p>}
              <div className="entry-actions">
                <button
                  className="button primary"
                  disabled={busy || (online && (!config || !list.length))}
                  onClick={() =>
                    demo && online
                      ? void prepareDemo(true)
                      : setStep("preferences")
                  }
                >
                  {t("start")}
                  <Icon name="arrow" />
                </button>
                <button className="button" onClick={() => setStep("access")}>
                  <Icon name="key" />
                  {t("check")}
                </button>
                <button className="button" onClick={() => setStep("directory")}>
                  {t("browse")}
                </button>
              </div>
              <button className="text-button" onClick={() => setPrivacy(true)}>
                {t("privacy")}
              </button>
              <p className="quiet">{t("exitNote")}</p>
            </section>
            <aside className="quiet-panel">
              <div className="eyebrow">{t("private_conversation")}</div>
              <h2>{t("urgent")}</h2>
              <p>{t("urgentText")}</p>
              <hr />
              <p>{t("languageNote")}</p>
              <p>{t("contactNote")}</p>
            </aside>
          </div>
        )}
        {step === "preferences" && (
          <section className="narrow">
            <p>{t("optional")}</p>
            <fieldset>
              <legend>{t("category")}</legend>
              <div className="choice-grid">
                {purposes.map((k) => (
                  <label className="choice-option" key={k}>
                    <input
                      type="radio"
                      name="kind"
                      checked={kind === k}
                      onChange={() => setKind(k)}
                    />
                    <span>{t(k)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">
              {t("preferences")}
              <select
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
              >
                {["", "writing", "spoken", "support"].map((x) => (
                  <option key={x} value={x}>
                    {t(x || "none")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("requested_language")}
              <select
                value={requestedLanguage}
                onChange={(e) => setRequestedLanguage(e.target.value)}
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {languageNames[l]}
                  </option>
                ))}
              </select>
            </label>
            <p className="quiet">{t("languageNote")}</p>
            <button
              className="button primary"
              onClick={() => setStep("review")}
            >
              {t("continue")}
            </button>
          </section>
        )}
        {step === "review" && (
          <section className="narrow">
            <div className="review-detail">
              <p className="eyebrow">{t("recipient")}</p>
              <h2>{source?.public_name ?? config?.name ?? "HealthKey"}</h2>
              <Status
                value={
                  !source?.monitored
                    ? "not_monitored"
                    : !source.open
                      ? "closed"
                      : source.available
                }
              />
              <p>
                {source?.opens.slice(0, 5)}–{source?.closes.slice(0, 5)}{" "}
                {source?.timezone}
              </p>
              <p>
                {t("shared")}: {t(kind)}, {t(preference || "none")},{" "}
                {languageNames[requestedLanguage as keyof typeof languageNames]}
              </p>
            </div>
            <p>{t("contactNote")}</p>
            <p className="quiet">{t("privacyText")}</p>
            <p>{t("sentNote")}</p>
            {!sourceReady && online && (
              <p role="status" className="notice">
                {t("providerNeedsRefresh")}
              </p>
            )}
            {demo && online && !sourceReady && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void prepareDemo()}
              >
                {t("prepareDemo")}
              </button>
            )}
            <div className="action-row">
              <button className="button" onClick={() => setStep("preferences")}>
                {t("back")}
              </button>
              <button
                className="button primary"
                disabled={busy || (online && !sourceReady)}
                onClick={submit}
              >
                {t("send")}
              </button>
            </div>
          </section>
        )}
        {step === "display" && (
          <section className="narrow">
            <p>{t("unsent")}</p>
            <h2>{t(kind)}</h2>
            <p>{t(preference || "none")}</p>
            <button className="button" onClick={() => clear()}>
              {t("clear")}
            </button>
          </section>
        )}
        {step === "receipt" && receipt && (
          <section className="narrow">
            <p>{t("ackNote")}</p>
            <div className="receipt">
              <span>{t("reference")}</span>
              <strong>{receipt.public_code}</strong>
            </div>
            <button
              className="text-button"
              onClick={() => setShowKey(!showKey)}
            >
              {t(showKey ? "hideCode" : "showCode")}
            </button>
            {showKey && (
              <label className="field">
                {t("privateCode")}
                <input
                  readOnly
                  value={receipt.private_code}
                  autoComplete="off"
                />
              </label>
            )}
            <p className="quiet">{t("keyNote")}</p>
            <button className="button primary" onClick={() => setStep("room")}>
              {t("check")}
            </button>
          </section>
        )}
        {step === "access" && (
          <form className="narrow" onSubmit={open}>
            <label className="field">
              {t("privateCode")}
              <input
                required
                value={entry}
                maxLength={80}
                onChange={(e) => setEntry(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              />
            </label>
            <p>{t("keyNote")}</p>
            <button className="button primary" disabled={busy || !online}>
              {t("open")}
            </button>
          </form>
        )}
        {step === "room" && (
          <div className="private-grid">
            <Conversation onReferrals={setReferrals} />
            <section>
              <h2>{t("referrals")}</h2>
              {!referrals.length && <p className="quiet">{t("noReferrals")}</p>}
              {referrals
                .filter((r) => r.state !== "draft")
                .map((r) => (
                  <Disclosure
                    key={r.id}
                    referral={r}
                    actions={
                      <>
                        {r.state === "awaiting_consent" && (
                          <>
                            <button
                              className="button primary"
                              disabled={busy || !online}
                              onClick={() => consent(r, "approve")}
                            >
                              {t("approve")}
                            </button>
                            <button
                              className="button"
                              disabled={busy || !online}
                              onClick={() => consent(r, "decline")}
                            >
                              {t("decline")}
                            </button>
                          </>
                        )}
                        {![
                          "declined",
                          "cancelled",
                          "completed",
                          "expired",
                        ].includes(r.state) && (
                          <button
                            className="button"
                            disabled={busy || !online}
                            onClick={() => consent(r, "cancel")}
                          >
                            {t("cancelReferral")}
                          </button>
                        )}
                      </>
                    }
                  />
                ))}
              <p className="quiet">{t("cancelNote")}</p>
              <button
                className="button"
                disabled={busy || !online}
                onClick={async () => {
                  try {
                    await api("v2/private/withdraw", {});
                    clear();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "error");
                  }
                }}
              >
                {t("withdraw")}
              </button>
            </section>
          </div>
        )}
        {step === "directory" && (
          <>
            <p>{t("languageNote")}</p>
            <form
              className="directory-filters"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await api<{ options: NonNullable<typeof options> }>(
                    "v2/match",
                    {
                      category: kind,
                      language: requestedLanguage,
                      area,
                      accessible,
                    },
                  );
                  setOptions(r.options);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "error");
                }
              }}
            >
              <label className="field">
                {t("category")}
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {purposes.map((k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("requested_language")}
                <select
                  value={requestedLanguage}
                  onChange={(e) => setRequestedLanguage(e.target.value)}
                >
                  {locales.map((l) => (
                    <option key={l} value={l}>
                      {languageNames[l]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("area")}
                <input
                  value={area}
                  maxLength={80}
                  onChange={(e) => setArea(e.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={accessible}
                  onChange={(e) => setAccessible(e.target.checked)}
                />
                {t("accessible")}
              </label>
              <button className="button primary" disabled={!online}>
                {t("match")}
              </button>
            </form>
            {options && !options.length && (
              <p className="notice">{t("noMatch")}</p>
            )}
            <div className="listing-grid">
              {(
                options ??
                list.map((l) => ({
                  ...l,
                  tier: "",
                  reasons: [] as string[],
                  questions: [] as string[],
                }))
              ).map((l) => (
                <ListingCard key={l.id} listing={l}>
                  {l.tier && (
                    <>
                      <Status value={l.tier} />
                      <ul>
                        {[...l.reasons, ...l.questions].map((k) => (
                          <li key={k}>{t(k)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </ListingCard>
              ))}
            </div>
          </>
        )}
      </div>
      {privacy && (
        <Dialog
          title={t("privacy")}
          closeLabel={t("close")}
          onClose={() => setPrivacy(false)}
        >
          <p>{t("privacyText")}</p>
          <p>{t("exitNote")}</p>
          <p>{t("messageNote")}</p>
        </Dialog>
      )}
      {warning && (
        <Dialog
          title={t("idle")}
          closeLabel={t("close")}
          onClose={() => void extendSession()}
        >
          <button
            className="button primary"
            onClick={() => void extendSession()}
          >
            {t("extend")}
          </button>
        </Dialog>
      )}
    </Shell>
  );
}

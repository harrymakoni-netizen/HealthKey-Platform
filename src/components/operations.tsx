"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./locale";
import { api } from "./ui";
import {
  Shell,
  Status,
  ErrorNotice,
  Disclosure,
  ListingCard,
  Conversation,
  purposes,
  type Referral,
} from "./upgrade-shared";
import type { Staff } from "@/lib/contracts";
import { locales } from "@/lib/contracts";
import { languageNames, normalizeLocale } from "@/i18n/copy";
import type { Listing } from "@/lib/matching";
import PlatformSetup from "./platform-setup";
import Admin from "./admin";
type Item = {
  id: string;
  public_code: string;
  status: string;
  assigned_to: string | null;
  version: number;
  created_at: string;
  communication_pref: string | null;
  requested_language: string;
};
type Queue = {
  requests: Item[];
  staff: { id: string; name: string }[];
  referrals: Referral[];
};
export default function Operations({
  user,
  logout,
}: {
  user: Staff;
  logout: () => void;
}) {
  const { t, locale, setLocale } = useLocale();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const [tab, setTab] = useState(
      ["admin", "verifier"].includes(user.role) ? "providers" : "queue",
    ),
    [queue, setQueue] = useState<Queue | null>(null),
    [selected, setSelected] = useState(""),
    [providers, setProviders] = useState<Listing[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [assignee, setAssignee] = useState(""),
    [target, setTarget] = useState(""),
    [purpose, setPurpose] = useState("counselling"),
    [note, setNote] = useState(""),
    [includeLanguage, setIncludeLanguage] = useState(true),
    [includeCommunication, setIncludeCommunication] = useState(false),
    [includeCategory, setIncludeCategory] = useState(false),
    [includeNote, setIncludeNote] = useState(false),
    [outcome, setOutcome] = useState("support_provided"),
    [reportReason, setReportReason] = useState("availability"),
    [reports, setReports] = useState<
      {
        id: string;
        listing_id: string;
        reason: string;
        resolved_at: string | null;
      }[]
    >([]);
  const epoch = useRef(0),
    proposalNonce = useRef("");
  const load = useCallback(async () => {
    if (document.hidden || !navigator.onLine) return;
    const gen = epoch.current;
    try {
      if (["intake", "clinician"].includes(user.role)) {
        const q = await api<Queue>("v2/queue");
        if (gen === epoch.current) setQueue(q);
      }
      const r = await api<{ listings: Listing[]; reports: typeof reports }>(
        "v2/providers",
      );
      if (gen === epoch.current) {
        setProviders(r.listings);
        setReports(r.reports);
        setError("");
      }
    } catch (e) {
      if (gen === epoch.current) {
        setQueue(null);
        setError(e instanceof Error ? e.message : "error");
      }
    }
  }, [user.role]);
  useEffect(() => {
    api<{ language: string }>("v2/preferences")
      .then((r) => {
        if (r.language) setLocale(normalizeLocale(r.language));
      })
      .catch(() => {});
  }, [setLocale]);
  const invalidateGeneration = useCallback(() => {
    epoch.current++;
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000),
      hidden = () => {
        epoch.current++;
        if (document.hidden || !navigator.onLine) {
          setQueue(null);
          setSelected("");
          setNote("");
          setTarget("");
        } else load();
      };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("offline", hidden);
    window.addEventListener("online", hidden);
    return () => {
      invalidateGeneration();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("offline", hidden);
      window.removeEventListener("online", hidden);
    };
  }, [load, invalidateGeneration]);
  const item = queue?.requests.find((r) => r.id === selected);
  async function run(path: string, body: unknown, method?: string) {
    setBusy(true);
    try {
      await api(path, body, method);
      setError("");
      await load();
      return true;
    } catch (e) {
      await load();
      setError(e instanceof Error ? e.message : "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function requestAction(action: string) {
    if (!item) return;
    const succeeded = await run(
      `v2/requests/${item.id}`,
      {
        version: item.version,
        action,
        ...(action === "assign" ? { assignee } : {}),
        ...(action === "complete" ? { outcome } : {}),
      },
      "PATCH",
    );
    if (succeeded && action === "complete") setSelected("");
  }
  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    if (!proposalNonce.current) proposalNonce.current = crypto.randomUUID();
    try {
      await api("v2/referrals", {
        request_id: item.id,
        target_id: target,
        purpose,
        nonce: proposalNonce.current,
        payload: {
          ...(includeLanguage
            ? { requested_language: item.requested_language }
            : {}),
          ...(includeCommunication
            ? { communication_preference: item.communication_pref || "writing" }
            : {}),
          ...(includeCategory ? { category: purpose } : {}),
          ...(includeNote && note.trim() ? { note: note.trim() } : {}),
        },
      });
      proposalNonce.current = "";
      setNote("");
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }
  const sourceRefs =
      queue?.referrals.filter((r) => r.responsible_staff === user.id) ?? [],
    received =
      queue?.referrals.filter((r) => r.responsible_staff !== user.id) ?? [];
  return (
    <Shell
      tools={
        <button className="text-button" onClick={logout}>
          {t("logout")}
        </button>
      }
    >
      <div className="workspace-title">
        <div>
          <p className="eyebrow">{user.clinic_name}</p>
          <h1>{t(user.role)}</h1>
        </div>
        <button
          className="button"
          onClick={async () => {
            try {
              await api("v2/preferences", { language: locale }, "PUT");
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "error");
            }
          }}
        >
          {t("save")}
        </button>
      </div>
      <nav className="tabs" aria-label={t("queue")}>
        {["intake", "clinician"].includes(user.role) && (
          <button
            aria-current={tab === "queue" ? "page" : undefined}
            onClick={() => setTab("queue")}
          >
            {t("queue")}
          </button>
        )}
        {user.role === "clinician" && (
          <button
            aria-current={tab === "referrals" ? "page" : undefined}
            onClick={() => setTab("referrals")}
          >
            {t("referrals")} ({received.length})
          </button>
        )}
        <button
          aria-current={tab === "providers" ? "page" : undefined}
          onClick={() => setTab("providers")}
        >
          {t("providers")}
        </button>
        {["admin", "platform"].includes(user.role) && (
          <button
            aria-current={tab === "configuration" ? "page" : undefined}
            onClick={() => setTab("configuration")}
          >
            {t("configuration")}
          </button>
        )}
      </nav>
      <ErrorNotice error={error} />
      {user.role === "intake" && <p className="notice">{t("receptionNote")}</p>}
      {tab === "configuration" && user.role === "platform" && (
        <PlatformSetup onChange={load} />
      )}
      {tab === "configuration" && user.role === "admin" && (
        <Admin user={user} />
      )}
      {tab === "queue" && (
        <div className="operations-grid">
          <section>
            <h2>{t("queue")}</h2>
            {!queue?.requests.length && (
              <p className="empty-state">{t("noRequests")}</p>
            )}
            <div className="request-cards">
              {queue?.requests.map((r) => (
                <button
                  key={r.id}
                  className={`request-card ${selected === r.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelected(r.id);
                    setTarget("");
                    proposalNonce.current = "";
                  }}
                >
                  <strong>{r.public_code}</strong>
                  <Status
                    value={
                      r.status === "acknowledged" && r.assigned_to
                        ? "assigned"
                        : r.status
                    }
                  />
                  <time className="quiet">
                    {new Date(r.created_at).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {r.status === "new" &&
                    now - new Date(r.created_at).getTime() > 10 * 60000 && (
                      <span>{t("overDue")}</span>
                    )}
                </button>
              ))}
            </div>
          </section>
          <section className="request-detail">
            {item ? (
              <>
                <h2>{item.public_code}</h2>
                <Status value={item.status} />
                <div className="action-row">
                  {item.status === "new" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => requestAction("acknowledge")}
                    >
                      {t("acknowledge")}
                    </button>
                  )}
                  {user.role === "intake" && item.status !== "new" && (
                    <>
                      <label className="field">
                        {t("assign")}
                        <select
                          aria-label={t("assign")}
                          value={assignee}
                          onChange={(e) => setAssignee(e.target.value)}
                        >
                          <option value="">{t("none")}</option>
                          {queue?.staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button"
                        disabled={busy || !assignee}
                        onClick={() => requestAction("assign")}
                      >
                        {t("assign")}
                      </button>
                    </>
                  )}
                  {user.role === "clinician" &&
                    item.status === "acknowledged" && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => requestAction("start")}
                      >
                        {t("startSupport")}
                      </button>
                    )}
                </div>
                {user.role === "clinician" && (
                  <>
                    <Conversation key={item.id} requestId={item.id} />
                    {item.status === "in_progress" && (
                      <>
                        <p className="notice">{t("closeWarning")}</p>
                        <label className="field">
                          {t("outcome")}
                          <select
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                          >
                            {[
                              "support_provided",
                              "handover_confirmed",
                              "user_left",
                            ].map((o) => (
                              <option key={o} value={o}>
                                {t(o)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => requestAction("complete")}
                        >
                          {t("complete")}
                        </button>
                      </>
                    )}
                    <form className="referral-form" onSubmit={propose}>
                      <h3>{t("prepareReferral")}</h3>
                      <label className="field">
                        {t("recipient")}
                        <select
                          aria-label={t("recipient")}
                          value={target}
                          required
                          onChange={(e) => {
                            setTarget(e.target.value);
                            proposalNonce.current = "";
                          }}
                        >
                          <option value="">{t("none")}</option>
                          {providers
                            .filter((p) => p.clinic_id !== user.clinic_id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.public_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        {t("purpose")}
                        <select
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                        >
                          {purposes.map((k) => (
                            <option key={k} value={k}>
                              {t(k)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>{t("consentScope")}</p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={includeLanguage}
                          onChange={(e) => setIncludeLanguage(e.target.checked)}
                        />
                        {t("requested_language")}:{" "}
                        {item?.requested_language
                          ? languageNames[
                              normalizeLocale(item.requested_language)
                            ]
                          : languageNames.en}
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={includeCommunication}
                          onChange={(e) =>
                            setIncludeCommunication(e.target.checked)
                          }
                        />
                        {t("communication_preference")}:{" "}
                        {t(item?.communication_pref || "none")}
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={includeCategory}
                          onChange={(e) => setIncludeCategory(e.target.checked)}
                        />
                        {t("category")}: {t(purpose)}
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={includeNote}
                          onChange={(e) => setIncludeNote(e.target.checked)}
                        />
                        {t("note")}
                      </label>
                      {includeNote && (
                        <label className="field">
                          {t("note")}
                          <textarea
                            rows={3}
                            maxLength={240}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </label>
                      )}
                      <button
                        className="button primary"
                        disabled={busy || !target}
                      >
                        {t("createDraft")}
                      </button>
                    </form>
                    {sourceRefs
                      .filter((r) => r.source_request_id === item.id)
                      .map((r) => (
                        <Disclosure
                          key={r.id}
                          referral={r}
                          actions={
                            <>
                              {r.state === "draft" && (
                                <button
                                  className="button primary"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      `v2/referrals/${r.id}`,
                                      {
                                        version: r.version,
                                        action: "request_consent",
                                      },
                                      "PATCH",
                                    )
                                  }
                                >
                                  {t("requestConsent")}
                                </button>
                              )}
                              {[
                                "draft",
                                "awaiting_consent",
                                "approved",
                              ].includes(r.state) && (
                                <button
                                  className="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const value = prompt(
                                      t("note"),
                                      r.payload.note ?? "",
                                    );
                                    if (value !== null)
                                      run(
                                        `v2/referrals/${r.id}`,
                                        {
                                          version: r.version,
                                          action: "edit",
                                          payload: {
                                            ...r.payload,
                                            ...(value ? { note: value } : {}),
                                          },
                                        },
                                        "PATCH",
                                      );
                                  }}
                                >
                                  {t("editDisclosure")}
                                </button>
                              )}
                              {r.state === "approved" && (
                                <button
                                  className="button primary"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      `v2/referrals/${r.id}`,
                                      {
                                        version: r.version,
                                        action: "dispatch",
                                        nonce: crypto.randomUUID(),
                                      },
                                      "PATCH",
                                    )
                                  }
                                >
                                  {t("dispatch")}
                                </button>
                              )}
                              {![
                                "cancelled",
                                "completed",
                                "declined",
                                "expired",
                              ].includes(r.state) && (
                                <button
                                  className="button"
                                  disabled={busy}
                                  onClick={() =>
                                    run(
                                      `v2/referrals/${r.id}`,
                                      { version: r.version, action: "cancel" },
                                      "PATCH",
                                    )
                                  }
                                >
                                  {t("cancelReferral")}
                                </button>
                              )}
                            </>
                          }
                        />
                      ))}
                  </>
                )}
              </>
            ) : (
              <p className="quiet">{t("noData")}</p>
            )}
          </section>
        </div>
      )}
      {tab === "referrals" && (
        <section>
          <h2>{t("referrals")}</h2>
          {!received.length && <p>{t("noData")}</p>}
          {received.map((r) => (
            <Disclosure
              key={r.id}
              referral={r}
              actions={
                <>
                  {r.state === "sent" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          `v2/referrals/${r.id}`,
                          { version: r.version, action: "acknowledge" },
                          "PATCH",
                        )
                      }
                    >
                      {t("ackReferral")}
                    </button>
                  )}
                  {["sent", "acknowledged"].includes(r.state) && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          `v2/referrals/${r.id}`,
                          { version: r.version, action: "decline" },
                          "PATCH",
                        )
                      }
                    >
                      {t("decline")}
                    </button>
                  )}
                  {r.state === "acknowledged" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          `v2/referrals/${r.id}`,
                          {
                            version: r.version,
                            action: "complete",
                            outcome: "staff_confirmed_handover",
                          },
                          "PATCH",
                        )
                      }
                    >
                      {t("completeReferral")}
                    </button>
                  )}
                </>
              }
            />
          ))}
        </section>
      )}
      {tab === "providers" && (
        <>
          <h2>{t("providers")}</h2>
          {reports
            .filter((r) => !r.resolved_at)
            .map((r) => (
              <p className="notice" key={r.id}>
                {r.listing_id} · {t(r.reason)}
              </p>
            ))}
          <div className="listing-grid">
            {providers.map((l) => (
              <ListingCard key={l.id} listing={l}>
                {["admin", "verifier"].includes(user.role) ? (
                  <ProviderEditor
                    key={l.id + ":" + l.version}
                    listing={l}
                    verifier={user.role === "verifier"}
                    reload={load}
                  />
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("v2/providers/report", {
                        listing_id: l.id,
                        reason: reportReason,
                      });
                    }}
                  >
                    <label className="field">
                      {t("reason")}
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                      >
                        {[
                          "hours",
                          "contact",
                          "availability",
                          "accessibility",
                          "other",
                        ].map((k) => (
                          <option key={k} value={k}>
                            {t(k)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button" disabled={busy}>
                      {t("report")}
                    </button>
                  </form>
                )}
              </ListingCard>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
function ProviderEditor({
  listing: l,
  verifier,
  reload,
}: {
  listing: Listing;
  verifier: boolean;
  reload: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState({
      version: l.version,
      availability: l.availability,
      monitored: l.monitored,
      minutes: 120,
      pause_reason: l.pause_reason,
      provider_languages: l.provider_languages,
      access_requirements: l.access_requirements,
      accessibility: l.accessibility,
      costs: l.costs,
      opens: l.opens.slice(0, 5),
      closes: l.closes.slice(0, 5),
      timezone: l.timezone,
      days: l.days,
      identity_confirm: false,
    }),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  async function action(path: string, body: unknown, method?: string) {
    setBusy(true);
    try {
      const r = await api<{ token?: string }>(path, body, method);
      if (r.token) setToken(r.token);
      else {
        setToken("");
        setSaved(true);
        await reload();
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="provider-form"
      onSubmit={(e) => {
        e.preventDefault();
        action(`v2/providers/${l.id}`, form, "PATCH");
      }}
    >
      <ErrorNotice error={error} />
      {saved && <p role="status">{t("saved")}</p>}
      <label className="field">
        {t("availability")}
        <select
          value={form.availability}
          onChange={(e) => setForm({ ...form, availability: e.target.value })}
        >
          {["accepting", "limited", "unavailable", "unknown"].map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={form.monitored}
          onChange={(e) => setForm({ ...form, monitored: e.target.checked })}
        />
        {t("monitored")}
      </label>
      <label className="field">
        {t("minutes")}
        <input
          type="number"
          min={5}
          max={120}
          value={form.minutes}
          onChange={(e) =>
            setForm({ ...form, minutes: Number(e.target.value) })
          }
        />
      </label>
      <label className="field">
        {t("pauseReason")}
        <input
          value={form.pause_reason}
          maxLength={160}
          onChange={(e) => setForm({ ...form, pause_reason: e.target.value })}
        />
      </label>
      <div className="two-fields">
        <label className="field">
          {t("hours")}
          <input
            type="time"
            value={form.opens}
            required
            onChange={(e) => setForm({ ...form, opens: e.target.value })}
          />
        </label>
        <label className="field">
          {t("close")}
          <input
            type="time"
            value={form.closes}
            required
            onChange={(e) => setForm({ ...form, closes: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        {t("timezone")}
        <select
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        >
          <option>Africa/Johannesburg</option>
          <option>Africa/Harare</option>
        </select>
      </label>
      <fieldset>
        <legend>{t("providerLanguages")}</legend>
        {locales.map((k) => (
          <label key={k} className="check-label">
            <input
              type="checkbox"
              checked={form.provider_languages.includes(k)}
              onChange={(e) =>
                setForm({
                  ...form,
                  provider_languages: e.target.checked
                    ? [...form.provider_languages, k]
                    : form.provider_languages.filter((v) => v !== k),
                })
              }
            />
            {languageNames[k]}
          </label>
        ))}
      </fieldset>
      {(["access_requirements", "accessibility", "costs"] as const).map((k) => (
        <label key={k} className="field">
          {t(k === "access_requirements" ? "requirements" : k)}
          <select
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          >
            {[
              "unknown",
              k === "costs"
                ? "free"
                : k === "accessibility"
                  ? "step_free"
                  : "adults",
            ].map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {verifier && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.identity_confirm}
            onChange={(e) =>
              setForm({ ...form, identity_confirm: e.target.checked })
            }
          />
          {t("identityConfirm")}
        </label>
      )}
      <button className="button primary" disabled={busy}>
        {t("save")}
      </button>
      {!verifier && (
        <>
          <hr />
          <p className="quiet">{t("simulation")}</p>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => action(`v2/providers/${l.id}/checkin`, {})}
          >
            {t("checkin")}
          </button>
          {token && (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() =>
                action(`v2/providers/${l.id}/confirm`, {
                  token,
                  version: l.version,
                })
              }
            >
              {t("confirmDetails")}
            </button>
          )}
        </>
      )}
    </form>
  );
}

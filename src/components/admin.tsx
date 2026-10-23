"use client";
import { useEffect, useState } from "react";
import { api, Dialog } from "./ui";
import { useLocale } from "./locale";
import { ErrorNotice } from "./upgrade-shared";
import {
  locales,
  type ClinicConfig,
  type Staff,
  type Locale,
} from "@/lib/contracts";
import { languageNames } from "@/i18n/copy";
export default function Admin({ user }: { user: Staff }) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("services"),
    [config, setConfig] = useState<ClinicConfig | null>(null),
    [people, setPeople] = useState<Staff[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [revision, setRevision] = useState(""),
    [previewLocale, setPreviewLocale] = useState<Locale>("en"),
    [report, setReport] = useState<{
      suppressed: boolean;
      rows: { label: string; outcome: string; count: number }[];
      median_wait: number | null;
    } | null>(null),
    [history, setHistory] = useState<{ event: string; created_at: string }[]>(
      [],
    );
  useEffect(() => {
    api<ClinicConfig>("admin/config")
      .then(setConfig)
      .catch(() => setError("error"));
    api<Staff[]>("admin/staff")
      .then(setPeople)
      .catch(() => setError("error"));
  }, []);
  useEffect(() => {
    if (tab === "analytics")
      api<typeof report>("admin/analytics")
        .then(setReport)
        .catch(() => setError("error"));
    if (tab === "audit")
      api<typeof history>("admin/audit")
        .then(setHistory)
        .catch(() => setError("error"));
  }, [tab]);
  const normalizedServices = () =>
    config!.services.map(({ id, active, sort_order, labels, help, icon }) => ({
      id,
      active,
      sort_order,
      labels: Object.fromEntries(
        locales.map((l) => [l, labels[l] || labels.en]),
      ),
      help: Object.fromEntries(locales.map((l) => [l, help[l] || help.en])),
      icon,
    }));
  async function draft() {
    if (!config) return;
    setBusy(true);
    try {
      const r = await api<{ revision: string }>(
        "admin/config/draft",
        {
          version: config.version,
          settings: config.settings,
          services: normalizedServices(),
        },
        "PUT",
      );
      setRevision(r.revision);
      setPreview(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!config) return;
    setBusy(true);
    try {
      await api("admin/config/publish", { version: config.version, revision });
      setConfig(await api("admin/config"));
      setPreview(false);
      setMessage("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }
  async function permissions(p: Staff, patch: Partial<Staff>) {
    setBusy(true);
    const next = { ...p, ...patch };
    try {
      await api(
        `admin/staff/${p.id}`,
        { role: next.role, active: next.active, service_ids: next.service_ids },
        "PATCH",
      );
      setPeople(people.map((x) => (x.id === p.id ? next : x)));
      setMessage("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }
  if (!config) return <p role="status">{t("loading")}</p>;
  return (
    <section>
      <h2>{t("configuration")}</h2>
      <nav className="tabs">
        {["services", "settings", "staffAccess", "analytics", "audit"].map(
          (k) => (
            <button
              key={k}
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
            >
              {t(k)}
            </button>
          ),
        )}
      </nav>
      <ErrorNotice error={error} />
      {message && <p role="status">{t(message)}</p>}
      {tab === "services" && (
        <>
          <p>{t("reviewDraft")}</p>
          {config.services.map((s) => (
            <section className="service-editor" key={s.id}>
              <h3>{s.labels[locale] || s.labels.en}</h3>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={s.active}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      services: config.services.map((x) =>
                        x.id === s.id ? { ...x, active: e.target.checked } : x,
                      ),
                    })
                  }
                />
                {t("active")}
              </label>
              <label className="field">
                {t("sortOrder")}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={s.sort_order}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      services: config.services.map((x) =>
                        x.id === s.id
                          ? { ...x, sort_order: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <div className="locale-fields">
                {locales.map((l) => (
                  <div key={l}>
                    <label className="field">
                      {languageNames[l]} · {t("label")}
                      <input
                        lang={l}
                        value={s.labels[l] || s.labels.en}
                        maxLength={100}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            services: config.services.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    labels: {
                                      ...x.labels,
                                      [l]: e.target.value,
                                    },
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      {languageNames[l]} · {t("serviceInfo")}
                      <input
                        lang={l}
                        value={s.help[l] || s.help.en}
                        maxLength={100}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            services: config.services.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    help: { ...x.help, [l]: e.target.value },
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {tab === "settings" && (
        <div className="admin-grid">
          <section>
            <label className="field">
              {t("displayName")}
              <input
                value={config.settings.name}
                maxLength={80}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    settings: { ...config.settings, name: e.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              {t("ttlMinutes")}
              <input
                type="number"
                min={5}
                max={120}
                value={config.settings.ttl_minutes}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    settings: {
                      ...config.settings,
                      ttl_minutes: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="field">
              {t("idleSeconds")}
              <input
                type="number"
                min={60}
                max={600}
                value={config.settings.idle_seconds}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    settings: {
                      ...config.settings,
                      idle_seconds: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <p>{t("reviewDraft")}</p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={config.settings.translation_reviewed}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    settings: {
                      ...config.settings,
                      translation_reviewed: e.target.checked,
                    },
                  })
                }
              />
              {t("contentReviewed")}
            </label>
          </section>
          <section>
            <p>{t("privacyText")}</p>
            <a className="button" href={`/c/${config.code}?kiosk=1`}>
              {t("kiosk")}
            </a>
          </section>
        </div>
      )}
      {["services", "settings"].includes(tab) && (
        <div className="action-row">
          <button className="button primary" disabled={busy} onClick={draft}>
            {t("savePreview")}
          </button>
          <p className="quiet">{t("previewNote")}</p>
        </div>
      )}
      {tab === "staffAccess" && (
        <>
          <p>{t("assignedOnly")}</p>
          {people.map((p) => (
            <article className="staff-row" key={p.id}>
              <h3>{p.name}</h3>
              <label className="field">
                {t("role")}
                <select
                  value={p.role}
                  disabled={
                    p.id === user.id ||
                    busy ||
                    p.role === "platform" ||
                    p.role === "verifier"
                  }
                  onChange={(e) =>
                    permissions(p, { role: e.target.value as Staff["role"] })
                  }
                >
                  {["intake", "clinician", "admin", "platform", "verifier"].map(
                    (k) => (
                      <option key={k} value={k}>
                        {t(k)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={p.active}
                  disabled={
                    p.id === user.id ||
                    busy ||
                    p.role === "platform" ||
                    p.role === "verifier"
                  }
                  onChange={(e) => permissions(p, { active: e.target.checked })}
                />
                {t("active")}
              </label>
            </article>
          ))}
        </>
      )}
      {tab === "analytics" && (
        <>
          <h3>{t("analytics")}</h3>
          <p>{t("metricsNote")}</p>
          {report?.suppressed ? (
            <p className="notice">{t("suppressed")}</p>
          ) : report ? (
            <>
              <p>
                {t("medianAck")}:{" "}
                {report.median_wait === null
                  ? t("suppressed")
                  : Math.round(report.median_wait) + " s"}
              </p>
              <div className="report-cards">
                {report.rows.map((r, i) => (
                  <p key={i}>
                    {r.label} · {t(r.outcome)} · {r.count}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <p>{t("loading")}</p>
          )}
        </>
      )}
      {tab === "audit" && (
        <>
          <h3>{t("audit")}</h3>
          {history.length ? (
            history.map((h, i) => (
              <p key={i}>
                {t(h.event)} · {new Date(h.created_at).toLocaleString(locale)}
              </p>
            ))
          ) : (
            <p>{t("noData")}</p>
          )}
        </>
      )}
      {preview && (
        <Dialog
          title={t("consentPreview")}
          closeLabel={t("close")}
          onClose={() => setPreview(false)}
        >
          <label className="field">
            {t("language")}
            <select
              value={previewLocale}
              onChange={(e) => setPreviewLocale(e.target.value as Locale)}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {languageNames[l]}
                </option>
              ))}
            </select>
          </label>
          <div lang={previewLocale}>
            {config.services
              .filter((s) => s.active)
              .map((s) => (
                <div key={s.id}>
                  <h3>{s.labels[previewLocale] || s.labels.en}</h3>
                  <p>{s.help[previewLocale] || s.help.en}</p>
                </div>
              ))}
          </div>
          <p>{t("reviewDraft")}</p>
          <button className="button primary" onClick={publish} disabled={busy}>
            {t("publish")}
          </button>
        </Dialog>
      )}
    </section>
  );
}

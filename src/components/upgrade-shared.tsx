"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { languageNames, normalizeLocale } from "@/i18n/copy";
import { useLocale, LanguageSelector } from "./locale";
import { Brand, Icon, api } from "./ui";
import type { Listing } from "@/lib/matching";
import { assess } from "@/lib/matching";
export const purposes = [
  "private_conversation",
  "health_support",
  "counselling",
  "legal_information",
  "unsure",
];
export type Referral = {
  id: string;
  state: string;
  recipient: string;
  source: string;
  purpose: string;
  payload: Record<string, string>;
  snapshot_hash: string;
  version: number;
  snapshot_version: number;
  expires_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  outcome: string | null;
  source_request_id?: string;
  responsible_staff?: string;
};
export function Shell({
  children,
  tools,
  accessibility,
  exit,
  large = false,
}: {
  children: React.ReactNode;
  tools?: React.ReactNode;
  accessibility?: React.ReactNode;
  exit?: () => void;
  large?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div
      className={`upgrade-app ${large ? "large-text" : ""} ${accessibility ? "has-floating-accessibility" : ""}`}
    >
      <a className="skip-link" href="#main">
        {t("skipContent")}
      </a>
      <header className="public-header">
        <Brand />
        <div className="header-tools">
          <LanguageSelector />
          {tools}
          {exit && (
            <button className="button exit-button" onClick={exit}>
              <Icon name="logout" size={17} />
              {t("exit")}
            </button>
          )}
        </div>
      </header>
      <div className="demo-strip">{t("demo")}</div>
      <main id="main" className="upgrade-main">
        {children}
      </main>
      <footer className="upgrade-footer">
        <p>{t("reviewDraft")}</p>
        <p>{t("simulation")}</p>
        <a href="/staff">
          {t("staff")} <Icon name="arrow" size={16} />
        </a>
      </footer>
      {accessibility && (
        <div className="floating-accessibility">{accessibility}</div>
      )}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useLocale();
  return (
    <span className={`status-pill status-${value}`}>
      <Icon
        name={
          ["acknowledged", "approved", "completed", "accepting"].includes(value)
            ? "check"
            : "clock"
        }
        size={15}
      />
      {t(value === "new" ? "submitted" : value)}
    </span>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  const { t } = useLocale();
  return error ? (
    <p role="alert" className="notice error">
      {t(
        ["request_changed", "referral_changed", "listing_changed"].includes(
          error,
        )
          ? "conflict"
          : error === "expired" || error === "session_expired"
            ? "expired"
            : error === "provider_unavailable"
              ? "providerNeedsRefresh"
              : "error",
      )}
    </p>
  ) : null;
}
export function ListingCard({
  listing,
  children,
}: {
  listing: Listing;
  children?: React.ReactNode;
}) {
  const { t, locale } = useLocale();
  const a = assess(listing);
  return (
    <article className="listing-card">
      <div className="card-heading">
        <h3>{listing.public_name}</h3>
        <Status value={a.available} />
      </div>
      <p className="quiet">
        {listing.area} · {t(listing.access_requirements)}
      </p>
      <div className="listing-meta">
        <span>{t(a.freshness)}</span>
        <span>
          {t(
            listing.identity_checked_at
              ? "identity_checked"
              : "identity_unknown",
          )}
        </span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>{t("providerLanguages")}</dt>
          <dd>
            {listing.provider_languages
              .map((l) => languageNames[normalizeLocale(l)])
              .join(", ") || t("unknown")}
          </dd>
        </div>
        <div>
          <dt>{t("confirmedAt")}</dt>
          <dd>
            {listing.details_confirmed_at
              ? new Date(listing.details_confirmed_at).toLocaleString(locale)
              : t("unknown")}
          </dd>
        </div>
        <div>
          <dt>{t("availabilityUntil")}</dt>
          <dd>
            {new Date(listing.availability_expires_at).toLocaleString(locale)}
          </dd>
        </div>
        <div>
          <dt>{t("hours")}</dt>
          <dd>
            {listing.opens.slice(0, 5)}–{listing.closes.slice(0, 5)} ·{" "}
            {listing.timezone}
          </dd>
        </div>
        <div>
          <dt>{t("costs")}</dt>
          <dd>{t(listing.costs)}</dd>
        </div>
        <div>
          <dt>{t("accessibility")}</dt>
          <dd>{t(listing.accessibility)}</dd>
        </div>
      </dl>
      <p>
        {listing.protected_location ? t("protected") : listing.public_address}
      </p>
      <p className="quiet">
        {t("pathway")}:{" "}
        {listing.public_pathway.startsWith("In-app referral only")
          ? t("demoPathway")
          : listing.public_pathway}
      </p>
      {listing.pause_reason && <p>{listing.pause_reason}</p>}
      {children}
    </article>
  );
}
export function Disclosure({
  referral: r,
  actions,
}: {
  referral: Referral;
  actions?: React.ReactNode;
}) {
  const { t, locale } = useLocale();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <article className="disclosure" data-referral-id={r.id}>
      <p className="eyebrow">
        {t("referralReference")} {r.id.slice(0, 8).toUpperCase()}
      </p>
      <div className="card-heading">
        <h3>{r.recipient}</h3>
        <Status value={r.state} />
      </div>
      <p>
        {t("purpose")}: <strong>{t(r.purpose)}</strong>
      </p>
      <p className="quiet">
        {t("expiry")}: {new Date(r.expires_at).toLocaleString(locale)}
      </p>
      <p>{t("consentScope")}</p>
      <dl className="disclosure-fields">
        {Object.entries(r.payload).map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>
              {k === "note"
                ? v
                : k === "requested_language"
                  ? languageNames[normalizeLocale(v)]
                  : t(v)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="quiet">{t("consentNote")}</p>
      {["sent", "acknowledged", "completed"].includes(r.state) && (
        <p className="quiet">{t("refAckNote")}</p>
      )}
      {r.sent_at &&
        !r.acknowledged_at &&
        now - new Date(r.sent_at).getTime() > 15 * 60000 && (
          <p role="status" className="notice">
            {t("overDue")}
          </p>
        )}
      {r.outcome && (
        <p>
          {t("outcome")}: {t(r.outcome)}
        </p>
      )}
      {actions && <div className="action-row">{actions}</div>}
    </article>
  );
}
export function Conversation({
  requestId,
  onReferrals,
}: {
  requestId?: string;
  onReferrals?: (rows: Referral[]) => void;
}) {
  const { t, locale } = useLocale();
  const [room, setRoom] = useState<{
      status: string;
      public_code: string;
      messages: {
        id: string;
        sender: string;
        body: string;
        created_at: string;
      }[];
      organisation: string;
    } | null>(null),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  const epoch = useRef(0),
    pending = useRef<{ message: string; nonce: string } | null>(null),
    sending = useRef(false),
    callback = useRef(onReferrals);
  useEffect(() => {
    callback.current = onReferrals;
  }, [onReferrals]);
  const path = requestId
    ? `v2/requests/${requestId}/messages`
    : "v2/private/room";
  const load = useCallback(async () => {
    if (document.hidden || !navigator.onLine || sending.current) return;
    const gen = epoch.current;
    try {
      const data = await api<
        NonNullable<typeof room> & { referrals?: Referral[] }
      >(path);
      if (gen !== epoch.current || document.hidden) return;
      setRoom(data);
      setError("");
      if (data.referrals) callback.current?.(data.referrals);
    } catch (e) {
      if (gen === epoch.current) {
        setRoom(null);
        callback.current?.([]);
        setError(e instanceof Error ? e.message : "error");
      }
    }
  }, [path]);
  const invalidateGeneration = useCallback(() => {
    epoch.current++;
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    const hide = () => {
      epoch.current++;
      if (document.hidden || !navigator.onLine) {
        setRoom(null);
        callback.current?.([]);
        setBusy(false);
        sending.current = false;
        setOnline(false);
      } else {
        setOnline(true);
        load();
      }
    };
    window.addEventListener("offline", hide);
    window.addEventListener("online", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      invalidateGeneration();
      clearInterval(timer);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [load, invalidateGeneration]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !draft.trim() || !navigator.onLine) return;
    const gen = ++epoch.current;
    sending.current = true;
    setBusy(true);
    const value =
      pending.current?.message === draft.trim()
        ? pending.current
        : { message: draft.trim(), nonce: crypto.randomUUID() };
    pending.current = value;
    try {
      const data = await api<NonNullable<typeof room>>(path, value);
      if (gen === epoch.current) {
        setRoom(data);
        setDraft("");
        pending.current = null;
        setError("");
      }
    } catch (e) {
      if (gen === epoch.current)
        setError(e instanceof Error ? e.message : "error");
    } finally {
      if (gen === epoch.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  const active =
    room &&
    ["submitted", "acknowledged", "assigned", "in_progress"].includes(
      room.status,
    );
  return (
    <section className="request-room">
      <ErrorNotice error={error} />
      {!online && <p role="status">{t("offline")}</p>}
      {room && (
        <>
          <div className="room-heading">
            <p className="eyebrow">
              {t("reference")} {room.public_code}
            </p>
            <Status value={room.status} />
          </div>
          <p>
            {room.organisation} · {t("practitioner")}
          </p>
          <p className="quiet">{t("ackNote")}</p>
          <h2>{t("private_conversation")}</h2>
          <p className="quiet">{t("messageNote")}</p>
          <div
            role="log"
            aria-label={t("private_conversation")}
            aria-live="polite"
          >
            <ol className="conversation-messages">
              {room.messages.length ? (
                room.messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.sender === (requestId ? "staff" : "patient")
                        ? "mine"
                        : ""
                    }
                  >
                    <div className="message-meta">
                      <strong>
                        {t(
                          m.sender === (requestId ? "staff" : "patient")
                            ? "you"
                            : m.sender === "staff"
                              ? "practitioner"
                              : "patient",
                        )}
                      </strong>
                      <time>
                        {new Date(m.created_at).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{m.body}</p>
                  </li>
                ))
              ) : (
                <li className="quiet">{t("noMessages")}</li>
              )}
            </ol>
          </div>
          {active && (
            <form onSubmit={send}>
              <label className="field">
                {t("message")}
                <textarea
                  value={draft}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setDraft(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="composer-footer">
                <span className="quiet">{draft.length}/500</span>
                <button
                  className="button primary"
                  disabled={busy || !draft.trim() || !online}
                >
                  {t("sendMessage")}
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </form>
          )}
        </>
      )}
      <button className="text-button" onClick={load}>
        {t("refresh")}
      </button>
    </section>
  );
}

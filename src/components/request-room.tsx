"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Icon } from "./ui";
import { accessCapability, displayAccessCode } from "@/lib/private-access";
import { conversationCopy } from "@/i18n/conversations";
import type { Locale } from "@/lib/contracts";
type Message = {
  id: string;
  sender: "patient" | "staff";
  body: string;
  created_at: string;
};
type Room = {
  public_code: string;
  status: string;
  expires_at: string;
  messages: Message[];
};
export function RequestAccess({
  clinic,
  locale,
}: {
  clinic: string;
  locale: Locale;
}) {
  const [input, setInput] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const t = conversationCopy[locale];
  if (token)
    return <RequestRoom clinic={clinic} capability={token} locale={locale} />;
  return (
    <form
      className="access-entry"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(false);
        try {
          const cap = await accessCapability(input);
          await api(`public/clinics/${clinic}/conversation`, {
            capability: cap,
          });
          if (alive.current) {
            setInput("");
            setToken(cap);
          }
        } catch {
          if (alive.current) setError(true);
        } finally {
          if (alive.current) setBusy(false);
        }
      }}
    >
      <label className="field">
        {t.access}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={48}
          required
          aria-describedby="access-hint"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        />
      </label>
      <p className="quiet" id="access-hint">
        {t.accessHint}
      </p>
      {error && (
        <p role="alert" className="error">
          {t.invalid}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? t.loading : t.open}
        <Icon name="key" size={18} />
      </button>
    </form>
  );
}
export function PrivateAccessCode({
  value,
  locale,
  allowCopy = true,
}: {
  value: string;
  locale: Locale;
  allowCopy?: boolean;
}) {
  const t = conversationCopy[locale];
  const [show, setShow] = useState(false),
    [copied, setCopied] = useState(false);
  return (
    <section className="private-key">
      <button
        className="text-button"
        aria-expanded={show}
        onClick={() => {
          setShow(!show);
          setCopied(false);
        }}
      >
        <Icon name="key" size={18} />
        {show ? t.hide : t.show}
      </button>
      {show && (
        <>
          <label className="field">
            {t.access}
            <input
              aria-label={t.access}
              readOnly
              value={displayAccessCode(value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="quiet">{t.keep}</p>
          {allowCopy && (
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(displayAccessCode(value));
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t.copied : t.copy}
            </button>
          )}
        </>
      )}
    </section>
  );
}
export default function RequestRoom({
  clinic,
  capability,
  requestId,
  locale = "en",
}: {
  clinic?: string;
  capability?: string;
  requestId?: string;
  locale?: Locale;
}) {
  const t = conversationCopy[locale],
    staff = !!requestId;
  const [room, setRoom] = useState<Room | null>(null),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(true),
    [gone, setGone] = useState(false),
    [failed, setFailed] = useState(false),
    [notice, setNotice] = useState("");
  const epoch = useRef(0),
    pending = useRef<{ message: string; nonce: string } | null>(null);
  const finished = useRef(false),
    sending = useRef(false);
  const messageList = useRef<HTMLOListElement>(null),
    followMessages = useRef(true);
  useEffect(() => {
    const list = messageList.current;
    if (list && followMessages.current) list.scrollTop = list.scrollHeight;
  }, [room?.messages.length]);
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);
  const request = useCallback(
    (message?: { message: string; nonce: string }) =>
      staff
        ? api<Room>(`staff/requests/${requestId}/messages`, message)
        : api<Room>(`public/clinics/${clinic}/conversation`, {
            capability,
            ...(message ? { message } : {}),
          }),
    [staff, requestId, clinic, capability],
  );
  const refresh = useCallback(async () => {
    const generation = epoch.current;
    if (
      document.hidden ||
      !navigator.onLine ||
      finished.current ||
      sending.current
    )
      return;
    try {
      const value = await request();
      if (generation !== epoch.current || document.hidden) return;
      setRoom(value);
      setConnected(true);
      setGone(false);
      if (["completed", "cancelled"].includes(value.status))
        finished.current = true;
    } catch (e) {
      if (generation !== epoch.current) return;
      setRoom(null);
      setConnected(false);
      if (
        e instanceof Error &&
        [
          "request_not_found",
          "access_denied",
          "sign_in_required",
          "staff_access_required",
        ].includes(e.message)
      ) {
        setGone(true);
        setDraft("");
        pending.current = null;
        finished.current = true;
      }
    }
  }, [request]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const hide = () => {
      if (document.hidden || !navigator.onLine) {
        invalidate();
        setRoom(null);
        setConnected(false);
        setBusy(false);
      } else refresh();
    };
    window.addEventListener("offline", hide);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", hide);
    return () => {
      invalidate();
      clearInterval(timer);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [refresh, invalidate]);
  const active =
    room && ["new", "acknowledged", "in_progress"].includes(room.status);
  useEffect(() => {
    if (room && !active) {
      setDraft("");
      pending.current = null;
      setFailed(false);
    }
  }, [room, active]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy || !connected || !active || !navigator.onLine)
      return;
    sending.current = true;
    const generation = ++epoch.current;
    const message =
      pending.current?.message === draft.trim()
        ? pending.current
        : { message: draft.trim(), nonce: crypto.randomUUID() };
    pending.current = message;
    setBusy(true);
    setFailed(false);
    setNotice("");
    try {
      const result = await request(message);
      if (generation !== epoch.current) return;
      setRoom(result);
      setDraft("");
      pending.current = null;
      setNotice(t.sent);
    } catch {
      if (generation === epoch.current) setFailed(true);
    } finally {
      sending.current = false;
      if (generation === epoch.current) setBusy(false);
    }
  }
  if (gone)
    return (
      <p className="room-unavailable" role="status">
        {t.unavailable}
      </p>
    );
  const status = room
    ? ({
        new: t.waiting,
        acknowledged: t.acknowledged,
        in_progress: t.progress,
        completed: t.completed,
        cancelled: t.cancelled,
      }[room.status] ?? t.waiting)
    : t.loading;
  const index = room
    ? ["new", "acknowledged", "in_progress", "completed"].indexOf(room.status)
    : -1;
  return (
    <section className="request-room" aria-label={t.chat}>
      {!staff && (
        <div className="request-progress">
          <p className="eyebrow">
            {t.reference} {room?.public_code ?? ""}
          </p>
          <h2 aria-live="polite">{status}</h2>
          <ol className="progress-track" aria-label={t.title}>
            {[t.waiting, t.acknowledged, t.progress, t.completed].map(
              (label, i) => (
                <li
                  key={i}
                  className={i <= index ? "reached" : ""}
                  aria-current={i === index ? "step" : undefined}
                >
                  <span aria-hidden="true">{i < index ? "✓" : i + 1}</span>
                  <span>{label}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      )}
      <div className="conversation-heading">
        <h2>
          <Icon name="message" />
          {t.chat}
        </h2>
        <span className="quiet">{t.updated}</span>
      </div>
      <p className="quiet conversation-note">{t.note}</p>
      {!connected && (
        <div className="offline-conversation" role="status">
          <Icon name="offline" />
          <p>{t.offline}</p>
          <button className="text-button" onClick={refresh}>
            {t.refresh}
          </button>
        </div>
      )}
      {room && !active ? (
        <p role="status">{t.closed}</p>
      ) : (
        <>
          <div
            role="log"
            aria-label={t.chat}
            aria-live="polite"
            aria-relevant="additions"
          >
            <ol
              className="conversation-messages"
              tabIndex={0}
              ref={messageList}
              onScroll={(e) => {
                const list = e.currentTarget;
                followMessages.current =
                  list.scrollHeight - list.scrollTop - list.clientHeight < 80;
              }}
            >
              {connected &&
                room?.messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.sender === (staff ? "staff" : "patient")
                        ? "message-own"
                        : "message-other"
                    }
                  >
                    <div>
                      <b>
                        {m.sender === (staff ? "staff" : "patient")
                          ? t.you
                          : m.sender === "staff"
                            ? t.staff
                            : t.patient}
                      </b>
                      <time dateTime={m.created_at}>
                        {new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Africa/Harare",
                        }).format(new Date(m.created_at))}
                      </time>
                    </div>
                    <p>{m.body}</p>
                  </li>
                ))}
              {connected && room?.messages.length === 0 && (
                <li className="message-empty">{t.empty}</li>
              )}
            </ol>
          </div>
          <form onSubmit={send} className="message-compose">
            <div className="quick-replies" aria-label={t.quick}>
              {(staff
                ? [t.staff1, t.staff2, t.staff3]
                : [t.quick1, t.quick2, t.quick3]
              ).map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={!connected || !active || busy}
                  onClick={() => {
                    setDraft(value);
                    setNotice("");
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="field">
              {t.message}
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setNotice("");
                }}
                maxLength={500}
                rows={3}
                autoComplete="off"
                disabled={!connected || !active || busy}
              />
            </label>
            <div className="compose-bottom">
              <span className="quiet">
                {draft.length}/500 {t.chars}
              </span>
              <button
                className="button primary"
                disabled={!draft.trim() || busy || !connected || !active}
              >
                {busy ? t.sending : failed ? t.retry : t.send}
                <Icon name="arrow" size={18} />
              </button>
            </div>
            {failed && (
              <p className="error" role="alert">
                {t.failed}
              </p>
            )}
            <p className="sr-only" role="status">
              {notice}
            </p>
          </form>
        </>
      )}
    </section>
  );
}

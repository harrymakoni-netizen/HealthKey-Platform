"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Heart,
  Flower2,
  Baby,
  Sun,
  ShieldCheck,
  Leaf,
  MessageCircle,
  LockKeyhole,
  Hand,
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
  Accessibility,
  WifiOff,
  X,
  LogOut,
  Clock,
  KeyRound,
  SlidersHorizontal,
  ClipboardList,
  BarChart3,
  Users,
  ChevronDown,
  ShieldPlus,
} from "lucide-react";
const icons = {
  heart: Heart,
  flower: Flower2,
  baby: Baby,
  sun: Sun,
  shield: ShieldCheck,
  leaf: Leaf,
  message: MessageCircle,
  lock: LockKeyhole,
  hand: Hand,
  arrow: ArrowRight,
  back: ArrowLeft,
  check: Check,
  globe: Globe,
  access: Accessibility,
  offline: WifiOff,
  close: X,
  logout: LogOut,
  clock: Clock,
  key: KeyRound,
  settings: SlidersHorizontal,
  queue: ClipboardList,
  chart: BarChart3,
  users: Users,
  down: ChevronDown,
  brand: ShieldPlus,
};
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const Component = icons[name as keyof typeof icons] ?? LockKeyhole;
  return <Component size={size} strokeWidth={1.7} aria-hidden="true" />;
}
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="HealthKey home">
      <span className="brand-mark">
        <Icon name="brand" size={29} />
      </span>
      <span>
        Health<span className="brand-key">Key</span>
      </span>
    </a>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  closeLabel = "Close",
}: {
  title: string;
  closeLabel?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-top">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
let viewSecret = "";
export function resetPrivateView() {
  viewSecret = "";
}
function privateView() {
  if (!viewSecret)
    viewSecret = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return viewSecret;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(path.startsWith("v2/") ? { "X-HK-View": privateView() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "temporarily_unavailable");
  return data;
}

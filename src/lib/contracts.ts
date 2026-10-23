import { z } from "zod";
export const locales = ["en", "nd", "zu", "xh", "af"] as const;
export type Locale = (typeof locales)[number];
export const preferences = [
  "spoken",
  "writing",
  "pictures",
  "sign",
  "support",
] as const;
export const requestSchema = z
  .object({
    service_id: z.string().uuid(),
    communication_pref: z.enum(preferences).nullable(),
    capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const actionSchema = z
  .object({
    action: z.enum(["acknowledge", "assign", "start", "complete"]),
    version: z.number().int().nonnegative(),
    assignee: z.string().uuid().optional(),
  })
  .strict();
export const settingsSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    communication_options: z.array(z.enum(preferences)).max(5),
    languages: z.array(z.enum(locales)).min(1),
    idle_seconds: z.number().int().min(60).max(600),
    ttl_minutes: z.number().int().min(5).max(120),
    urgent_enabled: z.boolean(),
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    after_hours: z.string().max(200),
    translation_reviewed: z.boolean(),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export type Service = {
  id: string;
  key: string;
  icon: string;
  active: boolean;
  sort_order: number;
  labels: Record<Locale, string>;
  help: Record<Locale, string>;
};
export type ClinicConfig = {
  id: string;
  code: string;
  name: string;
  version: number;
  demo: boolean;
  settings: Settings;
  services: Service[];
};
export type Staff = {
  id: string;
  clinic_id: string;
  name: string;
  role: "intake" | "clinician" | "admin" | "platform" | "verifier";
  active: boolean;
  service_ids: string[];
  clinic_name?: string;
  clinic_code?: string;
};
export type QueueItem = {
  id: string;
  public_code: string;
  service_id: string;
  label: string;
  communication_pref: string | null;
  status: "new" | "acknowledged" | "in_progress";
  created_at: string;
  expires_at: string;
  assigned_to: string | null;
  version: number;
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function allowedAction(status: string, action: string) {
  return (
    (action === "acknowledge" && status === "new") ||
    (action === "start" && status === "acknowledged") ||
    (action === "complete" && status === "in_progress") ||
    (action === "assign" &&
      ["new", "acknowledged", "in_progress"].includes(status))
  );
}
export const statusFor: Record<string, string> = {
  acknowledge: "acknowledged",
  start: "in_progress",
  complete: "completed",
};

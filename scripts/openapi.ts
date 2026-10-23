import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  requestSchema,
  settingsSchema,
  actionSchema,
} from "../src/lib/contracts";
const messageSchema = z
  .object({ message: z.string().trim().min(1).max(500), nonce: z.uuid() })
  .strict();
const conversationSchema = z
  .object({
    capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    message: messageSchema.optional(),
  })
  .strict();
const paths: Record<string, Record<string, unknown>> = {};
const entries: [string, string, string, string?][] = [
  ["get", "/public/clinics/{code}/config", "Published clinic configuration"],
  [
    "post",
    "/public/clinics/{code}/requests",
    "Create anonymous request",
    "CreateRequest",
  ],
  ["post", "/public/requests/resolve", "Resolve current request", "Capability"],
  [
    "post",
    "/public/requests/{publicCode}/cancel",
    "Cancel pending request",
    "Capability",
  ],
  ["post", "/public/clinics/{code}/metrics", "Count unlinked usage"],
  ["post", "/auth/login", "Staff sign-in"],
  ["post", "/auth/logout", "Staff sign-out"],
  ["post", "/auth/mfa/enroll", "Enroll staff authenticator"],
  ["post", "/auth/mfa", "Verify authenticator"],
  [
    "post",
    "/public/clinics/{code}/conversation",
    "Read progress or send a private message",
    "Conversation",
  ],
  ["get", "/staff/requests/{id}/messages", "Read authorized request messages"],
  ["post", "/staff/requests/{id}/messages", "Send staff message", "Message"],
  ["get", "/staff/me", "Current staff membership"],
  ["get", "/staff/queue", "Scoped active queue"],
  [
    "patch",
    "/staff/requests/{id}",
    "Transition or assign request",
    "RequestAction",
  ],
  ["get", "/admin/config", "Own clinic configuration"],
  ["put", "/admin/config/draft", "Save complete configuration draft"],
  ["post", "/admin/config/publish", "Publish exact previewed draft"],
  ["get", "/admin/staff", "Own clinic staff"],
  ["patch", "/admin/staff/{id}", "Update clinic staff permissions"],
  ["get", "/admin/analytics", "Suppressed operational report"],
  ["get", "/admin/usage", "Suppressed unlinked usage"],
  ["get", "/admin/audit", "Administrative change history"],
  ["get", "/platform/organizations", "List organizations"],
  ["post", "/platform/organizations", "Create organization"],
  ["get", "/platform/clinics", "List clinic metadata"],
  ["post", "/platform/clinics", "Create paused clinic"],
  ["patch", "/platform/clinics/{id}", "Pause or restore clinic"],
  ["get", "/health", "Minimal health check"],
  ["get", "/internal/cleanup", "Scheduled retention cleanup"],
  ["post", "/internal/cleanup", "Operator-triggered retention cleanup"],
];
for (const [method, path, summary, schema] of entries) {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const publicAccess =
    path.startsWith("/public/") || path === "/health" || path === "/auth/login";
  (paths[path] ??= {})[method] = {
    summary,
    parameters,
    security: publicAccess
      ? []
      : path.startsWith("/internal/")
        ? [{ cron: [] }]
        : [{ staff: [] }],
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/" + schema },
              },
            },
          },
        }
      : {}),
    responses: {
      [path.endsWith("/requests") && method === "post" ? "201" : "200"]: {
        description: "Operation succeeded; see API.md for response contract",
      },
      "400": { description: "Invalid request" },
      "401": { description: "Authentication required" },
      "403": { description: "Access or origin denied" },
      "409": { description: "Conflicting state/version" },
      "429": { description: "Rate limited" },
      "503": { description: "Service or retention unavailable" },
    },
  };
}
writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "HealthKey API",
        version: "0.1.0",
        description:
          "Synthetic demonstration API. API.md documents full operational semantics and additional request contracts.",
      },
      servers: [{ url: "/api" }],
      paths,
      components: {
        securitySchemes: {
          staff: { type: "apiKey", in: "cookie", name: "hk_staff" },
          cron: { type: "http", scheme: "bearer" },
        },
        schemas: {
          Message: z.toJSONSchema(messageSchema),
          Conversation: z.toJSONSchema(conversationSchema),
          CreateRequest: z.toJSONSchema(requestSchema),
          RequestAction: z.toJSONSchema(actionSchema),
          Settings: z.toJSONSchema(settingsSchema),
          Capability: {
            type: "object",
            required: ["capability"],
            additionalProperties: false,
            properties: {
              capability: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
            },
          },
        },
      },
    },
    null,
    2,
  ) + "\n",
);

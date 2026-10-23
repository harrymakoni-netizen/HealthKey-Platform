import { describe, it, expect } from "vitest";
import { requestSchema, allowedAction } from "../src/lib/contracts";
import { messages } from "../src/i18n/messages";
describe("Public request contract", () => {
  const valid = {
    service_id: "11111111-1111-4111-8111-111111111111",
    communication_pref: null,
    capability: "a".repeat(43),
  };
  it("accepts only a category, optional preference and unguessable capability", () =>
    expect(requestSchema.safeParse(valid).success).toBe(true));
  for (const field of [
    "name",
    "phone",
    "date_of_birth",
    "symptoms",
    "clinic_id",
    "expires_at",
    "status",
  ])
    it(`rejects ${field}`, () =>
      expect(
        requestSchema.safeParse({ ...valid, [field]: "unexpected" }).success,
      ).toBe(false));
  it("rejects unconfigured communication preferences", () =>
    expect(
      requestSchema.safeParse({ ...valid, communication_pref: "email" })
        .success,
    ).toBe(false));
  it("rejects short capabilities", () =>
    expect(
      requestSchema.safeParse({ ...valid, capability: "H7K2" }).success,
    ).toBe(false));
});
describe("Request lifecycle", () => {
  it("allows acknowledge then start then complete", () => {
    expect(allowedAction("new", "acknowledge")).toBe(true);
    expect(allowedAction("acknowledged", "start")).toBe(true);
    expect(allowedAction("in_progress", "complete")).toBe(true);
  });
  it("prevents skipping stages and reopening closed requests", () => {
    expect(allowedAction("new", "complete")).toBe(false);
    expect(allowedAction("completed", "start")).toBe(false);
    expect(allowedAction("expired", "assign")).toBe(false);
  });
});
it("has every public message in English, Shona and Ndebele", () => {
  for (const locale of ["nd", "zu", "xh", "af"] as const) {
    expect(Object.keys(messages[locale]).sort()).toEqual(
      Object.keys(messages.en).sort(),
    );
    expect(
      Object.values(messages[locale]).every((v) => v.trim().length > 0),
    ).toBe(true);
  }
});

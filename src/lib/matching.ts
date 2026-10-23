export type Listing = {
  id: string;
  clinic_id: string;
  public_name: string;
  categories: string[];
  area: string;
  public_pathway: string;
  public_address: string | null;
  protected_location: boolean;
  provider_languages: string[];
  access_requirements: string;
  accessibility: string;
  costs: string;
  timezone: string;
  opens: string;
  closes: string;
  days: number[];
  identity_checked_at: string | null;
  identity_source: string;
  details_confirmed_at: string | null;
  availability: string;
  availability_expires_at: string;
  monitored: boolean;
  pause_reason: string;
  version: number;
};
export const RULESET = "directory-1";
export function assess(
  p: Listing,
  now = new Date(),
  need?: {
    category?: string;
    language?: string;
    area?: string;
    accessible?: boolean;
  },
) {
  const age = p.details_confirmed_at
    ? (now.getTime() - new Date(p.details_confirmed_at).getTime()) / 86400000
    : Infinity;
  const freshness = age <= 7 ? "recent" : age <= 14 ? "caution" : "stale";
  const available =
    new Date(p.availability_expires_at) > now ? p.availability : "unknown";
  let open = false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: p.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const part = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      part("weekday"),
    );
    const time = `${part("hour")}:${part("minute")}`;
    open =
      p.days.includes(day) &&
      time >= p.opens.slice(0, 5) &&
      time < p.closes.slice(0, 5);
  } catch {}
  const reasons: string[] = [],
    questions: string[] = [];
  if (need?.category && !p.categories.includes(need.category))
    return {
      ...p,
      freshness,
      available,
      open,
      tier: "excluded",
      reasons: ["category_mismatch"],
      questions,
      ruleset: RULESET,
      score: 0,
    };
  if (available === "unavailable" || !open || !p.monitored)
    return {
      ...p,
      freshness,
      available,
      open,
      tier: "excluded",
      reasons: [
        !open ? "closed" : !p.monitored ? "not_monitored" : "unavailable",
      ],
      questions,
      ruleset: RULESET,
      score: 0,
    };
  reasons.push("service_capability");
  if (freshness === "stale") questions.push("stale");
  else reasons.push(freshness);
  if (available !== "accepting") questions.push(available);
  else reasons.push("accepting");
  if (!p.identity_checked_at) questions.push("identity_unknown");
  else reasons.push("identity_checked");
  if (need?.language && !p.provider_languages.includes(need.language))
    questions.push("language_unconfirmed");
  else if (need?.language) reasons.push("language_supported");
  if (p.access_requirements === "unknown")
    questions.push("eligibility_unknown");
  if (need?.accessible && p.accessibility !== "step_free")
    questions.push("accessibility_unknown");
  if (need?.area === p.area) reasons.push("area_relevant");
  return {
    ...p,
    freshness,
    available,
    open,
    tier: questions.length ? "confirm" : "accepting",
    reasons,
    questions,
    ruleset: RULESET,
    score:
      (questions.length ? 0 : 100) +
      (need?.area === p.area ? 10 : 0) +
      (need?.language && p.provider_languages.includes(need.language) ? 5 : 0),
  };
}
export function matchListings(
  rows: Listing[],
  need: Parameters<typeof assess>[2],
  now = new Date(),
) {
  return rows
    .map((p) => assess(p, now, need))
    .filter((p) => p.tier !== "excluded")
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

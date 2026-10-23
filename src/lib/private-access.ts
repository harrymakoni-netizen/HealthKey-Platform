const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newAccessCode() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(20)),
    (n) => alphabet[n & 31],
  ).join("");
}
export function displayAccessCode(value: string) {
  return value.match(/.{1,5}/g)?.join("-") ?? value;
}
export async function accessCapability(value: string) {
  const normalized = value.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[0-9A-HJKMNP-TV-Z]{20}$/.test(normalized))
    throw Error("invalid_access_code");
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

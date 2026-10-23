// Neon strips forged X-Neon-* headers before invoking this function.
const retention = {
  async fetch(request) {
    if (
      request.method !== "POST" ||
      !request.headers.get("x-neon-trigger-invocation-id")
    )
      return new Response("Forbidden", { status: 403 });
    const response = await fetch(process.env.HEALTHKEY_CLEANUP_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HEALTHKEY_CRON_SECRET}` },
      signal: AbortSignal.timeout(20000),
    });
    return new Response(JSON.stringify({ ok: response.ok }), {
      status: response.ok ? 200 : 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  },
};
export default retention;

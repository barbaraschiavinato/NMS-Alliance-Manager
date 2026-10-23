export function appOrigin() {
  let url: URL;
  try {
    url = new URL(process.env.AUTH_URL ?? "");
  } catch {
    throw new Error("Configure AUTH_URL for notification detail links.");
  }
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
  )
    throw new Error("AUTH_URL must use HTTPS (HTTP localhost is allowed for development).");
  return url.origin;
}

export async function postJson(url: URL | string, body: unknown, provider: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
  } catch {
    // Do not include fetch errors: their URLs may contain provider credentials.
    throw new Error(`${provider}: network error or timeout.`);
  }
  if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}; delivery was not retried.`);
  if (provider === "Telegram") {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true)
      throw new Error("Telegram: delivery was not confirmed.");
  }
}

export function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

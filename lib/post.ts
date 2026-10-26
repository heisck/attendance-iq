// Student pages: POST JSON and get back { ok, status, error, data }, with a friendly error for no connection.
export async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: !!res?.ok, status: res?.status ?? 0, error: (data.error as string) ?? "No connection. Check your data or Wi-Fi and try again.", data };
}

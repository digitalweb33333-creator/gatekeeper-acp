// Minimal robust HTTP client: timeout + retry/backoff. Uses global fetch (Node >=18).
export async function fetchJson(url, { timeoutMs = 4000, retries = 2, headers = {}, method = "GET", body } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: { accept: "application/json", "user-agent": "gatekeeper-acp/0.1", ...headers },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        // 4xx (except 429) are not worth retrying
        if (res.status < 500 && res.status !== 429) throw lastErr;
      } else {
        const json = await res.json();
        return { ok: true, json, latencyMs: Date.now() - started, status: res.status };
      }
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
    if (attempt < retries) await sleep(150 * Math.pow(2, attempt));
  }
  return { ok: false, error: String(lastErr && lastErr.message || lastErr), json: null };
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Race a set of async source-thunks, return the first that resolves ok, plus timings.
export async function firstOk(thunks) {
  const results = await Promise.allSettled(thunks.map((fn) => fn()));
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.ok) return r.value;
  }
  return { ok: false };
}

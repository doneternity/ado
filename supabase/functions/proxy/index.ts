import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const frontendOrigins = (Deno.env.get("FRONTEND_ORIGIN") ?? "*")
  .split(",").map((s) => s.trim());
const providerKeySecret = Deno.env.get("PROVIDER_KEY_SECRET") ?? "";

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed =
    frontendOrigins.includes("*") || frontendOrigins.includes(origin)
      ? origin || "*"
      : frontendOrigins[0]!;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function errResp(
  req: Request,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...extra } }),
    { status, headers: { ...cors(req), "Content-Type": "application/json" } },
  );
}

async function decryptApiKey(val: string): Promise<string> {
  if (!val.startsWith("enc:")) return val;
  if (!providerKeySecret) throw new Error("PROVIDER_KEY_SECRET not set");

  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(providerKeySecret),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const data = Uint8Array.from(atob(val.slice(4).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const nonce = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plain);
}

async function sha256Hex(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/proxy/, "") || "/";

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return errResp(req, 401, "UNAUTHORIZED", "missing bearer token");
  }
  const token = auth.slice(7).trim();
  const keyHashHex = await sha256Hex(token);

  const { data: rows, error: keyErr } = await supabase.rpc("lookup_key", {
    p_key_hash_hex: keyHashHex,
  });
  if (keyErr) {
    console.error("lookup_key rpc error:", JSON.stringify(keyErr));
    return errResp(req, 500, "INTERNAL", "auth lookup failed");
  }
  if (!rows?.length) {
    return errResp(req, 401, "UNAUTHORIZED", "invalid key");
  }
  const key = rows[0] as {
    key_id: string;
    user_id: string;
    daily_limit: number;
    banned: boolean;
  };
  if (key.banned) {
    return errResp(req, 401, "UNAUTHORIZED", "account banned");
  }

  // ── Active providers (failover order, oldest first) ───────────────────────
  const { data: providers, error: provErr } = await supabase
    .from("providers")
    .select("base_url, api_key")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (provErr) {
    console.error("provider query error:", JSON.stringify(provErr));
    return errResp(req, 503, "NO_PROVIDER", `provider query failed: ${provErr.message}`);
  }
  if (!providers?.length) {
    return errResp(req, 503, "NO_PROVIDER", "no active provider configured");
  }

  // Some providers (e.g. fanzisima) reject non-SDK User-Agents; "node" is
  // accepted by every provider we route to.
  function upstreamHeaders(apiKey: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": "node",
    };
  }

  // ── /models — merge every provider's catalogue, free, no quota ────────────
  if (path === "/models" && req.method === "GET") {
    const merged: unknown[] = [];
    const seen = new Set<string>();
    for (const p of providers) {
      let apiKey: string;
      try { apiKey = await decryptApiKey(p.api_key); } catch { continue; }
      try {
        const upstream = await fetch(`${p.base_url}/models`, { headers: upstreamHeaders(apiKey) });
        if (!upstream.ok) continue;
        const json = await upstream.json() as { data?: { id?: string }[] };
        for (const m of json.data ?? []) {
          if (m.id && !seen.has(m.id)) { seen.add(m.id); merged.push(m); }
        }
      } catch { /* skip unreachable provider */ }
    }
    return new Response(JSON.stringify({ object: "list", data: merged }), {
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  // ── Forward to upstream — try each provider until one returns 2xx ─────────
  const reqBody = req.method !== "GET" ? await req.text() : undefined;
  let lastErr: { status: number; body: string; contentType: string } | null = null;

  function recordErr(status: number, code: string, message: string) {
    lastErr = {
      status,
      body: JSON.stringify({ error: { code, message } }),
      contentType: "application/json",
    };
  }

  for (const p of providers) {
    let apiKey: string;
    try {
      apiKey = await decryptApiKey(p.api_key);
    } catch (e) {
      console.error(`decrypt failed for ${p.base_url}:`, e);
      recordErr(502, "PROVIDER_CONFIG", `${p.base_url}: provider key could not be decrypted`);
      continue;
    }

    let upResp: Response;
    try {
      upResp = await fetch(`${p.base_url}${path}`, {
        method: req.method,
        headers: upstreamHeaders(apiKey),
        body: reqBody,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "connection failed";
      console.error(`fetch failed for ${p.base_url}:`, detail);
      recordErr(502, "PROVIDER_UNREACHABLE", `${p.base_url}: ${detail}`);
      continue; // provider unreachable — try the next
    }

    if (!upResp.ok) {
      // Buffer the error so it can be surfaced if every provider fails.
      lastErr = {
        status: upResp.status,
        body: await upResp.text(),
        contentType: upResp.headers.get("Content-Type") ?? "application/json",
      };
      continue;
    }

    // This provider handled the request — charge quota, then stream back.
    const { data: used, error: quotaErr } = await supabase.rpc("charge_quota", {
      p_key_id: key.key_id,
      p_daily_limit: key.daily_limit,
    });
    if (quotaErr) {
      return errResp(req, 500, "INTERNAL", "quota update failed");
    }
    if (used === null) {
      return errResp(req, 429, "QUOTA_EXCEEDED", "daily quota exceeded", {
        limit: key.daily_limit,
      });
    }

    const contentType = upResp.headers.get("Content-Type") ?? "application/json";
    const isStream = contentType.includes("text/event-stream");
    return new Response(upResp.body, {
      status: upResp.status,
      headers: {
        ...cors(req),
        "Content-Type": contentType,
        ...(isStream && {
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        }),
      },
    });
  }

  // Every active provider rejected the request — surface the last error.
  if (lastErr) {
    return new Response(lastErr.body, {
      status: lastErr.status,
      headers: { ...cors(req), "Content-Type": lastErr.contentType },
    });
  }
  return errResp(req, 502, "NO_PROVIDER", "no active provider could handle the request");
});

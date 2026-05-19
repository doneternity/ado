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

  // ── Active provider ───────────────────────────────────────────────────────
  const { data: provider, error: provErr } = await supabase
    .from("providers")
    .select("base_url, api_key")
    .eq("is_active", true)
    .single();
  if (provErr) {
    console.error("provider query error:", JSON.stringify(provErr));
    return errResp(req, 503, "NO_PROVIDER", `provider query failed: ${provErr.message}`);
  }
  if (!provider) {
    return errResp(req, 503, "NO_PROVIDER", "no active provider row found");
  }

  let plainApiKey: string;
  try {
    plainApiKey = await decryptApiKey(provider.api_key);
  } catch {
    return errResp(req, 500, "INTERNAL", "provider configuration error");
  }

  // ── /models — free, no quota ───────────────────────────────────────────────
  if (path === "/models" && req.method === "GET") {
    const upstream = await fetch(`${provider.base_url}/models`, {
      headers: { Authorization: `Bearer ${plainApiKey}` },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  // ── Forward to upstream LLM ───────────────────────────────────────────────
  const upstreamUrl = `${provider.base_url}${path}`;
  const body = req.method !== "GET" ? await req.text() : undefined;

  const upResp = await fetch(upstreamUrl, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${plainApiKey}`,
    },
    body,
  });

  // ── Quota — charge only on successful upstream response ───────────────────
  if (upResp.ok) {
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
});

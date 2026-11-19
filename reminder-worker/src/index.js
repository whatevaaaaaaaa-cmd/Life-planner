// Life Planner reminder service.
// Stores each device's push subscription with its chosen reminder time, then sends an
// empty "reminder" push at that time. No planner entries are stored or sent here.
const enc = new TextEncoder();
const ALLOWED_ORIGINS = ["https://whatevaaaaaaaa-cmd.github.io"];

function b64u(buf) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha(text) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

function parseTime(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || "");
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function localParts(ms, offsetMin) {
  const d = new Date(ms + offsetMin * 60000);
  return {
    date: d.toISOString().slice(0, 10),
    mins: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

// VAPID: a short signed token that proves the reminder comes from this service.
async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const key = await crypto.subtle.importKey(
    "jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + env.VAPID_PUBLIC_KEY;
}

async function subscribe(req, env, origin) {
  const body = await req.json().catch(() => null);
  const ep = body && body.subscription && body.subscription.endpoint;
  const mins = parseTime(body && body.time);
  const off = Number(body && body.offset);
  if (!ep || !/^https:\/\//.test(ep) || mins === null || !Number.isFinite(off) || Math.abs(off) > 900) {
    return json({ error: "bad request" }, 400, origin);
  }
  const key = "s:" + (await sha(ep));
  // Keep the day of the last reminder, so saving the same device again never sends a second one that day.
  const prev = await env.SUBS.get(key);
  const last = prev ? JSON.parse(prev).last || "" : "";
  await env.SUBS.put(key, JSON.stringify({ endpoint: ep, time: body.time, offset: Math.round(off), last }));
  return json({ ok: true }, 200, origin);
}

async function unsubscribe(req, env, origin) {
  const body = await req.json().catch(() => null);
  const ep = body && body.endpoint;
  if (!ep) return json({ error: "bad request" }, 400, origin);
  await env.SUBS.delete("s:" + (await sha(ep)));
  return json({ ok: true }, 200, origin);
}

async function sendDue(env, nowMs) {
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: "s:", cursor });
    for (const k of page.keys) {
      const raw = await env.SUBS.get(k.name);
      if (!raw) continue;
      const s = JSON.parse(raw);
      const at = parseTime(s.time);
      if (at === null) continue;
      const now = localParts(nowMs, s.offset);
      const since = now.mins - at;
      if (since < 0 || since >= 60) continue; // send within the hour after the chosen time
      if (s.last === now.date) continue;       // at most once a day
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidAuth(s.endpoint, env),
          TTL: "86400",
          "Content-Length": "0",
        },
      });
      if (res.status === 404 || res.status === 410) {
        await env.SUBS.delete(k.name); // the device unsubscribed or reinstalled
        continue;
      }
      if (res.ok) {
        s.last = now.date;
        await env.SUBS.put(k.name, JSON.stringify(s));
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const path = new URL(req.url).pathname;
    if (req.method === "POST" && path === "/subscribe") return subscribe(req, env, origin);
    if (req.method === "POST" && path === "/unsubscribe") return unsubscribe(req, env, origin);
    return json({ error: "not found" }, 404, origin);
  },
  async scheduled(event, env) {
    await sendDue(env, event.scheduledTime || Date.now());
  },
};

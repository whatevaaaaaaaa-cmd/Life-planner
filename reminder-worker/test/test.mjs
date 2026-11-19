// Local test: runs the Worker logic with a fake key-value store and a fake push service.
import assert from "node:assert/strict";
import worker from "../src/index.js";

const b64uBytes = (s) => Uint8Array.from(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
const kv = new Map();
const SUBS = {
  async put(k, v) { kv.set(k, v); },
  async get(k) { return kv.has(k) ? kv.get(k) : null; },
  async delete(k) { kv.delete(k); },
  async list({ prefix }) {
    return { keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  },
};
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const env = {
  SUBS,
  VAPID_SUBJECT: "mailto:test@example.com",
  VAPID_PUBLIC_KEY: Buffer.from(pubRaw).toString("base64url"),
  VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)),
};
const ORIGIN = "https://whatevaaaaaaaa-cmd.github.io";
const EP = "https://push.example.com/device-1";

let pushes = [];
let pushStatus = 201;
globalThis.fetch = async (url, opts) => {
  pushes.push({ url, opts });
  return new Response(null, { status: pushStatus });
};

const post = (path, body) => worker.fetch(new Request("https://worker.test" + path, {
  method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body),
}), env);

// 1. Subscribe: 07:30 reminder, South Africa is UTC+2 (offset 120)
let r = await post("/subscribe", { subscription: { endpoint: EP }, time: "07:30", offset: 120 });
assert.equal(r.status, 200, "subscribe should succeed");
assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);

// 2. Bad input is refused
r = await post("/subscribe", { subscription: { endpoint: "http://insecure" }, time: "07:30", offset: 120 });
assert.equal(r.status, 400, "non-https endpoint refused");
r = await post("/subscribe", { subscription: { endpoint: EP }, time: "25:00", offset: 120 });
assert.equal(r.status, 400, "bad time refused");

// 3. Outside the window nothing is sent (09:00 local)
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 19, 7, 0) }, env);
assert.equal(pushes.length, 0, "no push at 09:00 local");

// 4. At 07:40 local (05:40 UTC) one push is sent
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 19, 5, 40) }, env);
assert.equal(pushes.length, 1, "one push at 07:40 local");
assert.equal(pushes[0].url, EP);
const auth = pushes[0].opts.headers.Authorization;
assert.ok(auth.startsWith("vapid t="), "uses VAPID authorization");
assert.ok(auth.includes(", k=" + env.VAPID_PUBLIC_KEY), "carries the public key");
const [head, body, sig] = auth.slice("vapid t=".length).split(", k=")[0].split(".");
const payload = JSON.parse(Buffer.from(body, "base64url").toString());
assert.equal(payload.aud, "https://push.example.com", "audience is the push service origin");
const pubKey = await crypto.subtle.importKey("raw", pubRaw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, b64uBytes(sig),
  enc(head + "." + body));
assert.ok(valid, "VAPID signature verifies with the public key");

// 5. Same day again: no second push
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 19, 5, 45) }, env);
assert.equal(pushes.length, 1, "no repeat the same day");

// 6. Next day sends again
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 20, 5, 40) }, env);
assert.equal(pushes.length, 2, "next day sends");

// 6b. Saving the same device again the same day does not resend
await post("/subscribe", { subscription: { endpoint: EP }, time: "07:30", offset: 120 });
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 20, 5, 50) }, env);
assert.equal(pushes.length, 2, "re-saving the same day does not resend");

// 7. A gone device (410) is removed
pushStatus = 410;
await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 21, 5, 40) }, env);
assert.equal(kv.size, 0, "410 removes the subscription");

// 8. Unsubscribe works
pushStatus = 201;
await post("/subscribe", { subscription: { endpoint: EP }, time: "07:30", offset: 120 });
assert.equal(kv.size, 1);
r = await post("/unsubscribe", { endpoint: EP });
assert.equal(r.status, 200);
assert.equal(kv.size, 0, "unsubscribe removes it");

console.log("All reminder service tests passed.");

function enc(s) { return new TextEncoder().encode(s); }

// Run once: node scripts/make-vapid-keys.mjs
// Prints the public key (put it in wrangler.toml and the app) and the private key (keep secret).
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = await crypto.subtle.exportKey("raw", publicKey);
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
console.log("PUBLIC KEY (goes in wrangler.toml as VAPID_PUBLIC_KEY and in the app as VAPID_PUB):");
console.log(b64u(raw));
console.log("\nPRIVATE KEY (keep secret). Save it with: npx wrangler secret put VAPID_PRIVATE_JWK");
console.log(JSON.stringify(jwk));

// QR code: "<session>.<node>.<server seconds>.<mac>". Each screen makes its own, once a second, keyed by its
// node's QR key (lib/sign.ts qrKey), so showing codes costs no request. The key never leaves that node's
// session: a copied key is worth what a copied node token already was (spec, threat table).
// Web Crypto, so the same code runs in the browser and in tests; the server checks it in readCode.
const enc = new TextEncoder();

export async function codeMac(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`code.${body}`)));
  return btoa(String.fromCharCode(...sig)).replaceAll("+", "-").replaceAll("/", "_").slice(0, 22);
}

// serverNow: this device's clock corrected by the offset the server reported, since a code carries server time.
export async function makeCode(key: string, sessionId: string, node: string, serverNow: number) {
  const body = `${sessionId}.${node}.${Math.floor(serverNow / 1000)}`;
  return `${body}.${await codeMac(key, body)}`;
}

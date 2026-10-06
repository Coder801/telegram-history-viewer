import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { type NextRequest } from "next/server";
import { badRequest } from "@/lib/api";

/**
 * GET /api/img?url=<absolute image url>
 *
 * Fetches external images server-side: avoids mixed content for http:// links and
 * hotlink protection (no Referer is sent). Only public hosts and image/* responses.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateAddress(ip: string) {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
    return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("forbidden host");
}

async function fetchImage(initial: URL) {
  let url = initial;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

async function readCapped(body: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return badRequest("url is required");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return badRequest("invalid url");
  }

  try {
    const res = await fetchImage(target);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !res.body || !type.startsWith("image/")) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
    }
    const body = await readCapped(res.body);
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, max-age=600" } });
  }
}

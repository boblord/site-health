// Network helpers: HTTP with timeouts and size limits, DNS over HTTPS, and TLS
// certificate inspection. Nothing here needs credentials.

import tls from 'node:tls';

// A neutral User-Agent: it identifies the tool but not who runs it.
export const USER_AGENT = 'site-health-checker/1';
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;

// Headers a browser sends when the user navigates to a page. Some hosts (for
// example Cloudflare's 404-page handling) only serve the real HTML response to
// navigations.
export const NAVIGATE_HEADERS = {
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

/**
 * Fetches a URL. Never throws: network failures come back as { error }.
 * redirect: 'manual' returns the 3xx response itself (Location in headers).
 */
export async function get(url, { method = 'GET', headers = {}, redirect = 'follow', body = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect,
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, 'accept-encoding': 'br, gzip', ...headers },
    });
    let text = '';
    let bytes = 0;
    if (body && method !== 'HEAD') {
      const buf = Buffer.from(await res.arrayBuffer());
      bytes = buf.length;
      text = buf.subarray(0, MAX_BYTES).toString('utf8');
    } else {
      await res.body?.cancel();
    }
    return { url: res.url || url, status: res.status, headers: res.headers, text, bytes };
  } catch (err) {
    return { url, error: err.name === 'AbortError' ? 'timed out' : err.cause?.code || err.message };
  } finally {
    clearTimeout(timer);
  }
}

const DNS_TYPES = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };

/**
 * Looks up DNS records through Google's public DNS-over-HTTPS service, which
 * works wherever HTTPS does (including CI runners and proxied environments).
 * Returns { records: string[] } or { error }.
 */
export async function dns(name, type) {
  const res = await get(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: 'application/dns-json' },
  });
  if (res.error || res.status !== 200) return { error: res.error || `DNS lookup returned HTTP ${res.status}` };
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    return { error: 'DNS lookup returned invalid JSON' };
  }
  // Status 3 is NXDOMAIN: the name does not exist, so there are no records.
  if (data.Status !== 0 && data.Status !== 3) return { error: `DNS lookup failed (status ${data.Status})` };
  const records = (data.Answer || [])
    .filter((a) => a.type === DNS_TYPES[type])
    .map((a) => (type === 'TXT' ? unquoteTxt(a.data) : a.data));
  return { records };
}

/** TXT data can arrive as one or more quoted strings; join them. */
export function unquoteTxt(data) {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  return parts ? parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, '$1')).join('') : data;
}

/**
 * Connects to host:443 and reads the certificate. The connection verifies the
 * chain and hostname, so an invalid certificate comes back as { error }.
 */
export function certificate(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve({
        validTo: new Date(cert.valid_to),
        issuer: cert.issuer?.O || cert.issuer?.CN || 'unknown issuer',
      });
    });
    socket.on('error', (err) => resolve({ error: err.code || err.message }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ error: 'timed out' });
    });
  });
}

/** Runs fn over items with at most `limit` running at once, keeping order. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

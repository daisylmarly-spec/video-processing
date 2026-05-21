import type { IncomingMessage, ServerResponse } from 'http';

export const config = { api: { bodyParser: false, responseLimit: false } };

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label} (${ms}ms)`)), ms)
    ),
  ]);
}

const SKIP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'content-length',
]);

export default async function handler(
  req: IncomingMessage & { query: Record<string, string | string[]> },
  res: ServerResponse,
) {
  try {
    const rawPath = req.query.path;
    const subPath = '/' + (
      Array.isArray(rawPath) ? rawPath.join('/') :
      typeof rawPath === 'string' ? rawPath : ''
    );
    const qs = Object.entries(req.query)
      .filter(([k]) => k !== 'path')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const url = `https://raasr.xfyun.cn${subPath}${qs ? `?${qs}` : ''}`;

    // Read body with 30s timeout (hangs if Vercel stream isn't ready)
    const body = await withTimeout(readBody(req), 30_000, 'body read');

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v || SKIP.has(k.toLowerCase())) continue;
      headers[k] = Array.isArray(v) ? v[0] : v;
    }

    // Forward to Xunfei with 50s timeout (Vercel kills at 60s)
    const upstream = await withTimeout(
      fetch(url, {
        method:  req.method ?? 'GET',
        headers,
        body:    body.length > 0 ? body : undefined,
      }),
      50_000,
      'upstream fetch',
    );

    const responseBody = Buffer.from(
      await withTimeout(upstream.arrayBuffer(), 20_000, 'response read')
    );

    const resHeaders: Record<string, string> = {};
    for (const [k, v] of upstream.headers.entries()) {
      if (!SKIP.has(k.toLowerCase())) resHeaders[k] = v;
    }
    res.writeHead(upstream.status, resHeaders);
    res.end(responseBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `xf-asr proxy: ${msg}` }));
    }
  }
}

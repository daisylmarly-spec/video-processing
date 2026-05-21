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

    const body = await withTimeout(readBody(req), 30_000, 'body read');

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v || SKIP.has(k.toLowerCase())) continue;
      headers[k] = Array.isArray(v) ? v[0] : v;
    }

    // Browsers can't set Date header — frontend sends X-Date, forward as Date
    if (headers['x-date']) {
      headers['date'] = headers['x-date'];
      delete headers['x-date'];
    }

    const upstream = await withTimeout(
      fetch(`https://ntrans.xfyun.cn${subPath}`, {
        method:  req.method ?? 'POST',
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
      res.end(JSON.stringify({ error: `xf-mt proxy: ${msg}` }));
    }
  }
}

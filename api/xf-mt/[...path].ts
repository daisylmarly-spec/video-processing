import type { IncomingMessage, ServerResponse } from 'http';

export const config = { api: { bodyParser: false, responseLimit: false } };

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

    const body = await readBody(req);

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

    const upstream = await fetch(`https://ntrans.xfyun.cn${subPath}`, {
      method:   req.method ?? 'POST',
      headers,
      body:     body.length > 0 ? body : undefined,
      // @ts-ignore
      redirect: 'manual',
    });

    const responseBody = Buffer.from(await upstream.arrayBuffer());

    res.writeHead(upstream.status, Object.fromEntries(
      [...upstream.headers.entries()].filter(([k]) =>
        !['transfer-encoding', 'connection'].includes(k.toLowerCase())
      )
    ));
    res.end(responseBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  }
}

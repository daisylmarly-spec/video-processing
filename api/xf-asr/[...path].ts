// Edge Function — no 4.5 MB body limit, streams large video/audio files directly.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const SKIP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'origin', 'referer', 'cf-connecting-ip', 'cf-ray',
  'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip',
]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url     = new URL(req.url);
  const prefix  = '/api/xf-asr';
  const subPath = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';

  const upstreamUrl = `https://raasr.xfyun.cn${subPath}${url.search}`;

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (!SKIP.has(k.toLowerCase())) headers.set(k, v);
  }
  headers.set('host', 'raasr.xfyun.cn');

  try {
    const upstream = await fetch(upstreamUrl, {
      method:  req.method,
      headers,
      body:    req.body,
      // @ts-ignore — required for streaming request bodies in Node 18+
      duplex:  'half',
    });

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('connection');
    for (const [k, v] of Object.entries(CORS)) resHeaders.set(k, v);

    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `xf-asr proxy: ${msg}` }), {
      status:  502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}

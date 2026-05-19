import type { TranscriptSegment } from '../pages/video-processing/components/TranscriptEditor';

interface NtransRequest {
  common:   { app_id: string };
  business: { from: string; to: string };
  data:     { text: string };
}

interface NtransResponse {
  code:    number;
  message: string;
  data?: {
    result?: {
      trans_result?: { dst: string; src: string };
    };
  };
}

async function buildAuthHeaders(
  apiKey:     string,
  apiSecret:  string,
  bodyJson:   string,
): Promise<Record<string, string>> {
  const enc     = new TextEncoder();
  const date    = new Date().toUTCString();

  // Digest = SHA-256(body), base64 encoded
  const bodyHash   = await crypto.subtle.digest('SHA-256', enc.encode(bodyJson));
  const bodyB64    = btoa(String.fromCharCode(...new Uint8Array(bodyHash)));
  const digest     = `SHA-256=${bodyB64}`;

  // Signing string
  const signing = [
    'host: ntrans.xfyun.cn',
    `date: ${date}`,
    'POST /v2/ots HTTP/1.1',
    `digest: ${digest}`,
  ].join('\n');

  // HMAC-SHA256
  const secretKey  = await crypto.subtle.importKey(
    'raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes   = await crypto.subtle.sign('HMAC', secretKey, enc.encode(signing));
  const signature  = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const authorization =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line digest", signature="${signature}"`;

  return {
    'Content-Type':  'application/json',
    'Authorization': authorization,
    'X-Date':        date,   // proxy renames to Date before forwarding
    'Digest':        digest,
  };
}

/** Translate one chunk of text. Returns translated string. */
async function translateChunk(
  text:      string,
  appId:     string,
  apiKey:    string,
  apiSecret: string,
  from:      string,
  to:        string,
): Promise<string> {
  const body: NtransRequest = {
    common:   { app_id: appId },
    business: { from, to },
    data:     { text: btoa(unescape(encodeURIComponent(text))) },
  };
  const bodyJson = JSON.stringify(body);
  const headers  = await buildAuthHeaders(apiKey, apiSecret, bodyJson);

  const res = await fetch('/api/xf-mt/v2/ots', {
    method:  'POST',
    headers,
    body:    bodyJson,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`翻译 API 错误 ${res.status}: ${t}`);
  }

  const data = await res.json() as NtransResponse;
  if (data.code !== 0) throw new Error(`翻译失败 (${data.code}): ${data.message}`);

  return data.data?.result?.trans_result?.dst ?? '';
}

const CHUNK_CHAR_LIMIT = 4000;
const SEP = '\n';

export async function translateSegments(
  segments:   TranscriptSegment[],
  appId:      string,
  apiKey:     string,
  apiSecret:  string,
  sourceLang: string = 'cn',
  targetLang: string = 'en',
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) return segments;

  // Split into chunks ≤ CHUNK_CHAR_LIMIT chars
  const chunks: TranscriptSegment[][] = [];
  let cur: TranscriptSegment[] = [], curLen = 0;

  for (const seg of segments) {
    if (curLen + seg.text.length + 1 > CHUNK_CHAR_LIMIT && cur.length > 0) {
      chunks.push(cur);
      cur = []; curLen = 0;
    }
    cur.push(seg);
    curLen += seg.text.length + 1;
  }
  if (cur.length > 0) chunks.push(cur);

  const translated = [...segments];
  let globalIdx = 0;

  for (const chunk of chunks) {
    const joined = chunk.map(s => s.text).join(SEP);
    const result = await translateChunk(joined, appId, apiKey, apiSecret, sourceLang, targetLang);

    // Decode from base64 if the API returned base64 (some versions do)
    let decoded = result;
    try {
      const attempt = decodeURIComponent(escape(atob(result)));
      if (attempt && attempt.length > 0) decoded = attempt;
    } catch {
      // not base64, use as-is
    }

    const lines = decoded.split(SEP);
    for (let i = 0; i < chunk.length; i++) {
      translated[globalIdx + i] = {
        ...translated[globalIdx + i],
        translation: lines[i]?.trim() ?? '',
      };
    }
    globalIdx += chunk.length;
  }

  return translated;
}

import type { TranscriptSegment } from '../pages/video-processing/components/TranscriptEditor';
import { md5Hex, hmacMd5Base64 } from './md5';

// In production, set VITE_XF_PROXY_BASE to the Cloudflare Worker URL.
// In local dev, leave unset — the Vite dev proxy handles /api/xf-asr/*.
const ASR_BASE = import.meta.env.VITE_XF_PROXY_BASE
  ? `${import.meta.env.VITE_XF_PROXY_BASE}/xf-asr`
  : '/api/xf-asr';

interface UploadResponse {
  code: string;
  descInfo: string;
  data?: { orderId: string };
}

interface Sentence {
  sn:      number;
  begTime: string;
  endTime: string;
  onebest: string;
}

interface ResultResponse {
  code: string;
  descInfo: string;
  data?: {
    orderId: string;
    status:  number;   // 9 = done, -1 = error
    content: string;   // JSON string → Sentence[]
  };
}

function buildSigna(appId: string, apiSecret: string, ts: string) {
  const m1 = md5Hex(appId + ts);
  return hmacMd5Base64(apiSecret, m1);
}

const CHUNK_SIZE    = 3 * 1024 * 1024; // 3 MB — safely under Vercel's 4.5 MB request limit
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 10 * 60 * 1000;

async function uploadFile(
  blob:       Blob,
  fileName:   string,
  appId:      string,
  apiSecret:  string,
  sourceLang: string,
): Promise<string> {
  const ts          = Math.floor(Date.now() / 1000).toString();
  const signa       = buildSigna(appId, apiSecret, ts);
  const contentType = blob.type.startsWith('video/') ? 'video' : 'audio';
  const totalSize   = blob.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  let orderId = '';

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end   = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = totalChunks === 1 ? blob : blob.slice(start, end);

    const form = new FormData();
    form.append('app_id',               appId);
    form.append('ts',                   ts);
    form.append('signa',                signa);
    form.append('file_name',            fileName);
    form.append('file_len',             String(totalSize));
    form.append('has_participle',       'false');
    form.append('language',             sourceLang);
    form.append('has_seperate_language','false');
    form.append('content_type',         contentType);

    if (totalChunks > 1) {
      form.append('file_piece_sn', String(i));
      form.append('piece_len',     String(chunk.size));
    }

    form.append('content', chunk, fileName);

    const res = await fetch(`${ASR_BASE}/v2/api/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`上传失败 ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const data = await res.json() as UploadResponse;
    if (data.code !== '000000') {
      throw new Error(`上传失败: ${data.descInfo ?? data.code}`);
    }

    if (data.data?.orderId) orderId = data.data.orderId;
  }

  if (!orderId) throw new Error('上传完成但未获取到任务ID');
  return orderId;
}

export async function transcribeAudio(
  blob:       Blob,
  fileName:   string,
  appId:      string,
  _apiKey:    string,
  apiSecret:  string,
  sourceLang: string = 'cn',
): Promise<TranscriptSegment[]> {
  const orderId = await uploadFile(blob, fileName, appId, apiSecret, sourceLang);

  // ── Poll for result ────────────────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const ts2    = Math.floor(Date.now() / 1000).toString();
    const sig2   = buildSigna(appId, apiSecret, ts2);
    const params = new URLSearchParams({ orderId, ts: ts2, signa: sig2, app_id: appId });
    const res    = await fetch(`${ASR_BASE}/v2/api/getResult?${params}`);

    if (!res.ok) continue;

    const result = await res.json() as ResultResponse;
    if (result.code !== '000000' || !result.data) {
      throw new Error(`查询失败: ${result.descInfo ?? result.code}`);
    }

    const { status, content } = result.data;
    if (status === -1) throw new Error('识别任务失败，请重试');
    if (status !== 9) continue;

    const sentences: Sentence[] = JSON.parse(content);
    return sentences
      .filter(s => s.onebest?.trim())
      .map((s, i) => ({
        id:        `seg_${i}`,
        startTime: parseInt(s.begTime, 10) / 1000,
        endTime:   parseInt(s.endTime, 10) / 1000,
        text:      s.onebest.trim(),
      }));
  }

  throw new Error('识别超时，请重试');
}

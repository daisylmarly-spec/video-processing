import type { TranscriptSegment } from '../pages/video-processing/components/TranscriptEditor';
import { md5Hex, hmacMd5Base64 } from './md5';

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
  const m1    = md5Hex(appId + ts);
  return hmacMd5Base64(apiSecret, m1);
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 10 * 60 * 1000; // 10 min

export async function transcribeAudio(
  blob:       Blob,
  fileName:   string,
  appId:      string,
  _apiKey:    string,
  apiSecret:  string,
  sourceLang: string = 'cn',
): Promise<TranscriptSegment[]> {
  // ── 1. Upload ────────────────────────────────────────────────────────────
  const ts    = Math.floor(Date.now() / 1000).toString();
  const signa = buildSigna(appId, apiSecret, ts);

  const form = new FormData();
  form.append('app_id',               appId);
  form.append('ts',                   ts);
  form.append('signa',                signa);
  form.append('file_name',            fileName);
  form.append('file_len',             String(blob.size));
  form.append('has_participle',       'false');
  form.append('language',             sourceLang);
  form.append('has_seperate_language','false');
  form.append('content_type',         blob.type.startsWith('video/') ? 'video' : 'audio');
  form.append('content',              blob, fileName);

  const uploadRes = await fetch('/api/xf-asr/v2/api/upload', {
    method: 'POST',
    body:   form,
  });

  if (!uploadRes.ok) {
    throw new Error(`上传失败 ${uploadRes.status}: ${await uploadRes.text().catch(() => '')}`);
  }

  const uploadData = await uploadRes.json() as UploadResponse;
  if (uploadData.code !== '000000' || !uploadData.data?.orderId) {
    throw new Error(`上传失败: ${uploadData.descInfo ?? uploadData.code}`);
  }

  const { orderId } = uploadData.data;

  // ── 2. Poll for result ───────────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const ts2    = Math.floor(Date.now() / 1000).toString();
    const sig2   = buildSigna(appId, apiSecret, ts2);
    const params = new URLSearchParams({ orderId, ts: ts2, signa: sig2, app_id: appId });
    const res    = await fetch(`/api/xf-asr/v2/api/getResult?${params}`);

    if (!res.ok) continue;

    const result = await res.json() as ResultResponse;
    if (result.code !== '000000' || !result.data) {
      throw new Error(`查询失败: ${result.descInfo ?? result.code}`);
    }

    const { status, content } = result.data;
    if (status === -1) throw new Error('识别任务失败，请重试');
    if (status !== 9) continue; // still processing

    // ── 3. Parse content ─────────────────────────────────────────────────
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

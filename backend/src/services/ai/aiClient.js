const axios = require('axios');

/**
 * Client gọi AI service (ai-service/: FastAPI — Whisper, NLLB-200, edge-tts).
 * - Lỗi từ AI service được ném ra để job lồng tiếng chuyển 'failed' (kèm lý do rõ ràng).
 * - Đặt AI_MOCK=true trong .env để chạy demo khi chưa có AI service.
 */
const baseURL = () => (process.env.AI_SERVICE_URL || 'http://localhost:8002').replace(/\/$/, '');
const isMock = () => process.env.AI_MOCK === 'true';

const http = axios.create({
  // Suy luận model trên CPU có thể mất vài phút với video dài
  timeout: Number(process.env.AI_SERVICE_TIMEOUT_MS) || 15 * 60 * 1000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

const RETRYABLE = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, mockData) {
  if (isMock()) return typeof mockData === 'function' ? mockData() : mockData;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data } = await http.post(`${baseURL()}${path}`, body, {
        headers: { 'x-internal-key': process.env.INTERNAL_KEY || '' },
      });
      return data;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (!(RETRYABLE.has(err.code) || status === 502 || status === 503) || attempt === 2) break;
      await sleep(2000 * 2 ** attempt);
    }
  }

  const err = lastErr;
  let detail;
  if (err.code === 'ECONNREFUSED') {
    detail = `không kết nối được ${baseURL()} — AI service chưa chạy (xem ai-service/README.md hoặc đặt AI_MOCK=true)`;
  } else if (err.response) {
    const d = err.response.data?.detail;
    detail = `HTTP ${err.response.status}${d ? `: ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`;
  } else {
    detail = err.code || err.message;
  }
  throw new Error(`AI service ${path} lỗi: ${detail}`);
}

async function health() {
  if (isMock()) return { available: true, mock: true };
  try {
    const { data } = await http.get(`${baseURL()}/health`, { timeout: 5000 });
    return { available: true, url: baseURL(), ...data };
  } catch (err) {
    return { available: false, url: baseURL(), error: err.code || err.message };
  }
}

/**
 * URL file media mà AI service tải được.
 * Backend phát cho trình duyệt URL dạng http://localhost:9000/..., nhưng nếu AI service
 * chạy trong Docker thì "localhost" là chính container → cần đổi host, VD:
 *   AI_MEDIA_BASE_URL=http://minio:9000   (AI service chạy bằng docker compose)
 * Bỏ trống nếu AI service chạy trực tiếp trên máy.
 */
function mediaUrlForAI(url) {
  const target = process.env.AI_MEDIA_BASE_URL;
  if (!target || !url) return url;
  const publicBase = (process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000').replace(/\/$/, '');
  return url.startsWith(publicBase) ? target.replace(/\/$/, '') + url.slice(publicBase.length) : url;
}

module.exports = { post, health, isMock, mediaUrlForAI };

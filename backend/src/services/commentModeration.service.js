/**
 * Kiểm duyệt bình luận tự động / bán tự động.
 *
 * Luồng: bình luận mới → chấm điểm vi phạm (0–1) → quyết định trạng thái:
 *   - approved: hiện ngay
 *   - pending:  ẩn với mọi người (trừ tác giả), vào hàng chờ cho admin duyệt
 *   - rejected: ẩn luôn (chỉ ở chế độ "auto", điểm rất cao)
 *
 * Nguồn chấm điểm:
 *   1. Model phân loại bình luận chạy trong ai-service (POST /moderate/comments)
 *   2. Nếu AI service không chạy / lỗi / AI_MOCK=true → bộ lọc từ khoá đơn giản
 *      (chỉ đưa vào hàng chờ, không bao giờ tự ẩn hẳn)
 *
 * Biến môi trường (backend/.env):
 *   COMMENT_MODERATION_MODE      off | semi | auto      (mặc định semi)
 *   COMMENT_REVIEW_THRESHOLD     điểm ≥ ngưỡng → chờ duyệt (mặc định 0.5)
 *   COMMENT_REJECT_THRESHOLD     điểm ≥ ngưỡng → tự ẩn ở chế độ auto (mặc định 0.85)
 *   COMMENT_MODERATION_TIMEOUT_MS thời gian chờ AI service (mặc định 2500)
 */
const aiClient = require('./ai/aiClient');

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);

const config = () => ({
  mode: ['off', 'semi', 'auto'].includes(process.env.COMMENT_MODERATION_MODE)
    ? process.env.COMMENT_MODERATION_MODE
    : 'semi',
  review: num(process.env.COMMENT_REVIEW_THRESHOLD, 0.5),
  reject: num(process.env.COMMENT_REJECT_THRESHOLD, 0.85),
  timeoutMs: num(process.env.COMMENT_MODERATION_TIMEOUT_MS, 2500),
});

// ── Bộ lọc từ khoá dự phòng ────────────────────────────────────────────────
// Chỉ các từ chửi tục rõ ràng, ít nhầm; so khớp theo "từ" sau khi chuẩn hoá.
const BAD_WORDS = [
  // tiếng Việt (có dấu)
  'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'óc chó', 'thằng chó', 'con chó cái', 'đồ chó', 'súc vật', 'mẹ mày', 'cút mẹ',
  // viết tắt / không dấu phổ biến
  'đm', 'dm', 'dmm', 'đmm', 'vcl', 'vkl', 'vl', 'clm', 'cmm', 'dcm', 'đcm', 'loz', 'lon me', 'djt', 'dit me', 'ditme', 'du ma',
  // tiếng Anh
  'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'motherfucker', 'nigger', 'retard',
];

const normalize = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // bỏ ký tự đặc biệt: "đ.m" → "đ m"
    .replace(/\s+/g, ' ')
    .trim();

const BAD_RE = new RegExp(
  `(^|\\s)(${BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\s|$)`,
  'u'
);

function keywordScore(text) {
  const t = normalize(text);
  // "đ m", "v c l" (cố tình tách từng chữ) → ghép các chữ cái đứng riêng lại
  const compact = t
    .split(' ')
    .reduce((acc, w) => {
      const prev = acc[acc.length - 1];
      if (prev && [...w].length === 1 && prev.single) prev.text += w;
      else acc.push({ text: w, single: [...w].length === 1 });
      return acc;
    }, [])
    .map((x) => x.text)
    .join(' ');
  const hit = BAD_RE.exec(t) || BAD_RE.exec(compact);
  return hit ? { score: 0.7, label: 'offensive', source: 'keyword', matched: hit[2] } : { score: 0, label: 'clean', source: 'keyword' };
}

let lastAiWarn = 0;
const warnAi = (msg) => {
  // Không spam log mỗi bình luận khi AI service tắt
  if (Date.now() - lastAiWarn > 60_000) {
    lastAiWarn = Date.now();
    console.warn(`[moderation] AI service không dùng được (${msg}) → dùng bộ lọc từ khoá`);
  }
};

/**
 * Chấm điểm 1 bình luận.
 * @returns {Promise<{ score: number|null, label: string|null, source: 'model'|'keyword'|'none' }>}
 */
async function classify(text) {
  const { mode, timeoutMs } = config();
  if (mode === 'off') return { score: null, label: null, source: 'none' };

  if (!aiClient.isMock()) {
    try {
      const data = await aiClient.postQuick('/moderate/comments', { texts: [text] }, timeoutMs);
      const r = data?.results?.[0];
      if (r && Number.isFinite(r.score)) {
        // Model có thể bỏ sót chửi tục viết tắt → lấy điểm cao hơn giữa model và từ khoá
        const kw = keywordScore(text);
        if (kw.score > r.score) return { ...kw, modelScore: r.score, modelLabel: r.label };
        return { score: r.score, label: r.label || null, source: 'model' };
      }
      warnAi('kết quả không hợp lệ');
    } catch (err) {
      warnAi(err.response ? `HTTP ${err.response.status}` : err.code || err.message);
    }
  }
  return keywordScore(text);
}

/** Từ điểm → trạng thái bình luận */
function decide({ score, source }) {
  const { mode, review, reject } = config();
  if (mode === 'off' || score === null || score === undefined) return 'approved';
  if (mode === 'auto' && source === 'model' && score >= reject) return 'rejected';
  if (score >= review) return 'pending';
  return 'approved';
}

/** Chấm điểm + quyết định trong 1 lần gọi */
async function moderate(text) {
  const result = await classify(text);
  return { status: decide(result), ...result };
}

module.exports = { moderate, classify, decide, keywordScore, config };

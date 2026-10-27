const { post } = require('./aiClient');
const { SUPPORTED_LANGS } = require('../../utils/constants');

/**
 * Dịch theo từng segment (giữ nguyên mốc thời gian để phụ đề/giọng đọc khớp khung hình).
 * @returns {Promise<{start,end,text,translatedText}[]>}
 */
exports.translateSegments = async (segments, sourceLang, targetLang) => {
  if (sourceLang === targetLang) return segments.map((s) => ({ ...s, translatedText: s.text }));

  const payload = segments.map((s, id) => ({ id, start: s.start, end: s.end, text: s.text }));
  const data = await post(
    '/translate',
    { segments: payload, source_lang: sourceLang, target_lang: targetLang },
    () => ({ segments: payload.map((s) => ({ ...s, text: `[${targetLang}] ${s.text}` })) })
  );
  if (!data || !Array.isArray(data.segments)) throw new Error('AI /translate trả về dữ liệu không hợp lệ');

  return segments.map((s, i) => ({ ...s, translatedText: String(data.segments[i]?.text || '').trim() }));
};

/** Dịch một đoạn văn bản rời (tiêu đề, mô tả...). */
exports.translate = async (text, sourceLang, targetLang) => {
  if (!text || sourceLang === targetLang) return text;
  const [seg] = await exports.translateSegments([{ start: 0, end: 0, text }], sourceLang, targetLang);
  return seg.translatedText || text;
};

exports.getSupportedLanguages = async () => SUPPORTED_LANGS.map((l) => l.code);

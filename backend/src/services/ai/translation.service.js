const aiClient = require('./aiClient');
const { SUPPORTED_LANGS } = require('../../utils/constants');

/**
 * Dịch theo từng segment để giữ nguyên mốc thời gian,
 * nhờ đó phụ đề và audio dịch vẫn khớp với khung hình gốc.
 */
async function translateSegments(segments, sourceLang, targetLang) {
  if (sourceLang === targetLang) {
    return segments.map((s) => ({ ...s, translatedText: s.text }));
  }

  const data = await aiClient.post('/translate', {
    segments: segments.map((s, index) => ({ id: index, start: s.start, end: s.end, text: s.text })),
    source_lang: sourceLang,
    target_lang: targetLang,
  });

  const translated = data.segments || [];
  return segments.map((s, index) => ({
    ...s,
    translatedText: (translated[index]?.text || '').trim(),
  }));
}

/** Dịch một đoạn văn bản rời, dùng cho tiêu đề hoặc mô tả. */
async function translate(text, sourceLang, targetLang) {
  if (!text || sourceLang === targetLang) return text;
  const data = await aiClient.post('/translate', {
    segments: [{ id: 0, start: 0, end: 0, text }],
    source_lang: sourceLang,
    target_lang: targetLang,
  });
  return data.segments?.[0]?.text || data.text || text;
}

function getSupportedLanguages() {
  return SUPPORTED_LANGS;
}

module.exports = { translate, translateSegments, getSupportedLanguages };

const { post, isMock } = require('./aiClient');

/**
 * Tổng hợp giọng đọc cho cả track. AI service ghép các segment theo mốc thời gian
 * và co giãn tốc độ để tổng thời lượng khớp video gốc, trả về mp3 dạng base64.
 * @returns {Promise<{buffer: Buffer|null, format: string, duration: number, voice: string|null}>}
 */
exports.synthesizeSegments = async (segments, targetLang, totalDurationSec = 0) => {
  if (isMock()) return { buffer: null, format: 'mp3', duration: 0, voice: 'mock' };

  const data = await post('/tts', {
    segments: segments.map((s, id) => ({ id, start: s.start, end: s.end, text: s.translatedText || s.text })),
    target_lang: targetLang,
    total_duration: totalDurationSec,
    match_duration: true,
  });
  if (!data?.audio_base64) throw new Error('AI /tts không trả về dữ liệu audio');

  return {
    buffer: Buffer.from(data.audio_base64, 'base64'),
    format: data.format || 'mp3',
    duration: Number(data.duration) || 0,
    voice: data.voice || null,
  };
};

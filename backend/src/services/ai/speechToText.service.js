const { post } = require('./aiClient');

/**
 * Nhận dạng lời thoại kèm mốc thời gian (Whisper).
 * AI service tự tách audio từ file video/audio ở `mediaUrl`.
 * @returns {Promise<{language, duration, text, segments: {start,end,text}[], model}>}
 */
exports.transcribe = async (mediaUrl, language = null) => {
  const data = await post(
    '/transcribe',
    { audio_url: mediaUrl, language: language || null },
    {
      language: language || 'vi',
      duration: 6,
      text: 'Xin chào mọi người. Đây là bản lồng tiếng thử nghiệm.',
      segments: [
        { id: 0, start: 0, end: 3, text: 'Xin chào mọi người.' },
        { id: 1, start: 3, end: 6, text: 'Đây là bản lồng tiếng thử nghiệm.' },
      ],
      model: 'mock',
    }
  );
  if (!data || !Array.isArray(data.segments)) throw new Error('AI /transcribe trả về dữ liệu không hợp lệ');

  const segments = data.segments
    .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
    .filter((s) => s.text);

  return {
    language: data.language || language || null,
    duration: Number(data.duration) || 0,
    text: data.text || segments.map((s) => s.text).join(' '),
    segments,
    model: data.model || null,
  };
};

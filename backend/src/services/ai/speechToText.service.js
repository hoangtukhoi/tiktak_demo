const aiClient = require('./aiClient');

/**
 * Nhận dạng giọng nói kèm mốc thời gian (Whisper).
 * Trả về { language, duration, text, segments: [{ start, end, text }] }.
 */
async function transcribe(audioUrl, language = null) {
  const data = await aiClient.post('/transcribe', {
    audio_url: audioUrl,
    language: language || null,
  });

  const segments = (data.segments || []).map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: (s.text || '').trim(),
  }));

  return {
    language: data.language || language || null,
    duration: Number(data.duration) || 0,
    text: data.text || segments.map((s) => s.text).join(' '),
    segments,
    modelVersion: data.model || null,
  };
}

module.exports = { transcribe };

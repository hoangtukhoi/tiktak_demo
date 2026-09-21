const aiClient = require('./aiClient');

/**
 * Tổng hợp giọng nói cho toàn bộ track.
 * AI service ghép các segment theo đúng mốc thời gian và co giãn tốc độ đọc
 * để tổng thời lượng khớp với video gốc, sau đó trả audio dạng base64.
 */
async function synthesizeSegments(segments, targetLang, { speakerAudioUrl = null, totalDurationSec = 0 } = {}) {
  const data = await aiClient.post('/tts', {
    segments: segments.map((s, index) => ({
      id: index,
      start: s.start,
      end: s.end,
      text: s.translatedText || s.text,
    })),
    target_lang: targetLang,
    speaker_audio_url: speakerAudioUrl,
    total_duration: totalDurationSec,
    match_duration: true,
  });

  if (!data.audio_base64) throw new Error('AI service không trả về dữ liệu audio');

  return {
    buffer: Buffer.from(data.audio_base64, 'base64'),
    format: data.format || 'mp3',
    durationSec: Number(data.duration) || 0,
    voice: data.voice || null,
  };
}

module.exports = { synthesizeSegments };

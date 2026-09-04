const axios = require('axios');
exports.synthesize = async (text, targetLang, speakerAudioUrl = null) => {
  const url = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const { data } = await axios.post(`${url}/tts`, { text, target_lang: targetLang, speaker_audio_url: speakerAudioUrl }).catch(() => ({ data: { audio_url: 'http://mock.audio/url' } }));
  return data.audio_url;
};
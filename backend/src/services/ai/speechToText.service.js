const axios = require('axios');
exports.transcribe = async (audioUrl, language = null) => {
  const url = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const { data } = await axios.post(`${url}/transcribe`, { audio_url: audioUrl, language }).catch(() => ({ data: { text: 'Mock transcript' } }));
  return data;
};
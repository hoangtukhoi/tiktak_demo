const axios = require('axios');
exports.translate = async (text, sourceLang, targetLang) => {
  const url = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const { data } = await axios.post(`${url}/translate`, { text, source_lang: sourceLang, target_lang: targetLang }).catch(() => ({ data: { translated_text: 'Mock translation' } }));
  return data.translated_text;
};
exports.getSupportedLanguages = async () => {
  return ['vi', 'en'];
};
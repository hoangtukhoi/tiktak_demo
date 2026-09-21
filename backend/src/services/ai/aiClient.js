const axios = require('axios');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * HTTP client dùng chung cho AI service.
 * Timeout dài vì suy luận model có thể mất vài phút, kèm retry cho lỗi mạng tạm thời.
 */
const client = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: env.AI_SERVICE_TIMEOUT_MS,
  headers: { 'X-Internal-Key': env.INTERNAL_KEY, 'Content-Type': 'application/json' },
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

const RETRYABLE = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, body, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { data } = await client.post(path, body);
      return data;
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const retryable = RETRYABLE.has(err.code) || (status >= 500 && status < 600);
      if (!retryable || attempt === retries) break;
      const delay = 2000 * 2 ** attempt;
      logger.warn(`AI service ${path} lỗi (${err.code || status}), thử lại sau ${delay}ms`);
      await sleep(delay);
    }
  }

  const detail = lastError.response?.data?.detail || lastError.message;
  throw Object.assign(new Error(`AI service ${path} thất bại: ${detail}`), {
    statusCode: 502,
    cause: lastError,
  });
}

async function health() {
  try {
    const { data } = await client.get('/health', { timeout: 5000 });
    return { available: true, ...data };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

module.exports = { client, post, health };

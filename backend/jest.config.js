/**
 * Jest — 2 nhóm test:
 *  - unit:        logic thuần, mọi phụ thuộc đều mock (chạy ~2 giây)
 *  - integration: gọi API thật qua supertest + MongoDB chạy trong bộ nhớ
 *                 (mongodb-memory-server tự tải MongoDB ở lần chạy đầu)
 */
const common = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  restoreMocks: true,
};

module.exports = {
  projects: [
    { ...common, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.js'] },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/integration/helpers/setupAfterEnv.js'],
    },
  ],
  collectCoverageFrom: ['src/**/*.js', '!src/scripts/**', '!src/server.js', '!src/worker.js'],
  coverageDirectory: 'coverage',
};

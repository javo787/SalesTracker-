// Отдельный от корневого jest.config.js конфиг: backend — самостоятельный
// Node/Express проект (свой package.json, свой tsconfig.json, свой
// node_modules), фронтенд-специфичных RN/Expo зависимостей у него нет и не
// будет, поэтому смысла заводить единый конфиг на оба проекта нет.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};

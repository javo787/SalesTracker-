/**
 * Минимальный конфиг Jest — намеренно ограничен только src/utils/matching/,
 * т.к. это единственный код в проекте без RN/Expo-зависимостей, который
 * можно тестировать без полного jest-expo окружения. Если в будущем
 * понадобятся тесты для компонентов/экранов — подключайте отдельно
 * jest-expo preset, не расширяйте testMatch этого конфига бездумно.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/utils/matching/**/*.test.ts'],
};

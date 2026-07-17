const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Откладываем require() до первого реального обращения к модулю вместо
// выполнения всех импортов сразу при старте JS-потока. По умолчанию Expo
// это не включает. Особенно заметно на объёмных модулях (например,
// языковые словари в src/i18n) — меньше работы выполняется на холодном
// старте приложения, до первого рендера.
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

module.exports = config;

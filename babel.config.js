module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
    // Вырезает console.* только из прод-сборки. env.production применяется,
    // когда NODE_ENV=production (EAS Build выставляет это сам на релизных
    // сборках) — локальная разработка (expo start) не затрагивается.
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};

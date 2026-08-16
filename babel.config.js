module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
    // Group A / item 3: 30 console.log без strip-плагина ехали в прод-бандл.
    // env.production применяется Metro только когда NODE_ENV=production
    // (EAS Build выставляет это сам на release-сборках) — локальная
    // разработка (expo start) не затрагивается, console.* работает как обычно.
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};

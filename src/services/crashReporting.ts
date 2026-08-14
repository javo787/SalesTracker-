import crashlytics from '@react-native-firebase/crashlytics';

// Инициализация Firebase Crashlytics.
//
// Вызывается один раз на верхнем уровне App.tsx, до монтирования дерева
// компонентов — чтобы ловить в том числе ошибки самого раннего старта.
//
// Что покрывается:
// - необработанные JS-исключения вне React-дерева (через ErrorUtils) —
//   например, в промисах, таймерах, обработчиках событий
// - ошибки рендера, пойманные ErrorBoundary (recordError вызывается там же)
// - вручную залогированные некритичные ошибки — crashlytics().recordError()
//   можно вызывать точечно в catch-блоках, где падение не критично для UX,
//   но важно знать, что оно произошло
//
// Что НЕ требует ручного кода: нативные крэши (Android/iOS) Crashlytics
// ловит сам сразу после установки модуля.
export function initCrashReporting(): void {
  // В dev-сборке не шлём в Firebase — иначе тестовые ошибки и Fast Refresh
  // будут засорять дашборд реальными "крэшами". Crash reporting и так
  // выключен по умолчанию при разработке, но делаем это явно.
  crashlytics().setCrashlyticsCollectionEnabled(!__DEV__);

  const previousHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    crashlytics().log(`Необработанная JS-ошибка (${isFatal ? 'fatal' : 'non-fatal'})`);
    crashlytics().recordError(error);

    // Не подавляем штатное поведение RN (красный экран в dev, поведение
    // при фатальной ошибке в проде) — только дополнительно репортим.
    previousHandler(error, isFatal);
  });
}

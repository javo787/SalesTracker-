# Дорожная карта внедрения рекламы (Ads Roadmap)

Этот документ описывает стратегию монетизации через рекламу для приложения SavdoApp, учитывая баланс между доходностью и пользовательским опытом.

## 1. Текущее состояние (Status Quo)
- **Библиотеки**: Не установлены.
- **Код**: Реализация рекламы полностью отсутствует.
- **Конфигурация**: В `app.json` отсутствуют идентификаторы AdMob.
- **Логика**: В `PLAN_AND_ROADMAP.md` намечены общие точки интеграции, но техническая база не заложена.

## 2. Стратегия "Баланс" (User-Centric Strategy)
Для предотвращения оттока пользователей и обеспечения стабильного дохода приняты следующие правила:

### А. Адаптивный период (Grace Period)
- **Правило**: Полное отсутствие рекламы в течение первых **7 дней (1 недели)** после установки приложения.
- **Цель**: Дать пользователю привыкнуть к ценности продукта без раздражающих факторов.

### Б. Ограничение частоты (Frequency Capping)
- **Правило**: Полноэкранная реклама (Interstitial) показывается **не чаще одного раза в 30 минут**.
- **Триггеры**: Экспорт данных (PDF/Excel), переход к расширенным отчетам.

### В. Места размещения (Ad Placements)
1.  **Banner (Баннеры)**:
    - Внизу экрана "Отчеты".
    - *Опционально*: Внизу экрана "Настройки".
    - *Запрет*: Не показывать на главном экране и экране продажи, чтобы не отвлекать от ввода данных.
2.  **Interstitial (Межстраничная)**:
    - При завершении экспорта файла.
3.  **Rewarded (За вознаграждение)**:
    - Доступ к "AI Совету дня" (если лимиты бесплатного API превышены или для дополнительной ценности).
    - Доступ к годовому отчету.

## 3. Технические настройки (SDK 56 Compatible)

Для Expo SDK 56 рекомендуется использовать библиотеку `react-native-google-mobile-ads`.

### Зависимости
```bash
npx expo install react-native-google-mobile-ads
```

### Конфигурация app.json
```json
{
  "expo": {
    "android": {
      "package": "com.savdo.app"
    },
    "plugins": [
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy",
          "iosAppId": "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy"
        }
      ]
    ]
  }
}
```

## 4. План реализации (Roadmap)

### Этап 1: Подготовка инфраструктуры (Сделано: 0%)
- [ ] Регистрация в Google AdMob и создание рекламных блоков (Banner, Interstitial, Rewarded).
- [ ] Установка и настройка `react-native-google-mobile-ads`.
- [ ] Создание сервиса `src/services/adService.ts` для централизованного управления логикой (проверка 7-дневного периода, таймер 30 минут).

### Этап 2: Базовая интеграция
- [ ] Внедрение баннера в экран `ReportScreen.tsx`.
- [ ] Реализация хука `useAds()` для проверки, можно ли сейчас показывать рекламу (проверка `isPremium` и `gracePeriod`).

### Этап 3: Полноэкранная реклама и вознаграждения
- [ ] Интеграция Interstitial при экспорте данных в `SettingsScreen.tsx` или `ReportScreen.tsx`.
- [ ] Настройка Rewarded рекламы для AI-функций в `SmartTips.ts`.

### Этап 4: Платное отключение
- [ ] Добавление в БД флага `is_premium` или `ads_disabled`.
- [ ] Подготовка к интеграции `expo-in-app-purchases` или `react-native-purchases` (RevenueCat) для разового платежа.

## 5. Логика проверки показа (Псевдокод)

```typescript
const canShowAd = () => {
  if (user.isPremium) return false;

  const installDate = user.installDate;
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - installDate < sevenDaysInMs) return false;

  const lastAdShown = storage.getLastAdTimestamp();
  const thirtyMinutesInMs = 30 * 60 * 1000;
  if (Date.now() - lastAdShown < thirtyMinutesInMs) return false;

  return true;
}
```

## 6. Риски
- **SDK 56 Compatibility**: Требуется тщательное тестирование в Expo Go (может потребоваться Development Build).
- **Region Restrictions**: В некоторых регионах (РФ) AdMob не работает, рассмотреть альтернативы (Yandex Ads) или медиацию.

---
*Документ обновлен: 2024-05-21*

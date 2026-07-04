# Saleze

## Переменные окружения (Expo / EAS)

Проект использует EAS Dashboard Environment Variables (expo.dev → Project → Environment Variables),
а НЕ только `eas.json`. Это два разных места:

- `eas.json` → `build.<profile>.env` — читается сборочным сервером EAS Build напрямую.
- EAS Dashboard Environment Variables — облачное хранилище, привязанное к environment
  (development / preview / production).

**Для облачной сборки (`eas build`)** — дашборд-переменные подтягиваются автоматически,
ничего дополнительно делать не нужно.

**Для локальной разработки (`npx expo start`)** — переменные с дашборда НЕ подтягиваются
сами по себе. Перед каждой сессией локальной разработки, где нужны актуальные значения
(например `EXPO_PUBLIC_TELEGRAM_BOT_USERNAME`), нужно выполнить:

```bash
eas env:pull --environment development
```

Это создаст/обновит `.env.local` (уже в `.gitignore`) актуальными значениями с дашборда.
После этого обязательно перезапустить Metro с очисткой кэша:

```bash
npx expo start -c
```

Без этого шага `process.env.EXPO_PUBLIC_*` будет `undefined` в локальной сборке,
даже если значение давно и правильно выставлено в дашборде.

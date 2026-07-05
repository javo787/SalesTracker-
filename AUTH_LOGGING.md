# Auth Diagnostic Logging

This document lists all diagnostic logging points added to the codebase to debug the authentication flow (Telegram, Google, Guest, Email). Each log line is tagged with `[AUTH_LOG]` and ends with the comment `// AUTH_LOG` for easy identification and removal.

## Logging Points

| File | Function/Route | What is logged | Purpose |
|---|---|---|---|
| `src/screens/AuthScreen.tsx` | `handleGoogleAuth`, `handleGooglePress`, `handleTelegramAuth`, `handleAuth`, `handleGuest` | Flow entry, errors, masked idToken | Track UI-level auth triggers and immediate failures |
| `src/context/AuthContext.tsx` | `loadStoredAuth`, `loginAsGuest`, `loginWithEmail`, `registerWithEmail`, `loginWithGoogle`, `loginWithTelegram`, `convertGuestAccount` | Entry, result (userId, provider), validation status | Track auth state management in React context |
| `src/services/authService.ts` | `saveAuthData`, `loginAsGuest`, `loginWithEmail`, `registerWithEmail`, `loginWithTelegram`, `logout` | Masked tokens, userIds, offline fallback fact, Telegram polling attempts | Track core auth service logic and local storage interactions |
| `src/services/api.ts` | `getHeaders`, `handleResponse`, `get`/`post`/`patch`/`delete` | Masked token in headers, HTTP status, error messages, request path | Monitor all outgoing API calls related to auth/shop |
| `src/context/ShopContext.tsx` | `createShop`, `joinShop` | Entry, request start, success/error status | Debug issues creating/joining shops after guest login |
| `src/screens/OnboardingScreen.tsx` | `handleNext` (isRoleStep) | Selected role, shop creation/joining start, errors | Trace the transition from auth to shop setup |
| `backend/server.ts` | `authLimiter` (handler) | Blocked IP and path | Identify if rate limiting is causing auth failures |
| `backend/routes/auth.ts` | `/guest`, `/email/register`, `/email/login`, `/google`, `/telegram`, `/telegram/callback`, `/telegram/check`, `/convert` | Route entry, specific fail points (e.g. user not found), success userId | Backend-side trace of all auth endpoints |
| `backend/routes/telegram.ts` | `/webhook`, `/webhook/start`, `/webhook/set`, `/webhook/info` | Webhook body, start token, bot info, webhook set URL | Debug Telegram deep link and webhook delivery issues |
| `backend/middleware/authMiddleware.ts` | `authMiddleware`, `requireShop`, `requireOwner` | Missing headers, JWT verify result, shop membership status | Identify why "Unauthorized" or "Forbidden" is returned |
| `backend/utils/googleAuth.ts` | `verifyGoogleToken` | Request start, audience check, success payload | Verify Google token integrity and configuration |
| `backend/utils/telegramAuth.ts` | `verifyTelegramAuth` | Auth date check, masked HMAC comparison result | Verify Telegram data integrity |
| `backend/utils/telegramLoginStore.ts` | `cleanupPendingAuths` | Store size and items deleted | Monitor the temporary auth session store |

## How to Remove

To remove all diagnostic logs once debugging is complete, run the following command:

```bash
# Delete all temporary diagnostic logs tagged with // AUTH_LOG
grep -rl "// AUTH_LOG" src backend | xargs sed -i '/\/\/ AUTH_LOG$/d'
```

### Manual Cleanup
The following block in `backend/server.ts` should be reverted manually or reviewed:
- `authLimiter` contains a custom `handler` for logging blocked attempts. You may want to keep the logic but remove the log, or revert to the default handler.

The new route in `backend/routes/telegram.ts`:
- `GET /telegram/webhook/info` was added for diagnostics and will be removed by the command above (leaving an empty function body or causing a syntax error if not careful). It is recommended to manually delete this route block if it is no longer needed.

## Статус: логи удалены 15.10.2025

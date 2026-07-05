export const pendingTelegramAuths = new Map<string, { token: string; user: any }>();
const MAX_PENDING_AUTHS = 100;

export function cleanupPendingAuths() {
  if (pendingTelegramAuths.size > MAX_PENDING_AUTHS) {
    const initialSize = pendingTelegramAuths.size;
    const keysToDelete = Array.from(pendingTelegramAuths.keys()).slice(0, pendingTelegramAuths.size - MAX_PENDING_AUTHS);
    keysToDelete.forEach(k => pendingTelegramAuths.delete(k));
  }
}

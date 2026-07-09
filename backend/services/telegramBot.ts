import axios from 'axios';

const BASE_URL = () =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: object
): Promise<void> {
  await axios.post(`${BASE_URL()}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function setWebhook(url: string): Promise<void> {
  const res = await axios.post(`${BASE_URL()}/setWebhook`, { url });
  console.log('Telegram webhook set:', res.data);
}

function getAdminIds(): number[] {
  return (process.env.ADMIN_TELEGRAM_ID || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isFinite(id) && id !== 0);
}

/**
 * Fire-and-forget alert to all configured admins. Never throws —
 * a failed Telegram notification must not break the calling request.
 */
export function notifyAdmin(text: string): void {
  const adminIds = getAdminIds();
  if (adminIds.length === 0) {
    console.warn('[notifyAdmin] ADMIN_TELEGRAM_ID not configured, skipping alert');
    return;
  }
  for (const chatId of adminIds) {
    sendMessage(chatId, text).catch(err => {
      console.error('[notifyAdmin] Failed to send alert', { chatId, error: err.message });
    });
  }
}

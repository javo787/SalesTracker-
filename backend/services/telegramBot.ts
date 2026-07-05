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

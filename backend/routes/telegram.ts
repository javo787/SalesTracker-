import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import SupportTicket from '../models/SupportTicket';
import User from '../models/User';
import { sendMessage } from '../services/telegramBot';
import { pendingTelegramAuths, cleanupPendingAuths } from '../utils/telegramLoginStore';

const router = express.Router();

type SupportLang = 'ru' | 'uz' | 'tg' | 'en';

/**
 * Telegram sends `language_code` on from.language_code (e.g. "ru", "uz", "tg-TJ").
 * Falls back to 'ru' if unknown (CIS audience).
 */
function detectLang(languageCode?: string): SupportLang {
  if (!languageCode) return 'ru';
  const base = languageCode.split('-')[0].toLowerCase();
  if (base === 'ru') return 'ru';
  if (base === 'uz') return 'uz';
  if (base === 'tg') return 'tg';
  if (base === 'en') return 'en';
  return 'ru'; // default for Tajikistan/Uzbekistan audience
}

const BOT_I18N = {
  ru: {
    start: (name: string) =>
      `👋 Привет, <b>${name}</b>!\n\nДобро пожаловать в поддержку <b>Torgo</b>.\n\nОпишите вашу проблему или вопрос — мы ответим в течение 24 часов. 🕐`,
    received: (name: string) =>
      `✅ <b>${name}</b>, ваше сообщение получено!\n\nМы ответим в течение 24 часов. Если вопрос срочный, напишите также на 📧 support@torgo.app`,
    adminReply: (text: string) =>
      `📩 <b>Ответ от поддержки Torgo:</b>\n\n${text}`,
    replySent: (chatId: number) =>
      `✅ Ответ отправлен → ${chatId}`,
    replyFormat: `❌ Формат: /reply <chatId> <текст>`,
    loginSuccess: (name: string) =>
      `✅ <b>${name}</b>, вход выполнен!\n\nНажмите кнопку ниже, чтобы вернуться в приложение Torgo.`,
    unknown: `❓ Напишите нам ваш вопрос — мы обязательно ответим.`,
  },
  uz: {
    start: (name: string) =>
      `👋 Salom, <b>${name}</b>!\n\n<b>Torgo</b> qo'llab-quvvatlash xizmatiga xush kelibsiz.\n\nMuammo yoki savolingizni yozing — 24 soat ichida javob beramiz. 🕐`,
    received: (name: string) =>
      `✅ <b>${name}</b>, xabaringiz qabul qilindi!\n\n24 soat ichida javob beramiz. Shoshilinch bo'lsa: 📧 support@torgo.app`,
    adminReply: (text: string) =>
      `📩 <b>Torgo qo'llab-quvvatlashidan javob:</b>\n\n${text}`,
    replySent: (chatId: number) =>
      `✅ Javob yuborildi → ${chatId}`,
    replyFormat: `❌ Format: /reply <chatId> <matn>`,
    loginSuccess: (name: string) =>
      `✅ <b>${name}</b>, kirish muvaffaqiyatli amalga oshirildi!\n\nIlovaga qaytish uchun quyidagi tugmani bosing.`,
    unknown: `❓ Savolingizni yozing — albatta javob beramiz.`,
  },
  tg: {
    start: (name: string) =>
      `👋 Салом, <b>${name}</b>!\n\nХуш омадед ба дастгирии <b>Torgo</b>.\n\nМушкилот ё саволи худро нависед — мо дар давоми 24 соат ҷавоб медиҳем. 🕐`,
    received: (name: string) =>
      `✅ <b>${name}</b>, паёми шумо қабул шуд!\n\nДар давоми 24 соат ҷавоб медиҳем. Агар таъҷилӣ бошад: 📧 support@torgo.app`,
    adminReply: (text: string) =>
      `📩 <b>Ҷавоб аз дастгирии Torgo:</b>\n\n${text}`,
    replySent: (chatId: number) =>
      `✅ Ҷавоб фиристода шуд → ${chatId}`,
    replyFormat: `❌ Формат: /reply <chatId> <матн>`,
    loginSuccess: (name: string) =>
      `✅ <b>${name}</b>, ворид ба система анҷом ёфт!\n\nБарои бозгашт ба барнома тугмаи зеринро пахш кунед.`,
    unknown: `❓ Саволи худро нависед — мо ҷавоб медиҳем.`,
  },
  en: {
    start: (name: string) =>
      `👋 Hello, <b>${name}</b>!\n\nWelcome to <b>Torgo</b> Support.\n\nDescribe your issue or question — we'll reply within 24 hours. 🕐`,
    received: (name: string) =>
      `✅ <b>${name}</b>, your message has been received!\n\nWe'll reply within 24 hours. For urgent issues: 📧 support@torgo.app`,
    adminReply: (text: string) =>
      `📩 <b>Reply from Torgo Support:</b>\n\n${text}`,
    replySent: (chatId: number) =>
      `✅ Reply sent → ${chatId}`,
    replyFormat: `❌ Format: /reply <chatId> <text>`,
    loginSuccess: (name: string) =>
      `✅ <b>${name}</b>, you're logged in!\n\nTap the button below to return to the Torgo app.`,
    unknown: `❓ Send us your question — we'll get back to you.`,
  },
};

// POST /telegram/webhook  — called by Telegram servers
router.post('/webhook', async (req: Request, res: Response) => {
  console.log('[AUTH_LOG][telegram:webhook] incoming:', JSON.stringify(req.body)); // AUTH_LOG
  try {
    const update = req.body;
    if (!update.message) return res.sendStatus(200);

    const msg = update.message;
    const chatId: number = msg.chat.id;
    const text: string = (msg.text || '').trim();
    const username: string | undefined = msg.from?.username;
    const firstName: string = msg.from?.first_name || 'User';
    const langCode: string | undefined = msg.from?.language_code;
    const adminIds = (process.env.ADMIN_TELEGRAM_ID || '')
      .split(',')
      .map(id => Number(id.trim()))
      .filter(id => Number.isFinite(id) && id !== 0);

    // ── ADMIN: /reply command ─────────────────────────────────────────────
    if (adminIds.includes(chatId) && text.startsWith('/reply ')) {
      const parts = text.slice(7).split(' ');
      const targetChatId = Number(parts[0]);
      const replyText = parts.slice(1).join(' ');

      if (!targetChatId || !replyText) {
        await sendMessage(chatId, BOT_I18N.ru.replyFormat);
        return res.sendStatus(200);
      }

      // Find user's language from saved ticket
      const ticket = await SupportTicket.findOne({ chatId: targetChatId });
      const userLang: SupportLang = (ticket?.lang as SupportLang) || 'ru';
      const i18n = BOT_I18N[userLang];

      await SupportTicket.findOneAndUpdate(
        { chatId: targetChatId },
        { $push: { messages: { from: 'admin', text: replyText, timestamp: new Date() } } }
      );

      await sendMessage(targetChatId, i18n.adminReply(replyText));
      await sendMessage(chatId, BOT_I18N.ru.replySent(targetChatId));
      return res.sendStatus(200);
    }

    // ── USER: detect language ─────────────────────────────────────────────
    const lang = detectLang(langCode);
    const i18n = BOT_I18N[lang];

    // ── LOGIN: /start <tempToken> from mobile app deep link ────────────────
    if (text.startsWith('/start ')) {
      const tempToken = text.slice(7).trim();
      const telegramId = String(msg.from?.id);
      console.log('[AUTH_LOG][telegram:webhook:start] tempToken=', tempToken, 'telegramId=', telegramId); // AUTH_LOG

      let user = await User.findOne({ telegramId });
      if (!user) {
        user = new User({
          authProvider: 'telegram',
          telegramId,
          telegramUsername: username,
          name: msg.from?.last_name ? `${firstName} ${msg.from.last_name}` : firstName,
          referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        });
        console.log('[AUTH_LOG][telegram:webhook:start] creating new user'); // AUTH_LOG
        await user.save();
      } else {
        console.log('[AUTH_LOG][telegram:webhook:start] existing user found userId=', user._id); // AUTH_LOG
      }

      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        console.error('JWT_SECRET not configured, cannot complete Telegram login');
        return res.sendStatus(200);
      }
      const authToken = jwt.sign({ userId: (user._id as any).toString() }, JWT_SECRET, { expiresIn: '30d' });

      pendingTelegramAuths.set(tempToken, { token: authToken, user });
      cleanupPendingAuths();
      setTimeout(() => pendingTelegramAuths.delete(tempToken), 120000);

      await sendMessage(chatId, i18n.loginSuccess(firstName), {
        inline_keyboard: [[{ text: '🔙 Открыть Torgo', url: 'torgo://telegram-auth-success' }]],
      });
      return res.sendStatus(200);
    }

    // ── USER: /start command ──────────────────────────────────────────────
    if (text === '/start') {
      await SupportTicket.findOneAndUpdate(
        { chatId },
        { $setOnInsert: { chatId, username, firstName, lang } },
        { upsert: true, new: true }
      );
      await sendMessage(chatId, i18n.start(firstName));
      return res.sendStatus(200);
    }

    // ── USER: skip other commands ─────────────────────────────────────────
    if (text.startsWith('/')) {
      await sendMessage(chatId, i18n.unknown);
      return res.sendStatus(200);
    }

    // ── USER: regular message ─────────────────────────────────────────────
    await SupportTicket.findOneAndUpdate(
      { chatId },
      {
        $setOnInsert: { chatId, username, firstName, lang },
        $push: { messages: { from: 'user', text, timestamp: new Date() } },
      },
      { upsert: true, new: true }
    );

    await sendMessage(chatId, i18n.received(firstName));

    // Forward to admins (always in Russian for admin convenience)
    const userTag = username ? `@${username}` : `#${chatId}`;
    const langLabel = { ru: '🇷🇺', uz: '🇺🇿', tg: '🇹🇯', en: '🇬🇧' }[lang];
    for (const id of adminIds) {
      try {
        await sendMessage(
          id,
          `📨 <b>Новый тикет поддержки</b>\n\n` +
          `👤 ${firstName} (${userTag}) ${langLabel}\n` +
          `🆔 <code>${chatId}</code>\n\n` +
          `💬 ${text}\n\n` +
          `▶ <i>/reply ${chatId} &lt;ответ&gt;</i>`
        );
      } catch (err) {
        console.error('[AUTH_LOG][telegram:adminForward] failed id=', id, err); // AUTH_LOG
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.sendStatus(500);
  }
});

// GET /telegram/webhook/set — call once after deploy to register webhook
router.get('/webhook/set', async (_req: Request, res: Response) => {
  try {
    const { setWebhook } = await import('../services/telegramBot');
    const webhookUrl = `${process.env.BACKEND_URL}/telegram/webhook`;
    console.log('[AUTH_LOG][telegram:webhook:set] url=', webhookUrl); // AUTH_LOG
    await setWebhook(webhookUrl);
    res.json({ ok: true, url: webhookUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/webhook/info', async (_req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await r.json();
    console.log('[AUTH_LOG][telegram:webhookInfo]', JSON.stringify(data)); // AUTH_LOG
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

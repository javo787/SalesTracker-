# Telegram Support Bot Setup

## One-time setup

1. Create bot via @BotFather → get token → set TELEGRAM_BOT_TOKEN in Render env
2. Find your personal chat_id: write /start to @userinfobot → set ADMIN_TELEGRAM_ID in Render env
3. Set BACKEND_URL=https://<your-render-service>.onrender.com in Render env
4. After deploying backend, open in browser:
   https://<your-render-service>.onrender.com/telegram/webhook/set
   → you should see {"ok":true,"url":"..."}

## Admin commands (in Telegram)

/reply <chatId> <text>   — send reply to user

## How it works

User → @SavdoApp_support_bot → Backend /telegram/webhook →
  1. Auto-reply to user (confirmation)
  2. Forward to ADMIN_TELEGRAM_ID with /reply command hint

Admin types: /reply 123456789 Спасибо за обращение! →
  Backend sends message to user 123456789

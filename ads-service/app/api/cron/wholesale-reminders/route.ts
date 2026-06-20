import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../lib/collections';

export const runtime = 'nodejs';

// GET /api/cron/wholesale-reminders
export async function GET(request: Request) {
  // Simple auth check for Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (process.env.VERCEL && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const col = await getWholesaleCollection();
    const now = new Date();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // Find ads expiring in exactly 3 days (within a 24h window for safety)
    const expiringSoon = await col.find({
      paidUntil: {
        $gt: now,
        $lte: threeDaysFromNow
      },
      isActive: true
    }).toArray();

    console.log(`Found ${expiringSoon.length} wholesale ads expiring soon`);

    // Send Telegram notifications if configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.ADMIN_TELEGRAM_ID;

    if (botToken && adminChatId && expiringSoon.length > 0) {
      const message = `🔔 *Напоминание об истечении опта* (${expiringSoon.length})\n\n` +
        expiringSoon.map(ad =>
          `• *${ad.companyName}*\n  До: ${new Date(ad.paidUntil).toLocaleDateString()}\n  Тел: ${ad.contactPhone}`
        ).join('\n\n');

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminChatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
      } catch (e) {
        console.error('Telegram notification error:', e);
      }
    }

    for (const ad of expiringSoon) {
      console.log(`REMINDER: Ad for "${ad.companyName}" expires on ${ad.paidUntil}. Contact: ${ad.contactPhone}`);
    }

    return NextResponse.json({
      success: true,
      count: expiringSoon.length,
      processed: expiringSoon.map(a => a.companyName)
    });
  } catch (e) {
    console.error('Wholesale reminder cron error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import User from '../models/User';
import { sendPushNotification } from './firebase';

const ADS_API_URL = process.env.ADS_API_URL;

interface NewsArticleLite {
  title_ru: string;
  url: string;
  category: string;
  relevanceScore: number;
}

function pluralizeNews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'новостей';
  if (mod10 === 1) return 'новость';
  if (mod10 >= 2 && mod10 <= 4) return 'новости';
  return 'новостей';
}

export async function runNewsReminderCheck(): Promise<{ notified: number; reason?: string }> {
  if (!ADS_API_URL) {
    return { notified: 0, reason: 'ads_api_url_not_configured' };
  }

  const res = await fetch(`${ADS_API_URL}/api/news`);
  if (!res.ok) {
    throw new Error(`ads-service /api/news responded ${res.status}`);
  }
  const data = await res.json();
  const articles: NewsArticleLite[] = data.articles || [];

  const important = articles.filter(
    (a) => a.relevanceScore >= 9 && ['customs', 'currency'].includes(a.category)
  );

  if (important.length === 0) {
    return { notified: 0, reason: 'no_important_news' };
  }

  const title = important.length === 1 ? '📰 Важная новость' : '📰 Важные новости';
  const body =
    important.length === 1
      ? important[0].title_ru
      : `${important.length} ${pluralizeNews(important.length)} о таможне и курсе валют — стоит посмотреть`;

  const users = await User.find({
    fcmToken: { $ne: null },
    notificationsEnabled: true,
  }).lean();

  let notified = 0;
  for (const user of users) {
    if (!user.fcmToken) continue;
    const sent = await sendPushNotification(user.fcmToken, title, body, {
      type: 'news',
      url: important[0].url,
    });
    if (sent) notified++;
  }

  return { notified };
}

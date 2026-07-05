'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const CONTENT = {
  en: {
    title: 'Delete Your Account',
    body: `If you'd like to delete your Torgo account and associated data, submit a request below, or email support@torgo.app with the email, Telegram username, or phone number linked to your account.\n\nWe will process your request and delete your account data within 30 days. Locally stored business data (products, sales) on your device is deleted immediately when you uninstall the app.`,
    labelId: 'Email, Telegram username, or phone linked to your account',
    labelReason: 'Reason (optional)',
    submit: 'Submit request',
    done: 'Your deletion request has been received. We will process it within 30 days and contact you if needed.',
    error: 'Something went wrong, please try again or email support@torgo.app.',
  },
  ru: {
    title: 'Удаление аккаунта',
    body: `Чтобы удалить аккаунт Torgo и связанные с ним данные, отправьте запрос ниже, или напишите на support@torgo.app, указав email, юзернейм Telegram или номер телефона, привязанные к аккаунту.\n\nМы обработаем запрос и удалим данные аккаунта в течение 30 дней. Данные о товарах и продажах, хранящиеся локально на устройстве, удаляются сразу при удалении приложения.`,
    labelId: 'Email, Telegram username или телефон, привязанные к аккаунту',
    labelReason: 'Причина (необязательно)',
    submit: 'Отправить запрос',
    done: 'Запрос на удаление принят. Мы обработаем его в течение 30 дней и свяжемся с вами при необходимости.',
    error: 'Что-то пошло не так, попробуйте ещё раз или напишите на support@torgo.app.',
  },
  uz: {
    title: "Hisobni o'chirish",
    body: `Torgo hisobingizni va unga bog'liq ma'lumotlarni o'chirish uchun quyidagi shaklni to'ldiring, yoki support@torgo.app manziliga yozing.\n\nSo'rovingizni 30 kun ichida ko'rib chiqamiz.`,
    labelId: "Hisobingizga bog'langan email, Telegram username yoki telefon",
    labelReason: 'Sabab (ixtiyoriy)',
    submit: "So'rovni yuborish",
    done: "So'rov qabul qilindi. 30 kun ichida ko'rib chiqamiz.",
    error: "Xatolik yuz berdi, qayta urinib ko'ring yoki support@torgo.app ga yozing.",
  },
  tg: {
    title: 'Нест кардани ҳисоб',
    body: `Барои нест кардани ҳисоби Torgo, шаклро дар поён пур кунед, ё ба support@torgo.app нависед.\n\nМо дархостро дар давоми 30 рӯз коркард мекунем.`,
    labelId: 'Email, номи корбарии Telegram ё рақами телефон',
    labelReason: 'Сабаб (ихтиёрӣ)',
    submit: 'Фиристодани дархост',
    done: 'Дархост қабул шуд. Дар давоми 30 рӯз коркард мешавад.',
    error: 'Хатогӣ рух дод, аз нав кӯшиш кунед ё ба support@torgo.app нависед.',
  },
} as const;

function DeleteAccountContent() {
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') as keyof typeof CONTENT) || 'en';
  const t = CONTENT[lang] || CONTENT.en;

  const [identifier, setIdentifier] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('https://savdoapp.onrender.com/auth/account/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, reason }),
      });
      if (!res.ok) throw new Error();
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  const css = `
    body {
      margin: 0;
      padding: 0;
      background-color: #F5F5F5;
      color: #1A1A1A;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
    }
    .header {
      background-color: #1D9E75;
      color: white;
      padding: 64px 24px 48px;
      text-align: center;
    }
    .container {
      max-width: 760px;
      margin: 0 auto;
    }
    .logo {
      font-size: 22px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .tagline {
      font-size: 14px;
      opacity: 0.9;
      margin-bottom: 24px;
    }
    .main-heading {
      font-size: 32px;
      font-weight: 800;
      margin: 0 0 8px;
    }
    .switcher-bar {
      position: sticky;
      top: 0;
      background: white;
      padding: 12px 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      z-index: 100;
      overflow-x: auto;
      white-space: nowrap;
    }
    .switcher-inner {
      max-width: 760px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .pill {
      display: inline-block;
      padding: 8px 20px;
      border-radius: 20px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    }
    .pill.active {
      background-color: #1D9E75;
      color: white;
    }
    .pill.inactive {
      background-color: #F5F5F5;
      color: #666666;
    }
    .content {
      padding: 56px 24px;
    }
    .card {
      background-color: white;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }
    input, textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #DDD;
      border-radius: 8px;
      font-size: 15px;
      box-sizing: border-box;
      font-family: inherit;
    }
    textarea {
      height: 100px;
      resize: vertical;
    }
    button {
      background-color: #1D9E75;
      color: white;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #158A63;
    }
    button:disabled {
      background-color: #CCC;
      cursor: not-allowed;
    }
    .success-msg {
      background-color: #E8F5E9;
      color: #158A63;
      padding: 20px;
      border-radius: 8px;
      font-weight: 500;
      text-align: center;
    }
    .error-msg {
      color: #D32F2F;
      font-size: 14px;
      margin-top: 8px;
      text-align: center;
    }
    .footer {
      background-color: #1A1A1A;
      color: white;
      padding: 64px 24px;
      text-align: center;
    }
    .footer-email {
      color: #1D9E75;
      text-decoration: none;
      font-weight: 600;
    }
    .copyright {
      margin-top: 32px;
      font-size: 14px;
      opacity: 0.6;
    }
    @media (max-width: 600px) {
      .header {
        padding: 48px 16px 32px;
      }
      .main-heading {
        font-size: 26px;
      }
      .content {
        padding: 32px 16px;
      }
      .card {
        padding: 24px 16px;
      }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="header">
        <div className="container">
          <div className="logo">Torgo</div>
          <div className="tagline">Simple inventory and sales management</div>
          <h1 className="main-heading">{t.title}</h1>
        </div>
      </header>

      <nav className="switcher-bar">
        <div className="switcher-inner">
          {(['en', 'ru', 'uz', 'tg'] as const).map(l => (
            <a
              key={l}
              href={`/delete-account?lang=${l}`}
              className={`pill ${lang === l ? 'active' : 'inactive'}`}
            >
              {l.toUpperCase()}
            </a>
          ))}
        </div>
      </nav>

      <main className="content">
        <div className="container">
          <div className="card">
            <p style={{ whiteSpace: 'pre-line', marginBottom: '32px' }}>{t.body}</p>

            {status === 'done' ? (
              <div className="success-msg">{t.done}</div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>{t.labelId}</label>
                  <input
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    required
                    placeholder="example@mail.com"
                  />
                </div>
                <div className="form-group">
                  <label>{t.labelReason}</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? '...' : t.submit}
                </button>
                {status === 'error' && <p className="error-msg">{t.error}</p>}
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            Contact us at:{' '}
            <a href="mailto:support@torgo.app" className="footer-email">
              support@torgo.app
            </a>
          </p>
          <div className="copyright">© 2025 Torgo</div>
        </div>
      </footer>
    </>
  );
}

export default function DeleteAccountPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DeleteAccountContent />
    </Suspense>
  );
}

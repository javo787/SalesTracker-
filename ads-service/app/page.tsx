import React from 'react';

export const metadata = {
  title: 'SavdoApp — Sales Tracker for Bazaar Traders',
  description:
    'Free voice-powered sales tracking app for market traders in Central Asia. Available in Russian, Uzbek, Tajik and English. Works offline.',
};

export default function Home() {
  const primary = '#1D9E75';
  const primaryDark = '#158A63';
  const primaryLight = '#E8F5E9';
  const text = '#1A1A1A';
  const textSecondary = '#666666';
  const border = '#EEEEEE';
  const background = '#F5F5F5';
  const card = '#FFFFFF';

  return (
    <main>
      <style>{`
        :root {
          --primary: ${primary};
          --primary-dark: ${primaryDark};
          --primary-light: ${primaryLight};
          --text: ${text};
          --text-secondary: ${textSecondary};
          --border: ${border};
          --background: ${background};
          --card: ${card};
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: var(--text);
          background-color: var(--card);
          line-height: 1.5;
        }

        a {
          text-decoration: none;
          color: inherit;
          transition: color 0.15s ease;
        }

        .container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 24px;
        }

        /* Nav Bar */
        .navbar {
          position: sticky;
          top: 0;
          background: white;
          border-bottom: 1px solid var(--border);
          z-index: 1000;
          height: 70px;
          display: flex;
          align-items: center;
        }

        .nav-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .logo {
          color: var(--primary);
          font-size: 20px;
          font-weight: 700;
        }

        .nav-links {
          display: flex;
          gap: 24px;
        }

        .nav-link {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .nav-link:hover {
          color: var(--primary);
        }

        /* Hero */
        .hero {
          background: linear-gradient(to bottom, var(--primary), var(--primary-dark));
          min-height: 88vh;
          display: flex;
          align-items: center;
          padding: 60px 0;
          color: white;
          overflow: hidden;
        }

        .hero-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 40px;
        }

        .hero-text {
          max-width: 500px;
        }

        .hero-eyebrow {
          text-transform: uppercase;
          font-size: 13px;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.65);
          margin-bottom: 16px;
          display: block;
        }

        .hero h1 {
          font-size: 54px;
          font-weight: 700;
          line-height: 1.1;
          margin-bottom: 24px;
          white-space: pre-line;
        }

        .hero-subheading {
          font-size: 17px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 40px;
          max-width: 420px;
        }

        .cta-button {
          background: white;
          color: var(--primary);
          font-weight: 700;
          border-radius: 12px;
          padding: 16px 32px;
          font-size: 16px;
          display: inline-block;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        .hero-secondary-link {
          color: rgba(255, 255, 255, 0.65);
          font-size: 14px;
          margin-top: 16px;
          display: block;
        }

        /* Phone Mockup */
        .phone-mockup-wrapper {
          display: flex;
          justify-content: center;
        }

        .phone-mockup {
          width: 260px;
          height: 520px;
          border-radius: 40px;
          border: 6px solid rgba(0,0,0,0.35);
          background: #fff;
          overflow: hidden;
          box-shadow: 0 32px 64px rgba(0,0,0,0.3);
          position: relative;
          color: var(--text);
        }

        .phone-header {
          height: 56px;
          background: var(--primary);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px;
          color: white;
        }

        .phone-header-logo {
          font-weight: 700;
          font-size: 14px;
        }

        .phone-stats {
          padding: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .mini-card {
          background: var(--background);
          border-radius: 10px;
          padding: 10px 8px;
          text-align: center;
        }

        .mini-card-label {
          color: #999;
          font-size: 10px;
          display: block;
          margin-bottom: 2px;
        }

        .mini-card-value {
          color: var(--primary);
          font-weight: 700;
          font-size: 16px;
          display: block;
        }

        .mini-card-unit {
          color: #999;
          font-size: 9px;
        }

        .phone-section-label {
          padding: 12px 12px 6px;
          font-size: 11px;
          color: #999;
          font-weight: 600;
        }

        .phone-row {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .phone-row-left h4 {
          font-size: 13px;
          font-weight: 700;
        }

        .phone-row-left span {
          font-size: 11px;
          color: #999;
        }

        .phone-row-right {
          color: var(--primary);
          font-weight: 700;
          font-size: 13px;
        }

        .phone-tabbar {
          height: 52px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-around;
          align-items: center;
          position: absolute;
          bottom: 0;
          width: 100%;
          background: white;
        }

        /* Social Proof */
        .social-proof {
          background: var(--background);
          padding: 28px 24px;
          text-align: center;
          font-size: 15px;
          color: var(--text-secondary);
        }

        .social-proof span {
          color: var(--primary);
          font-weight: 700;
        }

        /* Features */
        .features {
          padding: 96px 0;
        }

        .section-heading-center {
          text-align: center;
          margin-bottom: 56px;
        }

        .section-heading-center h2 {
          font-size: 28px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 8px;
        }

        .section-heading-center p {
          font-size: 16px;
          color: var(--text-secondary);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .feature-card {
          background: white;
          border-radius: 16px;
          padding: 28px 24px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          border: 1px solid var(--border);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.1);
        }

        .feature-icon {
          color: var(--primary);
          width: 40px;
          height: 40px;
        }

        .feature-card h3 {
          font-size: 16px;
          font-weight: 700;
          margin-top: 16px;
          margin-bottom: 8px;
        }

        .feature-card p {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* How It Works */
        .how-it-works {
          padding: 96px 0;
          background: white;
        }

        .steps-container {
          display: flex;
          justify-content: space-between;
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }

        .steps-container::after {
          content: "";
          position: absolute;
          top: 24px;
          left: 10%;
          right: 10%;
          height: 2px;
          border-top: 2px dashed var(--border);
          z-index: 1;
        }

        .step-item {
          flex: 1;
          text-align: center;
          position: relative;
          z-index: 2;
          background: white;
        }

        .step-badge {
          width: 48px;
          height: 48px;
          background: var(--primary);
          color: white;
          font-size: 22px;
          font-weight: 700;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .step-icon {
          color: var(--primary);
          width: 32px;
          height: 32px;
          margin-bottom: 12px;
        }

        .step-item h3 {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .step-item p {
          font-size: 14px;
          color: var(--text-secondary);
          max-width: 200px;
          margin: 0 auto;
        }

        /* Languages Strip */
        .languages-strip {
          background: var(--primary-light);
          padding: 64px 0;
          text-align: center;
        }

        .languages-strip h2 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .languages-strip p {
          font-size: 15px;
          color: var(--text-secondary);
          margin-bottom: 32px;
        }

        .pills-container {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .pill {
          background: white;
          border: 1.5px solid var(--primary);
          color: var(--primary);
          font-weight: 600;
          border-radius: 100px;
          padding: 10px 24px;
          font-size: 15px;
        }

        /* CTA Banner */
        .cta-banner {
          background: linear-gradient(135deg, var(--primary), #0C7A58);
          padding: 80px 24px;
          text-align: center;
          color: white;
        }

        .cta-banner h2 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .cta-banner p {
          font-size: 17px;
          color: rgba(255, 255, 255, 0.75);
          margin-bottom: 32px;
        }

        .cta-banner-subtext {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          margin-top: 16px;
        }

        /* Footer */
        .footer {
          background: #1A1A1A;
          padding: 40px 0;
          color: #999;
        }

        .footer-row-1 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .footer-logo {
          color: var(--primary);
          font-size: 18px;
          font-weight: 700;
        }

        .footer-links {
          display: flex;
          gap: 24px;
        }

        .footer-link {
          font-size: 14px;
        }

        .footer-row-2 {
          text-align: center;
          border-top: 1px solid #333;
          padding-top: 24px;
        }

        .footer-copy {
          color: #555;
          font-size: 12px;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .hero-content {
            grid-template-columns: 1fr;
            text-align: center;
          }
          .hero-text {
            margin: 0 auto;
          }
          .hero-subheading {
            margin-left: auto;
            margin-right: auto;
          }
          .phone-mockup-wrapper {
            display: none;
          }
          .steps-container {
            flex-direction: column;
            gap: 40px;
          }
          .steps-container::after {
            display: none;
          }
        }

        @media (max-width: 500px) {
          .features-grid {
            grid-template-columns: 1fr;
          }
          .hero h1 {
            font-size: 38px;
          }
          .footer-row-1 {
            flex-direction: column;
            gap: 20px;
          }
        }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="container nav-content">
          <a href="/" className="logo">SavdoApp</a>
          <div className="nav-links">
            <a href="/support" className="nav-link">Support</a>
            <a href="/privacy" className="nav-link">Privacy</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-content">
          <div className="hero-text">
            <span className="hero-eyebrow">Sales Tracker for Bazaar Traders</span>
            <h1>{`Count your\nprofits,\nnot your\nproblems.`}</h1>
            <p className="hero-subheading">
              Voice-powered sales tracking built for markets in Tajikistan, Uzbekistan, Kazakhstan and Kyrgyzstan. Works offline. Free forever.
            </p>
            <a href="#" className="cta-button">Get on Google Play</a>
            <a href="#features" className="hero-secondary-link">See how it works ↓</a>
          </div>
          <div className="phone-mockup-wrapper">
            <div className="phone-mockup">
              <div className="phone-header">
                <span className="phone-header-logo">SavdoApp</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </div>
              <div className="phone-stats">
                <div className="mini-card">
                  <span className="mini-card-label">Выручка</span>
                  <span className="mini-card-value">1 250</span>
                  <span className="mini-card-unit">сомони</span>
                </div>
                <div className="mini-card">
                  <span className="mini-card-label">Прибыль</span>
                  <span className="mini-card-value">340</span>
                  <span className="mini-card-unit">сомони</span>
                </div>
                <div className="mini-card">
                  <span className="mini-card-label">Продаж</span>
                  <span className="mini-card-value">18</span>
                </div>
              </div>
              <div className="phone-section-label">Сегодня</div>
              <div className="phone-row">
                <div className="phone-row-left">
                  <h4>Помидоры</h4>
                  <span>10:34</span>
                </div>
                <div className="phone-row-right">+35 с</div>
              </div>
              <div className="phone-row">
                <div className="phone-row-left">
                  <h4>Мука (5кг)</h4>
                  <span>10:11</span>
                </div>
                <div className="phone-row-right">+28 с</div>
              </div>
              <div className="phone-tabbar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="social-proof">
        🌍 <span>4 Languages</span>  ·  📶 <span>Works Offline</span>  ·  🆓 <span>Free Forever</span>
      </section>

      {/* Features */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-heading-center">
            <h2>Everything a market trader needs</h2>
            <p>No accounting degree required.</p>
          </div>
          <div className="features-grid">
            {/* Card 1 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <h3>Add sales by voice</h3>
              <p>Say 'sold 5 kg tomatoes for 15 somoni' in Russian, Uzbek or Tajik. AI extracts the data instantly.</p>
            </div>
            {/* Card 2 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <h3>See profit instantly</h3>
              <p>Know your margin on every item, every day. No calculator needed.</p>
            </div>
            {/* Card 3 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/></svg>
              <h3>No internet? No problem</h3>
              <p>All data saved locally on your device. Sync when you're back online.</p>
            </div>
            {/* Card 4 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="12 13 12 17 14 19"/></svg>
              <h3>Track who owes you</h3>
              <p>Record customer debts and get reminders when payments are due.</p>
            </div>
            {/* Card 5 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <h3>Daily & monthly reports</h3>
              <p>Export to Excel or PDF. Share with your accountant in one tap.</p>
            </div>
            {/* Card 6 */}
            <div className="feature-card">
              <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              <h3>Local currencies</h3>
              <p>TJS, UZS, KZT, KGS — switch anytime. All your data recalculates automatically.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <div className="container">
          <div className="section-heading-center">
            <h2>Up and running in 3 steps</h2>
          </div>
          <div className="steps-container">
            <div className="step-item">
              <div className="step-badge">1</div>
              <svg className="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              <h3>Add your products</h3>
              <p>Enter product names, purchase price, and selling price.</p>
            </div>
            <div className="step-item">
              <div className="step-badge">2</div>
              <svg className="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <h3>Record each sale</h3>
              <p>Tap the mic and speak, or type manually. Done in 3 seconds.</p>
            </div>
            <div className="step-item">
              <div className="step-badge">3</div>
              <svg className="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              <h3>Watch your profit grow</h3>
              <p>Daily summaries and AI tips show exactly what's working.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Languages Strip */}
      <section className="languages-strip">
        <div className="container">
          <h2>Your language, your currency</h2>
          <p>Interface available in 4 languages. Works with local Central Asian currencies.</p>
          <div className="pills-container">
            <div className="pill">🇷🇺 Русский</div>
            <div className="pill">🇺🇿 O'zbek</div>
            <div className="pill">🇹🇯 Тоҷикӣ</div>
            <div className="pill">🇬🇧 English</div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="cta-banner">
        <div className="container">
          <h2>Ready to take control of your business?</h2>
          <p>Free download. No registration required to start.</p>
          <a href="#" className="cta-button">Get on Google Play</a>
          <p className="cta-banner-subtext">Available on Android · iOS coming soon</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-row-1">
            <a href="/" className="footer-logo">SavdoApp</a>
            <div className="footer-links">
              <a href="/privacy" className="footer-link">Privacy Policy</a>
              <a href="/support" className="footer-link">Support</a>
            </div>
          </div>
          <div className="footer-row-2">
            <p className="footer-copy">© 2025 SavdoApp. Built for bazaar traders of Central Asia.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

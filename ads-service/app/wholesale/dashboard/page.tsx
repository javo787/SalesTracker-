'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function DashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Токен доступа не указан');
      setLoading(false);
      return;
    }

    async function fetchStats() {
      try {
        const res = await fetch(`/api/wholesale/stats?token=${token}`);
        if (!res.ok) throw new Error('Объявление не найдено или токен недействителен');
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [token]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Загрузка статистики...</div>;
  if (error) return <div style={{ padding: 40, color: 'red', textAlign: 'center' }}>{error}</div>;

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: 'auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#1D9E75' }}>Статистика размещения</h1>
      <h2 style={{ marginBottom: 30 }}>{data.companyName}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>
        <StatCard label="Просмотры" value={data.views || 0} icon="👁️" />
        <StatCard label="Клики" value={data.clicks || 0} icon="🖱️" />
        <StatCard label="Звонки" value={data.calls || 0} icon="📞" />
        <StatCard label="В Telegram" value={data.telegramClicks || 0} icon="✈️" />
      </div>

      <div style={{ padding: 20, backgroundColor: '#f9f9f9', borderRadius: 12, border: '1px solid #eee' }}>
        <p style={{ margin: '0 0 10px 0', color: '#666' }}>Статус размещения:</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{data.isActive ? '✅ Активно' : '❌ Неактивно'}</strong>
          <span>Оплачено до: <strong>{new Date(data.paidUntil).toLocaleDateString()}</strong></span>
        </div>
      </div>

      <footer style={{ marginTop: 40, textAlign: 'center', color: '#999', fontSize: 12 }}>
        SavdoApp Wholesale Services
      </footer>
    </div>
  );
}

export default function WholesaleDashboard() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Загрузка...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{ padding: 20, borderRadius: 12, backgroundColor: '#fff', border: '1px solid #eee', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#333' }}>{value}</div>
      <div style={{ fontSize: 14, color: '#888' }}>{label}</div>
    </div>
  );
}

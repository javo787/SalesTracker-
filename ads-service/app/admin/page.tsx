'use client';

import { useState, useEffect } from 'react';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [newAd, setNewAd] = useState({
    title: '',
    subtitle: '',
    imageUrl: '',
    targetUrl: '',
    active: true,
    priority: 0,
  });

  const fetchAds = async (pwd = password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ads', {
        headers: { 'x-admin-password': pwd },
      });
      if (res.ok) {
        const data = await res.json();
        setAds(data);
        setIsAuthorized(true);
      } else {
        setMessage('Неверный пароль');
      }
    } catch (e) {
      setMessage('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAd = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/ads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(newAd),
      });
      if (res.ok) {
        setNewAd({ title: '', subtitle: '', imageUrl: '', targetUrl: '', active: true, priority: 0 });
        fetchAds();
        setMessage('Объявление добавлено');
      }
    } catch (e) {
      setMessage('Ошибка добавления');
    }
  };

  const toggleActive = async (ad) => {
    try {
      const res = await fetch(`/api/admin/ads/${ad._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ active: !ad.active }),
      });
      if (res.ok) fetchAds();
    } catch (e) {
      setMessage('Ошибка обновления');
    }
  };

  const deleteAd = async (id) => {
    if (!confirm('Удалить навсегда?')) return;
    try {
      const res = await fetch(`/api/admin/ads/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      if (res.ok) fetchAds();
    } catch (e) {
      setMessage('Ошибка удаления');
    }
  };

  if (!isAuthorized) {
    return (
      <div style={{ padding: 40, maxWidth: 400, margin: 'auto' }}>
        <h1>Savdo Ads Admin</h1>
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10, color: '#000' }}
        />
        <button onClick={() => fetchAds()} style={{ width: '100%', padding: 10 }}>Войти</button>
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: 'auto', fontFamily: 'sans-serif' }}>
      <h1>Управление рекламой</h1>

      <div style={{ backgroundColor: '#f0f0f0', padding: 20, borderRadius: 8, marginBottom: 20, color: '#000' }}>
        <h3>Добавить кампанию</h3>
        <form onSubmit={handleAddAd}>
          <input placeholder="Заголовок" value={newAd.title} onChange={e => setNewAd({...newAd, title: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
          <input placeholder="Подзаголовок" value={newAd.subtitle} onChange={e => setNewAd({...newAd, subtitle: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
          <input placeholder="URL картинки" value={newAd.imageUrl} onChange={e => setNewAd({...newAd, imageUrl: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
          <input placeholder="URL перехода" value={newAd.targetUrl} onChange={e => setNewAd({...newAd, targetUrl: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
          <input type="number" placeholder="Приоритет (чем выше, тем раньше)" value={newAd.priority} onChange={e => setNewAd({...newAd, priority: parseInt(e.target.value)})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#1D9E75', color: 'white', border: 'none', borderRadius: 4 }}>Добавить</button>
        </form>
      </div>

      <h2>Активные кампании</h2>
      {loading ? <p>Загрузка...</p> : (
        <div style={{ color: '#000' }}>
          {ads.map((ad: any) => (
            <div key={ad._id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 10, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{ad.title}</strong> ({ad.priority})<br/>
                <small>{ad.subtitle}</small><br/>
                <span>Кликов: {ad.clicks || 0}</span>
              </div>
              <div>
                <button onClick={() => toggleActive(ad)} style={{ marginRight: 10 }}>{ad.active ? 'Выключить' : 'Включить'}</button>
                <button onClick={() => deleteAd(ad._id)} style={{ color: 'red' }}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p>{message}</p>
    </div>
  );
}

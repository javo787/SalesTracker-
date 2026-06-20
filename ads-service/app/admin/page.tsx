'use client';

import { useState, useEffect } from 'react';

type Tab = 'direct_ads' | 'classifieds' | 'wholesale' | 'wholesale_requests' | 'news';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('direct_ads');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Data states
  const [ads, setAds] = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [wholesalers, setWholesalers] = useState([]);
  const [wholesaleRequests, setWholesaleRequests] = useState([]);
  const [news, setNews] = useState<any>(null);

  // Forms states
  const [newAd, setNewAd] = useState({
    title: '',
    subtitle: '',
    imageUrl: '',
    targetUrl: '',
    active: true,
    priority: 0,
  });

  const [newWholesale, setNewWholesale] = useState({
    companyName: '',
    contactPhone: '',
    contactTelegram: '',
    description: '',
    categories: '', // comma separated in UI
    cities: '', // comma separated in UI
    minOrderAmount: '',
    currency: 'TJS',
    priceRange: '',
    priority: 0,
    tier: 'basic',
    paidUntil: '',
    images: [] as string[],
  });

  const fetchDirectAds = async (pwd = password) => {
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

  const fetchClassifieds = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/classifieds', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) setClassifieds(await res.json());
    } catch (e) {
      setMessage('Ошибка загрузки объявлений');
    } finally {
      setLoading(false);
    }
  };

  const fetchWholesalers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/wholesale', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) setWholesalers(await res.json());
    } catch (e) {
      setMessage('Ошибка загрузки оптовиков');
    } finally {
      setLoading(false);
    }
  };

  const fetchWholesaleRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/wholesale/requests', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) setWholesaleRequests(await res.json());
    } catch (e) {
      setMessage('Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  };

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news');
      if (res.ok) setNews(await res.json());
    } catch (e) {
      setMessage('Ошибка загрузки новостей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      if (activeTab === 'direct_ads') fetchDirectAds();
      if (activeTab === 'classifieds') fetchClassifieds();
      if (activeTab === 'wholesale') fetchWholesalers();
      if (activeTab === 'wholesale_requests') fetchWholesaleRequests();
      if (activeTab === 'news') fetchNews();
    }
  }, [isAuthorized, activeTab]);

  const handleAddAd = async (e: React.FormEvent) => {
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
        fetchDirectAds();
        setMessage('Объявление добавлено');
      }
    } catch (e) {
      setMessage('Ошибка добавления');
    }
  };

  const handleModerateClassified = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/classifieds/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ moderationStatus: status }),
      });
      if (res.ok) fetchClassifieds();
    } catch (e) {
      setMessage('Ошибка модерации');
    }
  };

  const handleAddWholesale = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = {
        ...newWholesale,
        categories: newWholesale.categories.split(',').map(s => s.trim()).filter(Boolean),
        cities: newWholesale.cities.split(',').map(s => s.trim()).filter(Boolean),
        minOrderAmount: Number(newWholesale.minOrderAmount),
        priority: Number(newWholesale.priority),
      };
      const res = await fetch('/api/admin/wholesale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setNewWholesale({
          companyName: '', contactPhone: '', contactTelegram: '', description: '',
          categories: '', cities: '', minOrderAmount: '', currency: 'TJS',
          priceRange: '', priority: 0, tier: 'basic', paidUntil: '', images: [],
        });
        fetchWholesalers();
        setMessage('Оптовик добавлен');
      }
    } catch (e) {
      setMessage('Ошибка добавления');
    }
  };

  const refreshNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/news/refresh', {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        fetchNews();
        setMessage('Новости обновлены');
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err.error || 'неизвестно'}`);
      }
    } catch (e) {
      setMessage('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (type: Tab, id: string) => {
    if (!confirm('Удалить навсегда?')) return;
    const url = type === 'direct_ads' ? `/api/admin/ads/${id}` :
                type === 'classifieds' ? `/api/admin/classifieds/${id}` :
                type === 'wholesale' ? `/api/admin/wholesale/${id}` :
                `/api/admin/wholesale/requests?id=${id}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        if (type === 'direct_ads') fetchDirectAds();
        if (type === 'classifieds') fetchClassifieds();
        if (type === 'wholesale') fetchWholesalers();
      }
    } catch (e) {
      setMessage('Ошибка удаления');
    }
  };

  const toggleAdActive = async (ad: any) => {
    try {
      const res = await fetch(`/api/admin/ads/${ad._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ active: !ad.active }),
      });
      if (res.ok) fetchDirectAds();
    } catch (e) {
      setMessage('Ошибка обновления');
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
        <button onClick={() => fetchDirectAds()} style={{ width: '100%', padding: 10 }}>Войти</button>
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: 'auto', fontFamily: 'sans-serif' }}>
      <h1>SavdoApp Admin</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('direct_ads')} style={{ padding: '10px 15px', backgroundColor: activeTab === 'direct_ads' ? '#1D9E75' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Прямая реклама</button>
        <button onClick={() => setActiveTab('classifieds')} style={{ padding: '10px 15px', backgroundColor: activeTab === 'classifieds' ? '#1D9E75' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Доска объявлений</button>
        <button onClick={() => setActiveTab('wholesale')} style={{ padding: '10px 15px', backgroundColor: activeTab === 'wholesale' ? '#1D9E75' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Оптовики</button>
        <button onClick={() => setActiveTab('wholesale_requests')} style={{ padding: '10px 15px', backgroundColor: activeTab === 'wholesale_requests' ? '#1D9E75' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Заявки опт</button>
        <button onClick={() => setActiveTab('news')} style={{ padding: '10px 15px', backgroundColor: activeTab === 'news' ? '#1D9E75' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Новости</button>
      </div>

      {message && <div style={{ padding: 10, backgroundColor: '#fff4f4', border: '1px solid #ffcccc', marginBottom: 20, borderRadius: 4 }}>{message}</div>}

      {/* DIRECT ADS TAB */}
      {activeTab === 'direct_ads' && (
        <>
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
                    <button onClick={() => toggleAdActive(ad)} style={{ marginRight: 10 }}>{ad.active ? 'Выключить' : 'Включить'}</button>
                    <button onClick={() => deleteItem('direct_ads', ad._id)} style={{ color: 'red' }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CLASSIFIEDS TAB */}
      {activeTab === 'classifieds' && (
        <>
          <h2>Модерация (новые объявления)</h2>
          {loading ? <p>Загрузка...</p> : (
            <div style={{ color: '#000' }}>
              {classifieds.length === 0 && <p>Нет объявлений для модерации</p>}
              {classifieds.map((item: any) => (
                <div key={item._id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 10, borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 15 }}>
                    {item.images?.[0] && <img src={item.images[0]} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 4 }} />}
                    <div>
                      <strong>{item.title}</strong> — {item.price} {item.currency}<br/>
                      <small>{item.city}, {item.market} | {item.category}</small><br/>
                      <p style={{ margin: '5px 0' }}>{item.description}</p>
                      <small>Тел: {item.userPhone}</small>
                    </div>
                  </div>
                  <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
                    <button onClick={() => handleModerateClassified(item._id, 'approved')} style={{ padding: '5px 15px', backgroundColor: '#1D9E75', color: 'white', border: 'none', borderRadius: 4 }}>Одобрить</button>
                    <button onClick={() => handleModerateClassified(item._id, 'rejected')} style={{ padding: '5px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4 }}>Отклонить</button>
                    <button onClick={() => deleteItem('classifieds', item._id)} style={{ padding: '5px 15px', color: '#666' }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* WHOLESALE TAB */}
      {activeTab === 'wholesale' && (
        <>
          <div style={{ backgroundColor: '#f0f0f0', padding: 20, borderRadius: 8, marginBottom: 20, color: '#000' }}>
            <h3>Добавить оптовика</h3>
            <form onSubmit={handleAddWholesale}>
              <input placeholder="Название компании" value={newWholesale.companyName} onChange={e => setNewWholesale({...newWholesale, companyName: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <input placeholder="Телефон" value={newWholesale.contactPhone} onChange={e => setNewWholesale({...newWholesale, contactPhone: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <input placeholder="Telegram (без @)" value={newWholesale.contactTelegram} onChange={e => setNewWholesale({...newWholesale, contactTelegram: e.target.value})} style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <textarea placeholder="Описание" value={newWholesale.description} onChange={e => setNewWholesale({...newWholesale, description: e.target.value})} style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8, height: 60 }} />
              <input placeholder="Категории (через запятую)" value={newWholesale.categories} onChange={e => setNewWholesale({...newWholesale, categories: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <input placeholder="Города (через запятую)" value={newWholesale.cities} onChange={e => setNewWholesale({...newWholesale, cities: e.target.value})} required style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input placeholder="Мин. заказ" type="number" value={newWholesale.minOrderAmount} onChange={e => setNewWholesale({...newWholesale, minOrderAmount: e.target.value})} style={{ flex: 1, padding: 8 }} />
                <input placeholder="Валюта" value={newWholesale.currency} onChange={e => setNewWholesale({...newWholesale, currency: e.target.value})} style={{ width: 80, padding: 8 }} />
              </div>
              <input placeholder="Ценовой диапазон" value={newWholesale.priceRange} onChange={e => setNewWholesale({...newWholesale, priceRange: e.target.value})} style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <select value={newWholesale.tier} onChange={e => setNewWholesale({...newWholesale, tier: e.target.value})} style={{ flex: 1, padding: 8 }}>
                  <option value="basic">Basic (Базовый)</option>
                  <option value="premium">Premium (Премиум)</option>
                  <option value="vip">VIP (Вип)</option>
                </select>
                <input title="Место внутри тира (выше = раньше)" placeholder="Приоритет" type="number" value={newWholesale.priority} onChange={e => setNewWholesale({...newWholesale, priority: Number(e.target.value)})} style={{ flex: 1, padding: 8 }} />
                <input placeholder="Оплачено до (YYYY-MM-DD)" type="date" value={newWholesale.paidUntil} onChange={e => setNewWholesale({...newWholesale, paidUntil: e.target.value})} required style={{ flex: 2, padding: 8 }} />
              </div>
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#1D9E75', color: 'white', border: 'none', borderRadius: 4 }}>Добавить</button>
            </form>
          </div>
          <h2>Список оптовиков</h2>
          {loading ? <p>Загрузка...</p> : (
            <div style={{ color: '#000' }}>
              {wholesalers.map((item: any) => (
                <div key={item._id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 10, borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{item.companyName}</strong> <span style={{fontSize: 10, backgroundColor: '#eee', padding: '2px 4px', borderRadius: 4}}>{item.tier?.toUpperCase()}</span><br/>
                    <small>Кат: {item.categories?.join(', ')} | Prio: {item.priority || 0}</small><br/>
                    <small>Оплачено до: {new Date(item.paidUntil).toLocaleDateString()}</small><br/>
                    <small>Статистика: {item.views || 0} глаз, {item.clicks || 0} кликов, {item.calls || 0} тел, {item.telegramClicks || 0} TG</small><br/>
                    {item.dashboardToken && (
                      <small>Дашборд: <a href={`/wholesale/dashboard?token=${item.dashboardToken}`} target="_blank" style={{color: '#1D9E75'}}>открыть ссылку</a></small>
                    )}
                  </div>
                  <div>
                    <button onClick={() => deleteItem('wholesale', item._id)} style={{ color: 'red' }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* WHOLESALE REQUESTS TAB */}
      {activeTab === 'wholesale_requests' && (
        <>
          <h2>Заявки на размещение</h2>
          {loading ? <p>Загрузка...</p> : (
            <div style={{ color: '#000' }}>
              {wholesaleRequests.length === 0 && <p>Заявок пока нет</p>}
              {wholesaleRequests.map((item: any) => (
                <div key={item._id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 10, borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{item.companyName}</strong> — {item.contactPhone}<br/>
                    <small>TG: @{item.contactTelegram}</small><br/>
                    <p style={{ margin: '5px 0' }}>{item.description}</p>
                    <small>Кат: {item.categories?.join(', ')} | Гор: {item.cities?.join(', ')}</small>
                  </div>
                  <div>
                    <button onClick={() => {
                      setNewWholesale({
                        ...newWholesale,
                        companyName: item.companyName,
                        contactPhone: item.contactPhone,
                        contactTelegram: item.contactTelegram || '',
                        description: item.description || '',
                        categories: item.categories?.join(', ') || '',
                        cities: item.cities?.join(', ') || '',
                        tier: 'basic',
                      });
                      setActiveTab('wholesale');
                    }} style={{ marginRight: 10 }}>Принять</button>
                    <button onClick={() => deleteItem('wholesale_requests', item._id)} style={{ color: 'red' }}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* NEWS TAB */}
      {activeTab === 'news' && (
        <>
          <div style={{ marginBottom: 20 }}>
            <button onClick={refreshNews} disabled={loading} style={{ padding: '10px 20px', backgroundColor: '#1D9E75', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{loading ? 'Обновление...' : 'Обновить сейчас'}</button>
          </div>
          {news ? (
            <div style={{ color: '#000' }}>
              <p>Последнее обновление: {new Date(news.generatedAt).toLocaleString()}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {news.articles?.map((art: any, i: number) => (
                  <div key={i} style={{ border: '1px solid #eee', padding: 15, borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>{art.category}</span>
                    <h4 style={{ margin: '5px 0' }}>{art.title_ru}</h4>
                    <p style={{ fontSize: 14 }}>{art.summary_ru}</p>
                    <a href={art.url} target="_blank" style={{ fontSize: 12, color: '#1D9E75' }}>Источник: {art.source}</a>
                  </div>
                ))}
              </div>
            </div>
          ) : <p>Новостей пока нет</p>}
        </>
      )}
    </div>
  );
}

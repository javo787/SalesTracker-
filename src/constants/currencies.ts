export type CurrencyDef = {
  code: string;
  label: string;
  symbol: string;
  country: string;
  priority?: boolean;
};

export const ALL_CURRENCIES: CurrencyDef[] = [
  // ── Приоритетные ──────────────────────────
  { code:'USD', label:'Доллар США',          symbol:'$',      country:'🇺🇸 США',            priority:true },
  { code:'TJS', label:'Сомони',              symbol:'сом.',   country:'🇹🇯 Таджикистан',     priority:true },
  { code:'UZS', label:'Узбекский сум',       symbol:'сум',    country:'🇺🇿 Узбекистан',      priority:true },
  { code:'RUB', label:'Российский рубль',    symbol:'₽',      country:'🇷🇺 Россия',          priority:true },

  // ── Остальные мира (alphabetically) ───────
  { code:'AED', label:'Дирхам',              symbol:'د.إ',    country:'🇦🇪 ОАЭ' },
  { code:'AFN', label:'Афгани',              symbol:'؋',      country:'🇦🇫 Афганистан' },
  { code:'AMD', label:'Армянский драм',      symbol:'֏',      country:'🇦🇲 Армения' },
  { code:'AUD', label:'Австралийский доллар',symbol:'A$',     country:'🇦🇺 Австралия' },
  { code:'AZN', label:'Азербайджанский манат',symbol:'₼',    country:'🇦🇿 Азербайджан' },
  { code:'BDT', label:'Бангладешская така',  symbol:'৳',      country:'🇧🇩 Бангладеш' },
  { code:'BGN', label:'Болгарский лев',      symbol:'лв',     country:'🇧🇬 Болгария' },
  { code:'BRL', label:'Бразильский реал',    symbol:'R$',     country:'🇧🇷 Бразилия' },
  { code:'CAD', label:'Канадский доллар',    symbol:'C$',     country:'🇨🇦 Канада' },
  { code:'CHF', label:'Швейцарский франк',   symbol:'CHF',    country:'🇨🇭 Швейцария' },
  { code:'CNY', label:'Китайский юань',      symbol:'¥',      country:'🇨🇳 Китай' },
  { code:'CZK', label:'Чешская крона',       symbol:'Kč',     country:'🇨🇿 Чехия' },
  { code:'DKK', label:'Датская крона',       symbol:'kr',     country:'🇩🇰 Дания' },
  { code:'EUR', label:'Евро',                symbol:'€',      country:'🇪🇺 Европа' },
  { code:'EGP', label:'Египетский фунт',     symbol:'E£',     country:'🇪🇬 Египет' },
  { code:'GBP', label:'Британский фунт',     symbol:'£',      country:'🇬🇧 Великобритания' },
  { code:'GEL', label:'Грузинский лари',     symbol:'₾',      country:'🇬🇪 Грузия' },
  { code:'HKD', label:'Гонконгский доллар',  symbol:'HK$',    country:'🇭🇰 Гонконг' },
  { code:'HUF', label:'Венгерский форинт',   symbol:'Ft',     country:'🇭🇺 Венгрия' },
  { code:'IDR', label:'Индонезийская рупия', symbol:'Rp',     country:'🇮🇩 Индонезия' },
  { code:'ILS', label:'Израильский шекель',  symbol:'₪',      country:'🇮🇱 Израиль' },
  { code:'INR', label:'Индийская рупия',     symbol:'₹',      country:'🇮🇳 Индия' },
  { code:'IQD', label:'Иракский динар',      symbol:'ع.д',    country:'🇮🇶 Ирак' },
  { code:'IRR', label:'Иранский риал',       symbol:'﷼',      country:'🇮🇷 Иран' },
  { code:'JPY', label:'Японская иена',       symbol:'¥',      country:'🇯🇵 Япония' },
  { code:'KGS', label:'Кыргызский сом',      symbol:'с',      country:'🇰🇬 Кыргызстан' },
  { code:'KRW', label:'Южнокорейская вона',  symbol:'₩',      country:'🇰🇷 Южная Корея' },
  { code:'KWD', label:'Кувейтский динар',    symbol:'د.ك',    country:'🇰🇼 Кувейт' },
  { code:'KZT', label:'Казахстанский тенге', symbol:'₸',      country:'🇰🇿 Казахстан' },
  { code:'MDL', label:'Молдавский лей',      symbol:'L',      country:'🇲🇩 Молдова' },
  { code:'MNT', label:'Монгольский тугрик',  symbol:'₮',      country:'🇲🇳 Монголия' },
  { code:'MXN', label:'Мексиканское песо',   symbol:'MX$',    country:'🇲🇽 Мексика' },
  { code:'MYR', label:'Малайзийский ринггит',symbol:'RM',     country:'🇲🇾 Малайзия' },
  { code:'NOK', label:'Норвежская крона',    symbol:'kr',     country:'🇳🇴 Норвегия' },
  { code:'NZD', label:'Новозеландский доллар',symbol:'NZ$',   country:'🇳🇿 Новая Зеландия' },
  { code:'OMR', label:'Оманский риал',       symbol:'ر.ع.',   country:'🇴🇲 Оман' },
  { code:'PHP', label:'Филиппинское песо',   symbol:'₱',      country:'🇵🇭 Филиппины' },
  { code:'PKR', label:'Пакистанская рупия',  symbol:'₨',      country:'🇵🇰 Пакистан' },
  { code:'PLN', label:'Польский злотый',     symbol:'zł',     country:'🇵🇱 Польша' },
  { code:'QAR', label:'Катарский риал',      symbol:'ر.ق',    country:'🇶🇦 Катар' },
  { code:'RON', label:'Румынский лей',       symbol:'lei',    country:'🇷🇴 Румыния' },
  { code:'SAR', label:'Саудовский риял',     symbol:'ر.с',    country:'🇸🇦 Саудовская Аравия' },
  { code:'SEK', label:'Шведская крона',      symbol:'kr',     country:'🇸🇪 Швеция' },
  { code:'SGD', label:'Сингапурский доллар', symbol:'S$',     country:'🇸🇬 Сингапур' },
  { code:'THB', label:'Тайский бат',         symbol:'฿',      country:'🇹🇭 Таиланд' },
  { code:'TRY', label:'Турецкая лира',       symbol:'₺',      country:'🇹🇷 Турция' },
  { code:'TWD', label:'Тайваньский доллар',  symbol:'NT$',    country:'🇹🇼 Тайвань' },
  { code:'UAH', label:'Украинская гривна',   symbol:'₴',      country:'🇺🇦 Украина' },
  { code:'VND', label:'Вьетнамский донг',    symbol:'₫',      country:'🇻🇳 Вьетнам' },
  { code:'ZAR', label:'Южноафриканский рэнд',symbol:'R',      country:'🇿🇦 ЮАР' },
];

// Словарь для быстрого поиска по коду (используется в AppContext)
export const CURRENCIES_MAP: Record<string, CurrencyDef> =
  Object.fromEntries(ALL_CURRENCIES.map(c => [c.code, c]));

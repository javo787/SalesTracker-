import React from 'react'
import { Metadata } from 'next'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { lang?: string }
}): Promise<Metadata> {
  const titles = {
    en: 'Support — SavdoApp',
    ru: 'Поддержка — SavdoApp',
    uz: 'Yordam — SavdoApp',
    tg: 'Дастгирӣ — SavdoApp',
  }
  const lang = (searchParams?.lang ?? 'en') as keyof typeof titles
  return {
    title: titles[lang] ?? titles.en,
    description: 'SavdoApp Support Center. We are here to help with your questions and issues.',
  }
}

const translations = {
  en: {
    title: 'Support Center',
    subtext: "We're here to help. Usually reply within 24 hours.",
    contactBtn: '✉ savdoapp@gmail.com',
    faqHeading: 'Frequently Asked Questions',
    faq: [
      {
        q: "How do I add a sale?",
        a: "Open the app, tap the + Sale button at the bottom. You can type manually or press the microphone icon and say the product name, quantity and price in Russian, Uzbek or Tajik. The AI will fill in the form automatically."
      },
      {
        q: "Does the app work without internet?",
        a: "Yes. All your sales, products and reports are saved locally on your device. Internet is only needed to fetch currency rates and news. Voice input also requires a connection for AI transcription."
      },
      {
        q: "How do I export my data?",
        a: "Go to Reports → tap the Export button in the top right corner. Choose Excel (.xlsx) or PDF format. The file is saved to your device and can be shared via any messaging app."
      },
      {
        q: "Can I use multiple currencies?",
        a: "Yes. Go to Settings → Currency and choose TJS (Tajik somoni), UZS (Uzbek sum), KZT (Kazakhstani tenge), or KGS (Kyrgyz som). Switching currency will automatically recalculate all existing records."
      },
      {
        q: "How do I track customer debts?",
        a: "Open the Debtors section from the main menu. Tap + to add a debtor, enter their name and the amount owed. You can set a due date and the app will send you a reminder notification."
      },
      {
        q: "My voice input is not working. What should I do?",
        a: "Make sure microphone permission is granted in your device Settings → Apps → SavdoApp → Permissions. Voice input requires an internet connection for AI transcription. If the problem persists, contact us at savdoapp@gmail.com."
      },
      {
        q: "How do I delete all my data?",
        a: "Go to Settings → scroll to the bottom → \"Clear all data\". This will delete all sales, products and settings from your device. This action cannot be undone."
      },
      {
        q: "Is the app really free?",
        a: "Yes, SavdoApp is completely free. We show minimal non-intrusive ads to keep the service running. We will never charge you or ask for a subscription."
      }
    ],
    contact: {
      emailTitle: "Email Us",
      emailDesc: "For bugs, feature requests or account questions.",
      emailNote: "We respond within 24 hours.",
      rateTitle: "Rate & Review",
      rateDesc: "Found a bug? Leave a review on Google Play — we read every one.",
      rateBtn: "Open Google Play"
    },
    tips: [
      { title: "Voice Input", desc: "Tap and hold the mic for faster voice input" },
      { title: "Monthly Reports", desc: "Export your monthly report at the end of each month" },
      { title: "Debt Alerts", desc: "Enable notifications to never miss a debt due date" }
    ],
    footer: {
      privacy: "Privacy Policy",
      support: "Support",
      copy: "© 2025 SavdoApp"
    }
  },
  ru: {
    title: 'Центр поддержки',
    subtext: 'Мы здесь, чтобы помочь. Обычно отвечаем в течение 24 часов.',
    contactBtn: '✉ savdoapp@gmail.com',
    faqHeading: 'Часто задаваемые вопросы',
    faq: [
      {
        q: "Как добавить продажу?",
        a: "Откройте приложение, нажмите кнопку «+ Продажа» внизу. Вы можете ввести данные вручную или нажать значок микрофона и произнести название товара, количество и цену на русском, узбекском или таджикском языке. ИИ заполнит форму автоматически."
      },
      {
        q: "Работает ли приложение без интернета?",
        a: "Да. Все ваши продажи, товары и отчеты сохраняются локально на вашем устройстве. Интернет нужен только для получения курсов валют и новостей. Голосовой ввод также требует подключения для расшифровки ИИ."
      },
      {
        q: "Как экспортировать мои данные?",
        a: "Перейдите в «Отчеты» → нажмите кнопку «Экспорт» в правом верхнем углу. Выберите формат Excel (.xlsx) или PDF. Файл сохранится на вашем устройстве, и его можно будет отправить через любой мессенджер."
      },
      {
        q: "Могу ли я использовать несколько валют?",
        a: "Да. Перейдите в Настройки → Валюта и выберите TJS (таджикский сомони), UZS (узбекский сум), KZT (казахстанский тенге) или KGS (киргизский сом). При смене валюты все существующие записи будут пересчитаны автоматически."
      },
      {
        q: "Как отслеживать долги клиентов?",
        a: "Откройте раздел «Должники» в главном меню. Нажмите «+», чтобы добавить должника, введите его имя и сумму долга. Вы можете установить дату погашения, и приложение пришлет вам уведомление-напоминание."
      },
      {
        q: "Мой голосовой ввод не работает. Что мне делать?",
        a: "Убедитесь, что разрешение на использование микрофона предоставлено в настройках вашего устройства → Приложения → SavdoApp → Разрешения. Голосовой ввод требует подключения к интернету для расшифровки ИИ. Если проблема сохраняется, свяжитесь с нами по адресу savdoapp@gmail.com."
      },
      {
        q: "Как удалить все мои данные?",
        a: "Перейдите в Настройки → прокрутите вниз → «Очистить все данные». Это удалит все продажи, товары и настройки с вашего устройства. Это действие нельзя отменить."
      },
      {
        q: "Приложение действительно бесплатное?",
        a: "Да, SavdoApp полностью бесплатно. Мы показываем минимальную ненавязчивую рекламу, чтобы сервис продолжал работать. Мы никогда не будем брать с вас плату или просить подписку."
      }
    ],
    contact: {
      emailTitle: "Напишите нам",
      emailDesc: "Для сообщений об ошибках, пожеланий или вопросов по аккаунту.",
      emailNote: "Мы отвечаем в течение 24 часов.",
      rateTitle: "Оцените нас",
      rateDesc: "Нашли баг? Оставьте отзыв в Google Play — мы читаем каждый из них.",
      rateBtn: "Открыть Google Play"
    },
    tips: [
      { title: "Голосовой ввод", desc: "Нажмите и удерживайте микрофон для быстрого голосового ввода" },
      { title: "Ежемесячные отчеты", desc: "Экспортируйте ежемесячный отчет в конце каждого месяца" },
      { title: "Оповещения о долгах", desc: "Включите уведомления, чтобы не пропустить дату оплаты долга" }
    ],
    footer: {
      privacy: "Политика конфиденциальности",
      support: "Поддержка",
      copy: "© 2025 SavdoApp"
    }
  },
  uz: {
    title: 'Qo\'llab-quvvatlash markazi',
    subtext: 'Biz yordam berishga tayyormiz. Odatda 24 soat ichida javob beramiz.',
    contactBtn: '✉ savdoapp@gmail.com',
    faqHeading: 'Ko\'p beriladigan savollar',
    faq: [
      {
        q: "Sotuvni qanday qo'shaman?",
        a: "Ilovani oching, pastdagi «+ Sotuv» tugmasini bosing. Ma'lumotlarni qo'lda kiritishingiz yoki mikrofon belgisini bosib, mahsulot nomi, miqdori va narxini o'zbek, rus yoki tojik tillarida aytishingiz mumkin. Sun'iy intellekt shaklni avtomatik ravishda to'ldiradi."
      },
      {
        q: "Ilova internetsiz ishlaydimi?",
        a: "Ha. Barcha sotuvlaringiz, mahsulotlaringiz va hisobotlaringiz qurilmangizda mahalliy ravishda saqlanadi. Internet faqat valyuta kurslari va yangiliklarni olish uchun kerak. Ovozli kiritish uchun ham sun'iy intellekt transkripsiyasi uchun ulanish talab qilinadi."
      },
      {
        q: "Ma'lumotlarimni qanday eksport qilaman?",
        a: "Hisobotlar → yuqori o'ng burchakdagi «Eksport» tugmasini bosing. Excel (.xlsx) yoki PDF formatini tanlang. Fayl qurilmangizga saqlanadi va uni har qanday messenjer orqali yuborish mumkin."
      },
      {
        q: "Bir nechta valyutadan foydalanishim mumkinmi?",
        a: "Ha. Sozlamalar → Valyuta bo'limiga o'ting va TJS (tojik somonisi), UZS (o'zbek so'mi), KZT (qozoq tengesi) yoki KGS (qirg'iz somi) ni tanlang. Valyutani o'zgartirish barcha mavjud yozuvlarni avtomatik ravishda qayta hisoblab chiqadi."
      },
      {
        q: "Mijozlar qarzlarini qanday kuzataman?",
        a: "Asosiy menyudan «Qarzdorlar» bo'limini oching. Qarzdor qo'shish uchun «+» tugmasini bosing, ismini va qarz miqdorini kiriting. To'lov muddatini belgilashingiz mumkin va ilova sizga eslatma yuboradi."
      },
      {
        q: "Ovozli kiritish ishlamayapti. Nima qilishim kerak?",
        a: "Qurilmangiz sozlamalarida mikrofon ruxsati berilganligiga ishonch hosil qiling: Sozlamalar → Ilovalar → SavdoApp → Ruxsatlar. Ovozli kiritish uchun sun'iy intellekt transkripsiyasi uchun internet ulanishi kerak. Agar muammo davom etsa, biz bilan savdoapp@gmail.com orqali bog'laning."
      },
      {
        q: "Barcha ma'lumotlarimni qanday o'chiraman?",
        a: "Sozlamalar → pastga tushing → «Barcha ma'lumotlarni tozalash». Bu qurilmangizdagi barcha sotuvlar, mahsulotlar va sozlamalarni o'chirib tashlaydi. Bu amalni qaytarib bo'lmaydi."
      },
      {
        q: "Ilova haqiqatan ham bepulmi?",
        a: "Ha, SavdoApp mutlaqo bepul. Xizmatni davom ettirish uchun biz minimal darajadagi xalaqit bermaydigan reklamalarni ko'rsatamiz. Biz hech qachon sizdan haq olmaymiz yoki obuna so'ramaymiz."
      }
    ],
    contact: {
      emailTitle: "Bizga yozing",
      emailDesc: "Xatoliklar, takliflar yoki hisobingiz bo'yicha savollar uchun.",
      emailNote: "Biz 24 soat ichida javob beramiz.",
      rateTitle: "Bizni baholang",
      rateDesc: "Xatolik topdingizmi? Google Play-da sharh qoldiring — biz har birini o'qiymiz.",
      rateBtn: "Google Play-ni ochish"
    },
    tips: [
      { title: "Ovozli kiritish", desc: "Tezroq ovozli kiritish uchun mikrofonni bosing va ushlab turing" },
      { title: "Oylik hisobotlar", desc: "Har oyning oxirida oylik hisobotingizni eksport qiling" },
      { title: "Qarz bildirishnomalari", desc: "Qarz muddati o'tib ketmasligi uchun bildirishnomalarni yoqing" }
    ],
    footer: {
      privacy: "Maxfiylik siyosati",
      support: "Yordam",
      copy: "© 2025 SavdoApp"
    }
  },
  tg: {
    title: 'Маркази дастгирӣ',
    subtext: 'Мо барои кӯмак омода ҳастем. Одатан дар давоми 24 соат ҷавоб медиҳем.',
    contactBtn: '✉ savdoapp@gmail.com',
    faqHeading: 'Саволҳои зиёд додашаванда',
    faq: [
      {
        q: "Чӣ тавр ман фурӯшро илова кунам?",
        a: "Барномаро кушоед, тугмаи «+ Фурӯш»-ро дар поён пахш кунед. Шумо метавонед маълумотро дастӣ ворид кунед ё нишонаи микрофонро пахш карда, номи маҳсулот, миқдор ва нархро бо забонҳои тоҷикӣ, русӣ ё ӯзбекӣ гӯед. Интеллекти сунъӣ формаро ба таври худкор пур мекунад."
      },
      {
        q: "Оё барнома бе интернет кор мекунад?",
        a: "Бале. Ҳама фурӯшҳо, маҳсулот ва ҳисоботҳои шумо дар дастгоҳи шумо ба таври маҳаллӣ сабт мешаванд. Интернет танҳо барои гирифтани қурби асъор ва ахбор лозим аст. Барои воридоти овозӣ низ пайвастшавӣ барои транскрипсияи интеллекти сунъӣ лозим аст."
      },
      {
        q: "Чӣ тавр ман маълумоти худро содирот (export) кунам?",
        a: "Ба бахши Ҳисоботҳо → тугмаи «Содирот»-ро дар кунҷи рости боло пахш кунед. Формати Excel (.xlsx) ё PDF-ро интихоб кунед. Файл дар дастгоҳи шумо сабт мешавад ва онро тавассути ҳар гуна мессенҷер фиристодан мумкин аст."
      },
      {
        q: "Оё ман метавонам якчанд асъорро истифода барам?",
        a: "Бале. Ба Танзимот → Асъор гузаред ва TJS (сомонии тоҷикӣ), UZS (суми ӯзбекӣ), KZT (қазоқистон тенге) ё KGS (қирғизистон сом)-ро интихоб кунед. Иваз кардани асъор ҳамаи сабтҳои мавҷударо ба таври худкор аз нав ҳисоб мекунад."
      },
      {
        q: "Чӣ тавр ман қарзҳои мизоҷонро пайгирӣ кунам?",
        a: "Бахши «Қарздорон»-ро аз менюи асосӣ кушоед. Барои илова кардани қарздор «+»-ро пахш кунед, ном ва маблағи қарзро ворид кунед. Шумо метавонед санаи пардохтро муайян кунед ва барнома ба шумо огоҳинома мефиристад."
      },
      {
        q: "Воридоти овозии ман кор намекунад. Чӣ бояд кард?",
        a: "Боварӣ ҳосил кунед, ки иҷозати микрофон дар танзимоти дастгоҳи шумо дода шудааст: Танзимот → Барномаҳо → SavdoApp → Иҷозатҳо. Воридоти овозӣ барои транскрипсияи интеллекти сунъӣ пайвасти интернетро талаб мекунад. Агар мушкилот боқӣ монад, бо мо тавассути savdoapp@gmail.com тамос гиред."
      },
      {
        q: "Чӣ тавр ман ҳама маълумоти худро нест кунам?",
        a: "Ба Танзимот → ба поён ҳаракат кунед → «Тоза кардани ҳама маълумот». Ин ҳама фурӯшҳо, маҳсулот ва танзимотро аз дастгоҳи шумо нест мекунад. Ин амалро ба ақиб гардонида намешавад."
      },
      {
        q: "Оё барнома воқеан ройгон аст?",
        a: "Бале, SavdoApp комилан ройгон аст. Мо таблиғоти ҳадди аққал ва безарарро нишон медиҳем, то хидматрасонӣ идома ёбад. Мо ҳеҷ гоҳ аз шумо маблағ талаб намекунем ва обуна намепурсем."
      }
    ],
    contact: {
      emailTitle: "Ба мо нависед",
      emailDesc: "Барои гузоришҳо дар бораи хатогиҳо, дархостҳо ё саволҳо дар бораи ҳисоб.",
      emailNote: "Мо дар давоми 24 соат ҷавоб медиҳем.",
      rateTitle: "Моро арзёбӣ кунед",
      rateDesc: "Хатогие ёфтед? Дар Google Play тақриз гузоред — мо ҳар як тақризро мехонем.",
      rateBtn: "Google Play-ро кушоед"
    },
    tips: [
      { title: "Воридоти овозӣ", desc: "Барои воридоти зудтараки овозӣ микрофонро пахш карда нигоҳ доред" },
      { title: "Ҳисоботи моҳона", desc: "Дар охири ҳар моҳ ҳисоботи моҳонаи худро содирот кунед" },
      { title: "Огоҳии қарз", desc: "Огоҳиномаҳоро фаъол кунед, то мӯҳлати пардохти қарзро фаромӯш накунед" }
    ],
    footer: {
      privacy: "Сиёсати махфият",
      support: "Дастгирӣ",
      copy: "© 2025 SavdoApp"
    }
  }
}

export default function SupportPage({
  searchParams,
}: {
  searchParams: { lang?: string }
}) {
  const lang = (searchParams?.lang ?? 'en') as keyof typeof translations
  const t = translations[lang] ?? translations.en

  const css = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1A1A1A;
      background-color: #FFFFFF;
      line-height: 1.5;
    }
    a {
      text-decoration: none;
      color: inherit;
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
      border-bottom: 1px solid #EEEEEE;
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
      color: #1D9E75;
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
      color: #666666;
    }
    .nav-link:hover {
      color: #1D9E75;
    }

    /* Hero */
    .hero {
      background: linear-gradient(to bottom, #1D9E75, #158A63);
      padding: 64px 24px;
      color: white;
      text-align: center;
    }
    .hero h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .hero-subtext {
      font-size: 18px;
      opacity: 0.75;
      margin-bottom: 32px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }
    .hero-btn {
      display: inline-block;
      background: white;
      color: #1D9E75;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
    }

    /* Language Switcher */
    .switcher-bar {
      position: sticky;
      top: 70px;
      background: white;
      padding: 12px 0;
      border-bottom: 1px solid #EEEEEE;
      z-index: 999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    .switcher-inner {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .pill {
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
    }
    .pill.active {
      background-color: #1D9E75;
      color: white;
    }
    .pill.inactive {
      background-color: #F5F5F5;
      color: #666666;
    }

    /* FAQ Section */
    .faq-section {
      padding: 64px 0;
      background: white;
    }
    .section-title-center {
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 40px;
    }
    .faq-list {
      max-width: 800px;
      margin: 0 auto;
    }
    .faq-item {
      border: 1px solid #EEEEEE;
      border-radius: 12px;
      margin-bottom: 8px;
      overflow: hidden;
    }
    .faq-summary {
      padding: 18px 20px;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .faq-summary::-webkit-details-marker {
      display: none;
    }
    .faq-item[open] .faq-summary {
      background-color: #E8F5E9;
      border-bottom: 1px solid #EEEEEE;
    }
    .faq-item[open] {
      border-color: #1D9E75;
    }
    .faq-content {
      padding: 0 20px 18px;
      margin-top: 18px;
      font-size: 14px;
      color: #666666;
      line-height: 1.7;
    }

    /* Contact Section */
    .contact-section {
      padding: 64px 0;
      background: #FFFFFF;
    }
    .contact-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .contact-card {
      padding: 32px;
      border: 1px solid #EEEEEE;
      border-radius: 16px;
      text-align: center;
    }
    .contact-icon {
      width: 36px;
      height: 36px;
      color: #1D9E75;
      margin-bottom: 16px;
    }
    .contact-card h3 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .contact-card p {
      font-size: 14px;
      color: #666666;
      margin-bottom: 16px;
    }
    .contact-link {
      display: block;
      color: #1D9E75;
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .contact-note {
      font-size: 13px;
      color: #666666;
    }
    .contact-btn-outline {
      display: inline-block;
      border: 1px solid #1D9E75;
      color: #1D9E75;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    /* Tips Strip */
    .tips-strip {
      padding: 48px 0;
      background: #F5F5F5;
    }
    .tips-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .tip-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .tip-icon {
      width: 24px;
      height: 24px;
      color: #1D9E75;
    }
    .tip-title {
      font-size: 14px;
      font-weight: 700;
      color: #1A1A1A;
    }
    .tip-desc {
      font-size: 13px;
      color: #666666;
    }

    /* Footer */
    .footer {
      background: #1A1A1A;
      padding: 48px 0;
      color: #999;
    }
    .footer-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
    }
    .footer-logo {
      color: #1D9E75;
      font-size: 18px;
      font-weight: 700;
    }
    .footer-links {
      display: flex;
      gap: 24px;
    }
    .footer-links a {
      font-size: 14px;
    }
    .footer-copy {
      text-align: center;
      font-size: 12px;
      color: #555;
      border-top: 1px solid #333;
      padding-top: 24px;
    }

    @media (max-width: 768px) {
      .contact-grid, .tips-grid {
        grid-template-columns: 1fr;
      }
      .footer-top {
        flex-direction: column;
        gap: 24px;
      }
      .hero h1 {
        font-size: 28px;
      }
    }
  `

  return (
    <main>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <nav className="navbar">
        <div className="container nav-content">
          <a href="/" className="logo">SavdoApp</a>
          <div className="nav-links">
            <a href="/privacy" className="nav-link">{t.footer.privacy}</a>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container hero-content">
          <h1>{t.title}</h1>
          <p className="hero-subtext">{t.subtext}</p>
          <a href="mailto:savdoapp@gmail.com?subject=SavdoApp Support" className="hero-btn">
            {t.contactBtn}
          </a>
        </div>
      </section>

      <nav className="switcher-bar">
        <div className="switcher-inner">
          <a href="?lang=en" className={`pill ${lang === 'en' ? 'active' : 'inactive'}`}>EN</a>
          <a href="?lang=ru" className={`pill ${lang === 'ru' ? 'active' : 'inactive'}`}>RU</a>
          <a href="?lang=uz" className={`pill ${lang === 'uz' ? 'active' : 'inactive'}`}>UZ</a>
          <a href="?lang=tg" className={`pill ${lang === 'tg' ? 'active' : 'inactive'}`}>TG</a>
        </div>
      </nav>

      <section className="faq-section">
        <div className="container">
          <h2 className="section-title-center">{t.faqHeading}</h2>
          <div className="faq-list">
            {t.faq.map((item, i) => (
              <details key={i} className="faq-item">
                <summary className="faq-summary">{item.q}</summary>
                <div className="faq-content">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-section">
        <div className="container contact-grid">
          <div className="contact-card">
            <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <h3>{t.contact.emailTitle}</h3>
            <p>{t.contact.emailDesc}</p>
            <a href="mailto:savdoapp@gmail.com" className="contact-link">savdoapp@gmail.com</a>
            <span className="contact-note">{t.contact.emailNote}</span>
          </div>
          <div className="contact-card">
            <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <h3>{t.contact.rateTitle}</h3>
            <p>{t.contact.rateDesc}</p>
            <a href="#" className="contact-btn-outline">{t.contact.rateBtn}</a>
          </div>
        </div>
      </section>

      <section className="tips-strip">
        <div className="container tips-grid">
          <div className="tip-card">
            <svg className="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21h6"/><path d="M9 18h6"/><path d="M10 22v-2"/><path d="M14 22v-2"/><path d="M12 2a7 7 0 0 0-7 7c0 2.3 1.07 4.34 2.76 5.67L9 17h6l1.24-2.33A7 7 0 0 0 12 2z"/>
            </svg>
        <p className="tip-title">{t.tips[0].title}</p>
        <p className="tip-desc">{t.tips[0].desc}</p>
          </div>
          <div className="tip-card">
            <svg className="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <p className="tip-title">{t.tips[1].title}</p>
            <p className="tip-desc">{t.tips[1].desc}</p>
          </div>
          <div className="tip-card">
            <svg className="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p className="tip-title">{t.tips[2].title}</p>
            <p className="tip-desc">{t.tips[2].desc}</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <a href="/" className="footer-logo">SavdoApp</a>
            <div className="footer-links">
              <a href="/privacy">{t.footer.privacy}</a>
              <a href="/support">{t.footer.support}</a>
            </div>
          </div>
          <p className="footer-copy">{t.footer.copy}</p>
        </div>
      </footer>
    </main>
  )
}

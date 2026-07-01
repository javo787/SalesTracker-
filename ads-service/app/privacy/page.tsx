import React from 'react'
import { Metadata } from 'next'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { lang?: string }
}): Promise<Metadata> {
  const lang = searchParams?.lang ?? 'en'
  const titles = {
    en: 'Privacy Policy — SavdoApp',
    ru: 'Политика конфиденциальности — SavdoApp',
    uz: 'Maxfiylik siyosati — SavdoApp',
    tg: 'Сиёсати махфият — SavdoApp',
  }
  return {
    title: titles[lang as keyof typeof titles] ?? titles.en,
    description: 'SavdoApp privacy policy for mobile application users.',
  }
}

type Section = {
  title: string
  content: string | string[]
  subsections?: { title: string; content: string | string[] }[]
}

type Translation = {
  tagline: string
  heading: string
  lastUpdated: string
  sections: Section[]
  permissions: { name: string; reason: string }[]
  thirdParty: { service: string; purpose: string; url: string }[]
  footerNote: string
  labels: {
    service: string
    purpose: string
    policy: string
    contactEmail: string
    notSold: string
    revocationNote: string
    uninstallNote: string
    contactLabel: string
    emailLabel: string
    responseTime: string
    contactUsAt: string
  }
}

const translations: Record<string, Translation> = {
  en: {
    tagline: 'Simple inventory and sales management',
    heading: 'Privacy Policy',
    lastUpdated: 'Last updated: June 29, 2025',
    labels: {
      service: 'Service',
      purpose: 'Purpose',
      policy: 'Privacy Policy',
      contactEmail: 'savdoapp@gmail.com',
      notSold: 'We do NOT sell your data to third parties.',
      revocationNote: 'All permissions can be revoked anytime in device Settings.',
      uninstallNote: 'Uninstalling the app deletes all local data.',
      contactLabel: 'Contact',
      emailLabel: 'Email',
      responseTime: 'response within 30 days',
      contactUsAt: 'Contact us at',
    },
    sections: [
      {
        title: '1. Introduction',
        content: 'SavdoApp ("we", "us") operates the SavdoApp mobile application. This Privacy Policy explains how we collect, use, and protect your information. By using the App, you agree to this policy.',
      },
      {
        title: '2. Information We Collect',
        content: '',
        subsections: [
          {
            title: 'a) You Provide Directly:',
            content: [
              'Sales & inventory data (products, prices, quantities) you enter manually or by voice',
              'Account info (name, email) when you sign in with Google',
              'Product photos you choose from your photo library (optional)',
            ],
          },
          {
            title: 'b) Collected Automatically:',
            content: [
              'Voice clips sent to Groq (Whisper) for transcription only — not stored',
              'Anonymous usage events via Firebase Analytics',
              'FCM push notification device token (for reminders you set)',
              'Advertising identifiers via Yandex Mobile Ads SDK',
            ],
          },
          {
            title: 'c) We Do NOT Collect:',
            content: [
              'GPS or precise location',
              'Contacts or phonebook',
              'Biometric data (Face ID runs on-device only, never transmitted)',
            ],
          },
        ],
      },
      {
        title: '3. Government and Tax Authorities',
        content: 'We do not transfer data about your sales, products, or income to tax, law enforcement, or other government authorities. SavdoApp has no technical integration with the state information systems of any country. Access to the synchronized data of your store is only available to you and the team members you have personally invited.',
      },
      {
        title: '4. How We Use Your Information',
        content: [
          'Core app features: sales tracking, inventory, reporting',
          'Voice-to-text transcription via Groq',
          'Push notifications for reminders you configure',
          'Contextual ads via Yandex Mobile Ads',
          'Anonymous analytics to improve the app',
          'Support responses',
        ],
      },
      {
        title: '5. Data Storage & Security',
        content: [
          'Business data stored locally on your device (SQLite) — never leaves device unless you export',
          'Server data (account, news) stored on Render with TLS/HTTPS encryption',
          'Reasonable security measures applied; no method is 100% secure',
        ],
      },
      {
        title: '6. Third-Party Services',
        content: 'We use the following third-party services to provide app functionality:',
      },
      {
        title: '7. Permissions',
        content: 'The app requests the following permissions to provide specific features:',
      },
      {
        title: "8. Children's Privacy",
        content: 'The App is not directed at children under 13 (under 16 in EEA). We do not knowingly collect data from children. Contact us to request deletion if applicable.',
      },
      {
        title: '9. Your Rights',
        content: [
          'Access, correct, or delete your data',
          'Object to or restrict processing',
          'Withdraw consent (revoke permissions in Settings)',
          'Data portability',
        ],
      },
      {
        title: '10. Data Retention',
        content: [
          'Local data: until you uninstall or clear app data.',
          'Server data: retained while account is active, deleted within 90 days of account removal.',
        ],
      },
      {
        title: '11. Changes to This Policy',
        content: 'We update this policy as needed. Material changes announced via in-app notice and updated "Last updated" date. Continued use = acceptance.',
      },
      {
        title: '12. Contact Us',
        content: 'If you have questions about this policy, contact us:',
      },
    ],
    permissions: [
      { name: 'Microphone', reason: 'voice input for fast sales entry' },
      { name: 'Photo Library', reason: 'attach product images (optional)' },
      { name: 'Face ID / Biometrics', reason: 'app lock, processed on-device only' },
      { name: 'Notifications', reason: 'reminders and debt alerts you configure' },
    ],
    thirdParty: [
      { service: 'Google Sign-In', purpose: 'Authentication', url: 'policies.google.com/privacy' },
      { service: 'Firebase Analytics & FCM', purpose: 'Analytics & push notifications', url: 'firebase.google.com/support/privacy' },
      { service: 'Groq (Whisper)', purpose: 'Voice-to-text', url: 'groq.com/privacy-policy' },
      { service: 'Yandex Mobile Ads', purpose: 'In-app advertising', url: 'yandex.com/legal/confidential' },
      { service: 'Render', purpose: 'Backend hosting', url: 'render.com/privacy' },
    ],
    footerNote: 'This policy is available in English, Русский, O\'zbek, Тоҷикӣ',
  },
  ru: {
    tagline: 'Простое управление запасами и продажами',
    heading: 'Политика конфиденциальности',
    lastUpdated: 'Последнее обновление: 29 июня 2025 г.',
    labels: {
      service: 'Сервис',
      purpose: 'Цель',
      policy: 'Политика конфиденциальности',
      contactEmail: 'savdoapp@gmail.com',
      notSold: 'Мы НЕ продаем ваши данные третьим лицам.',
      revocationNote: 'Все разрешения можно отозвать в любое время в настройках устройства.',
      uninstallNote: 'Удаление приложения приводит к удалению всех локальных данных.',
      contactLabel: 'Контакт',
      emailLabel: 'Email',
      responseTime: 'ответ в течение 30 дней',
      contactUsAt: 'Свяжитесь с нами',
    },
    sections: [
      {
        title: '1. Введение',
        content: 'SavdoApp («мы», «нас») управляет мобильным приложением SavdoApp. Настоящая Политика конфиденциальности объясняет, как мы собираем, используем и защищаем вашу информацию. Используя Приложение, вы соглашаетесь с этой политикой.',
      },
      {
        title: '2. Информация, которую мы собираем',
        content: '',
        subsections: [
          {
            title: 'а) Предоставляется вами напрямую:',
            content: [
              'Данные о продажах и запасах (товары, цены, количество), которые вы вводите вручную или голосом',
              'Информация об учетной записи (имя, электронная почта) при входе через Google',
              'Фотографии продуктов, которые вы выбираете из своей библиотеки фотографий (необязательно)',
            ],
          },
          {
            title: 'б) Собирается автоматически:',
            content: [
              'Голосовые клипы, отправляемые в Groq (Whisper) только для транскрипции — не хранятся',
              'Анонимные события использования через Firebase Analytics',
              'Токен устройства для push-уведомлений FCM (для установленных вами напоминаний)',
              'Рекламные идентификаторы через Yandex Mobile Ads SDK',
            ],
          },
          {
            title: 'в) Мы НЕ собираем:',
            content: [
              'GPS или точное местоположение',
              'Контакты или телефонную книгу',
              'Биометрические данные (Face ID работает только на устройстве, никогда не передается)',
            ],
          },
        ],
      },
      {
        title: '3. Государственные и налоговые органы',
        content: 'Мы не передаём данные о ваших продажах, товарах или доходах налоговым, правоохранительным или иным государственным органам. У SavdoApp нет технической интеграции с государственными информационными системами какой-либо страны. Доступ к синхронизированным данным вашего магазина есть только у вас и у участников вашей команды, которых вы сами пригласили.',
      },
      {
        title: '4. Как мы используем вашу информацию',
        content: [
          'Основные функции приложения: отслеживание продаж, инвентаризация, отчетность',
          'Транскрипция голоса в текст через Groq',
          'Push-уведомления для настроенных вами напоминаний',
          'Контекстная реклама через Yandex Mobile Ads',
          'Анонимная аналитика для улучшения приложения',
          'Ответы службы поддержки',
        ],
      },
      {
        title: '5. Хранение и безопасность данных',
        content: [
          'Бизнес-данные хранятся локально на вашем устройстве (SQLite) — никогда не покидают устройство, если вы их не экспортируете',
          'Серверные данные (аккаунт, новости) хранятся на Render с шифрованием TLS/HTTPS',
          'Применяются разумные меры безопасности; ни один метод не является на 100% безопасным',
        ],
      },
      {
        title: '6. Сторонние сервисы',
        content: 'Мы используем следующие сторонние сервисы для обеспечения функциональности приложения:',
      },
      {
        title: '7. Разрешения',
        content: 'Приложение запрашивает следующие разрешения для обеспечения определенных функций:',
      },
      {
        title: '8. Конфиденциальность детей',
        content: 'Приложение не предназначено для детей младше 13 лет (младше 16 лет в ЕЭЗ). Мы сознательно не собираем данные детей. Свяжитесь с нами, чтобы запросить удаление, если это применимо.',
      },
      {
        title: '9. Ваши права',
        content: [
          'Доступ, исправление или удаление ваших данных',
          'Возражение против обработки или ограничение обработки',
          'Отозвать согласие (отозвать разрешения в настройках)',
          'Переносимость данных',
        ],
      },
      {
        title: '10. Хранение данных',
        content: [
          'Локальные данные: до тех пор, пока вы не удалите приложение или не очистите данные приложения.',
          'Данные сервера: сохраняются, пока учетная запись активна, удаляются в течение 90 дней после удаления учетной записи.',
        ],
      },
      {
        title: '11. Изменения в этой политике',
        content: 'Мы обновляем эту политику по мере необходимости. О существенных изменениях сообщается через уведомление в приложении и обновленную дату «Последнее обновление». Продолжение использования означает принятие.',
      },
      {
        title: '12. Свяжитесь с нами',
        content: 'Если у вас есть вопросы по этой политике, свяжитесь с нами:',
      },
    ],
    permissions: [
      { name: 'Микрофон', reason: 'голосовой ввод для быстрого ввода продаж' },
      { name: 'Библиотека фотографий', reason: 'прикрепить изображения продуктов (необязательно)' },
      { name: 'Face ID / Биометрия', reason: 'блокировка приложения, обрабатывается только на устройстве' },
      { name: 'Уведомления', reason: 'напоминания и оповещения о долгах, которые вы настраиваете' },
    ],
    thirdParty: [
      { service: 'Google Sign-In', purpose: 'Аутентификация', url: 'policies.google.com/privacy' },
      { service: 'Firebase Analytics & FCM', purpose: 'Аналитика и push-уведомления', url: 'firebase.google.com/support/privacy' },
      { service: 'Groq (Whisper)', purpose: 'Голос в текст', url: 'groq.com/privacy-policy' },
      { service: 'Yandex Mobile Ads', purpose: 'Внутриигровая реклама', url: 'yandex.com/legal/confidential' },
      { service: 'Render', purpose: 'Бэкэнд-хостинг', url: 'render.com/privacy' },
    ],
    footerNote: 'Эта политика доступна на английском, русском, узбекском и таджикском языках.',
  },
  uz: {
    tagline: 'Soddalashtirilgan inventarizatsiya va savdo boshqaruvi',
    heading: 'Maxfiylik siyosati',
    lastUpdated: 'Oxirgi yangilangan sana: 29-iyun, 2025-yil',
    labels: {
      service: 'Xizmat',
      purpose: 'Maqsad',
      policy: 'Maxfiylik siyosati',
      contactEmail: 'savdoapp@gmail.com',
      notSold: 'Biz sizning ma\'lumotlaringizni uchinchi tomonlarga sotmaymiz.',
      revocationNote: 'Barcha ruxsatnomalar istalgan vaqtda qurilma sozlamalarida bekor qilinishi mumkin.',
      uninstallNote: 'Ilovani o\'chirish barcha mahalliy ma\'lumotlarni o\'chirib tashlaydi.',
      contactLabel: 'Aloqa',
      emailLabel: 'Email',
      responseTime: '30 kun ichida javob beriladi',
      contactUsAt: 'Biz bilan bog\'lanish',
    },
    sections: [
      {
        title: '1. Kirish',
        content: 'SavdoApp ("biz", "bizga") SavdoApp mobil ilovasini boshqaradi. Ushbu Maxfiylik siyosati sizning ma\'lumotlaringizni qanday to\'plashimiz, ishlatishimiz va himoya qilishimizni tushuntiradi. Ilovadan foydalanish orqali siz ushbu siyosatga rozilik bildirasiz.',
      },
      {
        title: '2. Biz to\'playdigan ma\'lumotlar',
        content: '',
        subsections: [
          {
            title: 'a) Siz to\'g\'ridan-to\'g\'ri taqdim etadigan ma\'lumotlar:',
            content: [
              'Siz qo\'lda yoki ovoz orqali kiritgan savdo va inventar ma\'lumotlari (mahsulotlar, narxlar, miqdorlar)',
              'Google orqali tizimga kirganingizda hisob ma\'lumotlari (ism, elektron pochta)',
              'Fotosuratlar kutubxonasidan tanlagan mahsulot fotosuratlari (ixtiyoriy)',
            ],
          },
          {
            title: 'b) Avtomatik ravishda to\'planadigan ma\'lumotlar:',
            content: [
              'Faqat transkripsiya uchun Groq (Whisper) ga yuborilgan ovozli kliplar — saqlanmaydi',
              'Firebase Analytics orqali anonim foydalanish hodisalari',
              'FCM push-bildirishnoma qurilma belgisi (siz o\'rnatgan eslatmalar uchun)',
              'Yandex Mobile Ads SDK orqali reklama identifikatorlari',
            ],
          },
          {
            title: 'c) Biz to\'plamaydigan ma\'lumotlar:',
            content: [
              'GPS yoki aniq joylashuv',
              'Kontaktlar yoki telefon kitobi',
              'Biometrik ma\'lumotlar (Face ID faqat qurilmada ishlaydi, hech qachon uzatilmaydi)',
            ],
          },
        ],
      },
      {
        title: '3. Davlat va soliq organlari',
        content: 'Biz sizning savdolaringiz, mahsulotlaringiz yoki daromadlaringiz haqidagi ma\'lumotlarni soliq, huquqni muhofaza qilish yoki boshqa davlat organlariga o\'tkazmaymiz. SavdoApp biron bir mamlakatning davlat axborot tizimlari bilan texnik integratsiyaga ega emas. Do\'koningizning sinxronlashtirilgan ma\'lumotlariga faqat siz va o\'zingiz taklif qilgan jamoa a\'zolari kirish huquqiga ega.',
      },
      {
        title: '4. Ma\'lumotlaringizdan qanday foydalanamiz',
        content: [
          'Ilovaning asosiy xususiyatlari: savdo kuzatuvi, inventarizatsiya, hisobot berish',
          'Groq orqali ovozni matnga aylantirish',
          'Siz sozlagan eslatmalar uchun push-bildirishnomalar',
          'Yandex Mobile Ads orqali kontekstli reklamalar',
          'Ilovani yaxshilash uchun anonim tahlillar',
          'Qo\'llab-quvvatlash xizmati javoblari',
        ],
      },
      {
        title: '5. Ma\'lumotlarni saqlash va xavfsizligi',
        content: [
          'Biznes ma\'lumotlari qurilmangizda mahalliy ravishda saqlanadi (SQLite) — eksport qilmasangiz, hech qachon qurilmadan tashqariga chiqmaydi',
          'Server ma\'lumotlari (hisob, yangiliklar) Render-da TLS/HTTPS shifrlash bilan saqlanadi',
          'Oqilona xavfsizlik choralari qo\'llaniladi; hech qanday usul 100% xavfsiz emas',
        ],
      },
      {
        title: '6. Uchinchi tomon xizmatlari',
        content: 'Ilova funksionalligini ta\'minlash uchun biz quyidagi uchinchi tomon xizmatlaridan foydalanamiz:',
      },
      {
        title: '7. Ruxsatnomalar',
        content: 'Ilova muayyan funksiyalarni ta\'minlash uchun quyidagi ruxsatnomalarni so\'raydi:',
      },
      {
        title: '8. Bolalar maxfiyligi',
        content: 'Ilova 13 yoshga to\'lmagan (EEAda 16 yoshgacha) bolalarga qaratilmagan. Biz bila turib bolalardan ma\'lumot to\'plamaymiz. Agar kerak bo\'lsa, o\'chirishni so\'rash uchun biz bilan bog\'laning.',
      },
      {
        title: '9. Sizning huquqlaringiz',
        content: [
          'Ma\'lumotlaringizga kirish, ularni tuzatish yoki o\'chirish',
          'Qayta ishlashga e\'tiroz bildirish yoki uni cheklash',
          'Rozilikni qaytarib olish (sozlamalarda ruxsatnomalarni bekor qilish)',
          'Ma\'lumotlar portativligi',
        ],
      },
      {
        title: '10. Ma\'lumotlarni saqlash muddati',
        content: [
          'Mahalliy ma\'lumotlar: ilovani o\'chirib tashlamaguningizcha yoki ilova ma\'lumotlarini tozalamaguningizcha.',
          'Server ma\'lumotlari: hisob faol bo\'lganda saqlanadi, hisob o\'chirilgandan keyin 90 kun ichida o\'chiriladi.',
        ],
      },
      {
        title: '11. Ushbu siyosatga o\'zgartirishlar',
        content: 'Ushbu siyosatni kerak bo\'lganda yangilab turamiz. Muhim o\'zgartirishlar ilova ichidagi bildirishnoma va yangilangan "Oxirgi yangilangan sana" orqali e\'lon qilinadi. Foydalanishni davom ettirish rozilikni anglatadi.',
      },
      {
        title: '12. Biz bilan bog\'lanish',
        content: 'Ushbu siyosat bo\'yicha savollaringiz bo\'lsa, biz bilan bog\'laning:',
      },
    ],
    permissions: [
      { name: 'Mikrofon', reason: 'tezkor savdo kiritish uchun ovozli kiritish' },
      { name: 'Rasmlar kutubxonasi', reason: 'mahsulot rasmlarini biriktirish (ixtiyoriy)' },
      { name: 'Face ID / Biometriya', reason: 'ilovani bloklash, faqat qurilmada qayta ishlanadi' },
      { name: 'Bildirishnomalar', reason: 'siz sozlagan eslatmalar va qarz haqidagi ogohlantirishlar' },
    ],
    thirdParty: [
      { service: 'Google Sign-In', purpose: 'Autentifikatsiya', url: 'policies.google.com/privacy' },
      { service: 'Firebase Analytics & FCM', purpose: 'Analitika va push-bildirishnomalar', url: 'firebase.google.com/support/privacy' },
      { service: 'Groq (Whisper)', purpose: 'Ovozni matnga aylantirish', url: 'groq.com/privacy-policy' },
      { service: 'Yandex Mobile Ads', purpose: 'Ilova ichidagi reklama', url: 'yandex.com/legal/confidential' },
      { service: 'Render', purpose: 'Backend xosting', url: 'render.com/privacy' },
    ],
    footerNote: 'Ushbu siyosat Ingliz, Rus, O\'zbek va Tojik tillarida mavjud.',
  },
  tg: {
    tagline: 'Идоракунии соддаи захираҳо ва фурӯш',
    heading: 'Сиёсати махфият',
    lastUpdated: 'Навсозии охирин: 29 июни соли 2025',
    labels: {
      service: 'Хизматрасонӣ',
      purpose: 'Мақсад',
      policy: 'Сиёсати махфият',
      contactEmail: 'savdoapp@gmail.com',
      notSold: 'Мо маълумоти шуморо ба шахсони сеюм НАМЕФУРӮШЕМ.',
      revocationNote: 'Ҳама иҷозатҳоро дар ҳар вақт дар Танзимоти дастгоҳ бекор кардан мумкин аст.',
      uninstallNote: 'Нест кардани барнома ҳама маълумоти маҳаллиро нест мекунад.',
      contactLabel: 'Тамос',
      emailLabel: 'Email',
      responseTime: 'ҷавоб дар давоми 30 рӯз',
      contactUsAt: 'Бо мо тамос гиред',
    },
    sections: [
      {
        title: '1. Муқаддима',
        content: 'SavdoApp ("мо", "моро") замимаи мобилии SavdoApp-ро идора мекунад. Ин Сиёсати махфият чӣ гуна ҷамъоварӣ, истифода ва ҳифзи маълумоти шуморо шарҳ медиҳад. Бо истифода аз Барнома, шумо ба ин сиёсат розӣ мешавед.',
      },
      {
        title: '2. Маълумоте, ки мо ҷамъ меорем',
        content: '',
        subsections: [
          {
            title: 'а) Шумо бевосита пешниҳод мекунед:',
            content: [
              'Маълумот дар бораи фурӯш ва инвентаризатсия (маҳсулот, нархҳо, миқдор), ки шумо дастӣ ё бо овоз ворид мекунед',
              'Маълумоти ҳисоб (ном, почтаи электронӣ) ҳангоми ворид шудан бо Google',
              'Аксҳои маҳсулот, ки шумо аз китобхонаи аксҳои худ интихоб мекунед (ихтиёрӣ)',
            ],
          },
          {
            title: 'б) Ба таври худкор ҷамъоварӣ карда мешавад:',
            content: [
              'Клипҳои овозӣ ба Groq (Whisper) танҳо барои транскрипсия фиристода мешаванд — нигоҳ дошта намешаванд',
              'Рӯйдодҳои истифодаи беном тавассути Firebase Analytics',
              'Токени дастгоҳи огоҳиномаи FCM (барои ёдраскуниҳои муқарраркардаи шумо)',
              'Идентификаторҳои таблиғотӣ тавассути Yandex Mobile Ads SDK',
            ],
          },
          {
            title: 'в) Мо ҷамъ намеорем:',
            content: [
              'GPS ё макони дақиқ',
              'Тамос ё дафтари телефон',
              'Маълумоти биометрӣ (Face ID танҳо дар дастгоҳ кор мекунад, ҳеҷ гоҳ интиқол дода намешавад)',
            ],
          },
        ],
      },
      {
        title: '3. Мақомоти давлатӣ ва андоз',
        content: 'Мо маълумотро дар бораи фурӯш, мол ё даромади шумо ба мақомоти андоз, ҳифзи ҳуқуқ ё дигар мақомоти давлатӣ намедиҳем. SavdoApp бо системаҳои иттилоотии давлатии ягон кишвар ҳамгироии техникӣ надорад. Дастрасӣ ба маълумоти ҳамоҳангшудаи дӯкони шумо танҳо барои шумо ва аъзоёни дастае, ки худатон даъват кардаед, дастрас аст.',
      },
      {
        title: '4. Чӣ тавр мо маълумоти шуморо истифода мебарем',
        content: [
          'Хусусиятҳои асосии барнома: пайгирии фурӯш, инвентаризатсия, ҳисоботдиҳӣ',
          'Транскрипсияи овоз ба матн тавассути Groq',
          'Огоҳиномаҳо барои ёдраскуниҳои танзимкардаи шумо',
          'Таблиғоти контекстӣ тавассути Yandex Mobile Ads',
          'Таҳлили беном барои беҳтар кардани барнома',
          'Ҷавобҳои дастгирӣ',
        ],
      },
      {
        title: '5. Нигоҳдорӣ ва амнияти маълумот',
        content: [
          'Маълумоти тиҷоратӣ дар дастгоҳи шумо ба таври маҳаллӣ нигоҳ дошта мешавад (SQLite) — ҳеҷ гоҳ аз дастгоҳ берун намеравад, агар шумо содирот накунед',
          'Маълумоти сервер (ҳисоб, ахбор) дар Render бо рамзгузории TLS/HTTPS нигоҳ дошта мешавад',
          'Чораҳои оқилонаи амниятӣ татбиқ карда мешаванд; ягон усул 100% бехатар нест',
        ],
      },
      {
        title: '6. Хизматрасониҳои тарафи сеюм',
        content: 'Мо хидматҳои зерини тарафи сеюмро барои таъмини кори барнома истифода мебарем:',
      },
      {
        title: '7. Иҷозатҳо',
        content: 'Барнома иҷозатҳои зеринро барои таъмини хусусиятҳои мушаххас дархост мекунад:',
      },
      {
        title: '8. Махфияти кӯдакон',
        content: 'Барнома ба кӯдакони то 13-сола (дар EEA то 16-сола) нигаронида нашудааст. Мо дидаю дониста аз кӯдакон маълумот ҷамъ намеорем. Барои дархости нест кардан бо мо тамос гиред, агар лозим бошад.',
      },
      {
        title: '9. Ҳуқуқҳои шумо',
        content: [
          'Дастрасӣ, ислоҳ ё нест кардани маълумоти шумо',
          'Эътироз ба коркард ё маҳдуд кардани он',
          'Бозхонди розигӣ (бекор кардани иҷозатҳо дар Танзимот)',
          'Интиқоли маълумот',
        ],
      },
      {
        title: '10. Нигоҳдории маълумот',
        content: [
          'Маълумоти маҳаллӣ: то он даме, ки шумо барномаро нест кунед ё маълумоти барномаро тоза кунед.',
          'Маълумоти сервер: то он даме, ки ҳисоб фаъол аст, нигоҳ дошта мешавад, дар давоми 90 рӯзи нест кардани ҳисоб нест карда мешавад.',
        ],
      },
      {
        title: '11. Тағйирот дар ин сиёсат',
        content: 'Мо ин сиёсатро мувофиқи зарурат нав мекунем. Тағйироти ҷиддӣ тавассути огоҳии дохили барнома ва санаи навшудаи "Навсозии охирин" эълон карда мешаванд. Идомаи истифода = қабул.',
      },
      {
        title: '12. Бо мо тамос гиред',
        content: 'Агар шумо дар бораи ин сиёсат савол дошта бошед, бо мо тамос гиред:',
      },
    ],
    permissions: [
      { name: 'Микрофон', reason: 'воридоти овозӣ барои ворид кардани зуди фурӯш' },
      { name: 'Китобхонаи аксҳо', reason: 'замима кардани аксҳои маҳсулот (ихтиёрӣ)' },
      { name: 'Face ID / Биометрия', reason: 'қулфи барнома, танҳо дар дастгоҳ коркард мешавад' },
      { name: 'Огоҳиномаҳо', reason: 'ёдраскуниҳо ва огоҳиҳои қарзӣ, ки шумо танзим мекунед' },
    ],
    thirdParty: [
      { service: 'Google Sign-In', purpose: 'Аутентификатсия', url: 'policies.google.com/privacy' },
      { service: 'Firebase Analytics & FCM', purpose: 'Таҳлил ва огоҳиномаҳо', url: 'firebase.google.com/support/privacy' },
      { service: 'Groq (Whisper)', purpose: 'Овоз ба матн', url: 'groq.com/privacy-policy' },
      { service: 'Yandex Mobile Ads', purpose: 'Таблиғ дар барнома', url: 'yandex.com/legal/confidential' },
      { service: 'Render', purpose: 'Backend хостинг', url: 'render.com/privacy' },
    ],
    footerNote: 'Ин сиёсат бо забонҳои Англисӣ, Русский, O\'zbek, Тоҷикӣ дастрас аст.',
  },
}

export default function PrivacyPage({
  searchParams,
}: {
  searchParams: { lang?: string }
}) {
  const lang = searchParams?.lang ?? 'en'
  const t = translations[lang as keyof typeof translations] ?? translations.en

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
    .last-updated {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.75);
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
    .section {
      margin-bottom: 40px;
      padding: 24px;
      border-radius: 12px;
    }
    .section:nth-child(even) {
      background-color: white;
    }
    .section:nth-child(odd) {
      background-color: #F9F9F9;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 16px;
      color: #1A1A1A;
      border-left: 3px solid #1D9E75;
      padding-left: 16px;
    }
    .subsection-title {
      font-size: 16px;
      font-weight: 600;
      margin: 20px 0 12px;
      color: #333;
    }
    .text {
      font-size: 15px;
      color: #444;
      margin-bottom: 12px;
    }
    .bullet-list {
      margin: 12px 0;
      padding-left: 20px;
    }
    .bullet-item {
      margin-bottom: 8px;
      font-size: 15px;
      color: #444;
    }
    .table-container {
      overflow-x: auto;
      margin: 20px 0;
      border: 1px solid #EEEEEE;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      background-color: #E8F5E9;
      text-align: left;
      padding: 12px;
      font-weight: 600;
    }
    td {
      padding: 12px;
      border-top: 1px solid #EEEEEE;
    }
    .badge-container {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .badge {
      background-color: #E8F5E9;
      color: #158A63;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
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
    .small-note {
      margin-top: 16px;
      font-size: 12px;
      opacity: 0.5;
    }
    .bold-label {
      font-weight: bold;
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
      .section {
        padding: 16px;
      }
      .switcher-inner {
        justify-content: flex-start;
        padding: 0 16px;
      }
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="header">
        <div className="container">
          <div className="logo">SavdoApp</div>
          <div className="tagline">{t.tagline}</div>
          <h1 className="main-heading">{t.heading}</h1>
          <div className="last-updated">{t.lastUpdated}</div>
        </div>
      </header>

      <nav className="switcher-bar">
        <div className="switcher-inner">
          <a href="?lang=en" className={`pill ${lang === 'en' ? 'active' : 'inactive'}`}>
            EN
          </a>
          <a href="?lang=ru" className={`pill ${lang === 'ru' ? 'active' : 'inactive'}`}>
            RU
          </a>
          <a href="?lang=uz" className={`pill ${lang === 'uz' ? 'active' : 'inactive'}`}>
            UZ
          </a>
          <a href="?lang=tg" className={`pill ${lang === 'tg' ? 'active' : 'inactive'}`}>
            TG
          </a>
        </div>
      </nav>

      <main className="content">
        <div className="container">
          {t.sections.map((section, idx) => (
            <section key={idx} className="section">
              <h2 className="section-title">{section.title}</h2>
              {section.content && !Array.isArray(section.content) && (
                <p className="text">{section.content}</p>
              )}
              {Array.isArray(section.content) && (
                <ul className="bullet-list">
                  {section.content.map((item, i) => (
                    <li key={i} className="bullet-item">
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {section.subsections &&
                section.subsections.map((sub, i) => (
                  <div key={i}>
                    <h3 className="subsection-title">{sub.title}</h3>
                    {Array.isArray(sub.content) ? (
                      <ul className="bullet-list">
                        {sub.content.map((item, j) => (
                          <li key={j} className="bullet-item">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text">{sub.content}</p>
                    )}
                  </div>
                ))}

              {/* Special content for specific sections */}
              {section.title.includes('4.') && (
                <p className="text">
                  <span className="bold-label">{t.labels.notSold}</span>
                </p>
              )}

              {section.title.includes('6.') && (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.labels.service}</th>
                        <th>{t.labels.purpose}</th>
                        <th>{t.labels.policy}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.thirdParty.map((tp, i) => (
                        <tr key={i}>
                          <td>{tp.service}</td>
                          <td>{tp.purpose}</td>
                          <td>
                            <a
                              href={`https://${tp.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#1D9E75' }}
                            >
                              {tp.url}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {section.title.includes('7.') && (
                <>
                  <div className="badge-container">
                    {t.permissions.map((p, i) => (
                      <div key={i} className="badge">
                        <span className="bold-label">{p.name}</span> — {p.reason}
                      </div>
                    ))}
                  </div>
                  <p className="text" style={{ marginTop: '16px', fontSize: '13px', opacity: 0.8 }}>
                    {t.labels.revocationNote}
                  </p>
                </>
              )}

              {section.title.includes('9.') && (
                <>
                  <p className="text">
                    {t.labels.contactLabel}:{' '}
                    <a href={`mailto:${t.labels.contactEmail}`} className="footer-email">
                      {t.labels.contactEmail}
                    </a>{' '}
                    — {t.labels.responseTime}.
                  </p>
                  <p className="text" style={{ fontSize: '13px', opacity: 0.8 }}>
                    {t.labels.uninstallNote}
                  </p>
                </>
              )}

              {section.title.includes('12.') && (
                <p className="text">
                  SavdoApp<br />
                  {t.labels.emailLabel}:{' '}
                  <a href={`mailto:${t.labels.contactEmail}`} className="footer-email">
                    {t.labels.contactEmail}
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            {t.labels.contactUsAt}:{' '}
            <a href={`mailto:${t.labels.contactEmail}`} className="footer-email">
              {t.labels.contactEmail}
            </a>
          </p>
          <div className="copyright">© 2025 SavdoApp</div>
          <div className="small-note">{t.footerNote}</div>
        </div>
      </footer>
    </>
  )
}

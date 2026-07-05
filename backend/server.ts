import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import syncRoutes from './routes/sync';
import profileRoutes from './routes/profile';
import shopRoutes from './routes/shop';
import notificationRoutes from './routes/notifications';
import telegramRoutes from './routes/telegram';
import voiceSaleRoutes from './routes/voiceSale';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render всегда работает за reverse-proxy — без этого express-rate-limit
// видит один и тот же IP для всех клиентов (см. ERR_ERL_UNEXPECTED_X_FORWARDED_FOR в логах Render)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// General rate limit — all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Strict limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth attempts, please try again later.' },
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// Отдельный, более щедрый лимитер для поллинга статуса Telegram-логина —
// это read-only проверка временного токена (не brute-force поверхность),
// а клиент опрашивает её раз в 2 сек до 30 раз за один вход.
const telegramCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth attempts, please try again later.' },
});

const voiceSaleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много голосовых запросов, подождите минуту.' },
});

// Порядок важен: конкретный путь регистрируем ДО общего app.use('/auth', authLimiter),
// чтобы /auth/telegram/check не попадал под authLimiter.
app.use('/auth/telegram/check', telegramCheckLimiter);
app.use('/auth', authLimiter);
app.use('/voice-sale', voiceSaleLimiter);

app.use(express.json({ limit: '2mb' })); // reduced from 10mb

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/savdo') // Keeping DB name 'savdo' in URI for continuity
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/auth', authRoutes);
app.use('/sync', syncRoutes);
app.use('/profile', profileRoutes);
app.use('/shop', shopRoutes);
app.use('/notifications', notificationRoutes);
app.use('/telegram', telegramRoutes);
app.use('/voice-sale', voiceSaleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

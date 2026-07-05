import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import ShopMember from '../models/ShopMember';
import Shop from '../models/Shop';
import AccountDeletionRequest from '../models/AccountDeletionRequest';
import { verifyGoogleToken } from '../utils/googleAuth';
import { verifyTelegramAuth } from '../utils/telegramAuth';
import { sendMessage } from '../services/telegramBot';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { pendingTelegramAuths, cleanupPendingAuths } from '../utils/telegramLoginStore';
import { deleteUserAccount } from '../utils/accountDeletion';

const router = express.Router();

const generateToken = (userId: string) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

router.post('/guest', async (req, res) => {
  try {
    const name = `Торговец #${Math.floor(1000 + Math.random() * 9000)}`;
    const user = new User({
      authProvider: 'anonymous',
      name,
      referralCode: generateReferralCode(),
    });
    await user.save();
    const token = generateToken((user._id as any).toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error creating guest' });
  }
});

router.post('/email/register', async (req, res) => {
  const { email, password, name, referralCode } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    let referredBy;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referredBy = referrer._id;
        referrer.referralCount += 1;
        await referrer.save();
      }
    }

    const user = new User({
      authProvider: 'email',
      email,
      passwordHash,
      name,
      referralCode: generateReferralCode(),
      referredBy,
    });
    await user.save();
    const token = generateToken((user._id as any).toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error registering' });
  }
});

router.post('/email/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken((user._id as any).toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in' });
  }
});

router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  try {
    const payload = await verifyGoogleToken(idToken);
    if (!payload) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, picture: avatarUrl } = payload;
    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({
        authProvider: 'google',
        googleId,
        email,
        name,
        avatarUrl,
        referralCode: generateReferralCode(),
      });
      await user.save();
    } else {
    }
    const token = generateToken((user._id as any).toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error with Google auth' });
  }
});

router.post('/telegram', async (req, res) => {
  const data = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  try {
    if (!verifyTelegramAuth(data, botToken)) {
      return res.status(400).json({ message: 'Invalid Telegram data' });
    }

    const { id: telegramId, first_name, last_name, username: telegramUsername, photo_url: avatarUrl } = data;
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({
        authProvider: 'telegram',
        telegramId,
        telegramUsername,
        name: last_name ? `${first_name} ${last_name}` : first_name,
        avatarUrl,
        referralCode: generateReferralCode(),
      });
      await user.save();
    }
    const token = generateToken((user._id as any).toString());
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error with Telegram auth' });
  }
});

// Telegram Bot Webhook / Callback
router.post('/telegram/callback', async (req, res) => {
  const { tempToken, ...telegramData } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  if (!verifyTelegramAuth(telegramData, botToken)) {
    return res.status(400).json({ message: 'Invalid data' });
  }

  const { id: telegramId, first_name, last_name, username: telegramUsername, photo_url: avatarUrl } = telegramData;
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = new User({
      authProvider: 'telegram',
      telegramId,
      telegramUsername,
      name: last_name ? `${first_name} ${last_name}` : first_name,
      avatarUrl,
      referralCode: generateReferralCode(),
    });
    await user.save();
  }

  const token = generateToken((user._id as any).toString());
  pendingTelegramAuths.set(tempToken, { token, user });
  cleanupPendingAuths();

  // Auto-expire after 2 minutes
  setTimeout(() => pendingTelegramAuths.delete(tempToken), 120000);

  res.json({ success: true });
});

router.get('/telegram/check', (req, res) => {
  const { token } = req.query;
  const auth = pendingTelegramAuths.get(token as string);
  if (auth) {
    pendingTelegramAuths.delete(token as string);
    res.json(auth);
  } else {
    res.status(404).json({ message: 'Pending' });
  }
});

router.post('/convert', authMiddleware, async (req: AuthRequest, res) => {
  const { provider, ...providerData } = req.body;
  try {
    const user = await User.findById(req.userId);
    if (!user || user.authProvider !== 'anonymous') {
      return res.status(400).json({ message: 'Only guest accounts can be converted' });
    }

    if (provider === 'email') {
      const { email, password, name } = providerData;
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ message: 'Email already taken' });

      user.authProvider = 'email';
      user.email = email;
      user.passwordHash = await bcrypt.hash(password, 12);
      if (name) user.name = name;
    } else if (provider === 'google') {
      const { idToken } = providerData;
      const payload = await verifyGoogleToken(idToken);
      if (!payload) return res.status(400).json({ message: 'Invalid Google token' });

      const existing = await User.findOne({ googleId: payload.sub });
      if (existing) return res.status(400).json({ message: 'Google account already linked to another user' });

      user.authProvider = 'google';
      user.googleId = payload.sub;
      user.email = payload.email;
      user.name = payload.name;
      user.avatarUrl = payload.picture;
    } else if (provider === 'telegram') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      if (!verifyTelegramAuth(providerData as any, botToken)) {
        return res.status(400).json({ message: 'Invalid Telegram data' });
      }

      const existing = await User.findOne({ telegramId: providerData.id });
      if (existing) return res.status(400).json({ message: 'Telegram account already linked to another user' });

      user.authProvider = 'telegram';
      user.telegramId = providerData.id;
      user.telegramUsername = providerData.username;
      user.name = providerData.last_name ? `${providerData.first_name} ${providerData.last_name}` : providerData.first_name;
      user.avatarUrl = providerData.photo_url;
    }

    await user.save();
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Error converting account' });
  }
});

router.delete('/account', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });
    const result = await deleteUserAccount(req.userId);
    if (!result.ok) {
      return res.status(409).json({ message: result.message + ' Либо обратитесь в поддержку: support@torgo.app' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

router.post('/account/deletion-request', async (req, res) => {
  try {
    const { identifier, reason } = req.body;
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required' });
    }

    await AccountDeletionRequest.create({ identifier: identifier.trim(), reason });

    const adminIds = (process.env.ADMIN_TELEGRAM_ID || '')
      .split(',')
      .map(id => Number(id.trim()))
      .filter(id => Number.isFinite(id) && id !== 0);

    for (const id of adminIds) {
      try {
        await sendMessage(id, `🗑 <b>Запрос на удаление аккаунта</b>\n\nИдентификатор: ${identifier}\nПричина: ${reason || '—'}`);
      } catch (err) {
        console.error('[account:deletionRequest] failed to notify admin', id, err);
      }
    }

    res.json({ ok: true, message: 'Deletion request received' });
  } catch (err) {
    console.error('Deletion request error:', err);
    res.status(500).json({ message: 'Failed to submit request' });
  }
});

export default router;

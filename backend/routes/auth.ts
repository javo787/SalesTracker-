import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { verifyGoogleToken } from '../utils/googleAuth';
import { verifyTelegramAuth } from '../utils/telegramAuth';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { pendingTelegramAuths, cleanupPendingAuths } from '../utils/telegramLoginStore';

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
  console.log('[AUTH_LOG][api:guest] entry'); // AUTH_LOG
  try {
    const name = `Торговец #${Math.floor(1000 + Math.random() * 9000)}`;
    const user = new User({
      authProvider: 'anonymous',
      name,
      referralCode: generateReferralCode(),
    });
    await user.save();
    const token = generateToken((user._id as any).toString());
    console.log('[AUTH_LOG][api:guest] success userId=', user._id); // AUTH_LOG
    res.json({ token, user });
  } catch (error) {
    console.error('[AUTH_LOG][api:guest] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error creating guest' });
  }
});

router.post('/email/register', async (req, res) => {
  const { email, password, name, referralCode } = req.body;
  console.log('[AUTH_LOG][api:register] entry email=', email); // AUTH_LOG

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
    console.log('[AUTH_LOG][api:register] success userId=', user._id); // AUTH_LOG
    res.json({ token, user });
  } catch (error) {
    console.error('[AUTH_LOG][api:register] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error registering' });
  }
});

router.post('/email/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('[AUTH_LOG][api:login] entry email=', email); // AUTH_LOG
  try {
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash) {
      console.log('[AUTH_LOG][api:login] fail: user not found or no passwordHash'); // AUTH_LOG
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      console.log('[AUTH_LOG][api:login] fail: password mismatch'); // AUTH_LOG
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken((user._id as any).toString());
    console.log('[AUTH_LOG][api:login] success userId=', user._id); // AUTH_LOG
    res.json({ token, user });
  } catch (error) {
    console.error('[AUTH_LOG][api:login] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error logging in' });
  }
});

router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  console.log('[AUTH_LOG][api:google] entry'); // AUTH_LOG
  try {
    const payload = await verifyGoogleToken(idToken);
    if (!payload) {
      console.log('[AUTH_LOG][api:google] fail: invalid token'); // AUTH_LOG
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, picture: avatarUrl } = payload;
    console.log('[AUTH_LOG][api:google] payload sub=', googleId); // AUTH_LOG
    let user = await User.findOne({ googleId });
    if (!user) {
      console.log('[AUTH_LOG][api:google] creating new user'); // AUTH_LOG
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
      console.log('[AUTH_LOG][api:google] existing user found'); // AUTH_LOG
    }
    const token = generateToken((user._id as any).toString());
    console.log('[AUTH_LOG][api:google] success userId=', user._id); // AUTH_LOG
    res.json({ token, user });
  } catch (error) {
    console.error('[AUTH_LOG][api:google] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error with Google auth' });
  }
});

router.post('/telegram', async (req, res) => {
  const data = req.body;
  console.log('[AUTH_LOG][api:telegram] entry'); // AUTH_LOG
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  try {
    if (!verifyTelegramAuth(data, botToken)) {
      console.log('[AUTH_LOG][api:telegram] fail: invalid auth data'); // AUTH_LOG
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
    console.log('[AUTH_LOG][api:telegram] success userId=', user._id); // AUTH_LOG
    res.json({ token, user });
  } catch (error) {
    console.error('[AUTH_LOG][api:telegram] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error with Telegram auth' });
  }
});

// Telegram Bot Webhook / Callback
router.post('/telegram/callback', async (req, res) => {
  const { tempToken, ...telegramData } = req.body;
  console.log('[AUTH_LOG][api:telegram:callback] entry tempToken=', tempToken); // AUTH_LOG
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  if (!verifyTelegramAuth(telegramData, botToken)) {
    console.log('[AUTH_LOG][api:telegram:callback] fail: invalid auth data'); // AUTH_LOG
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
  console.log('[AUTH_LOG][api:telegram:callback] success userId=', user._id); // AUTH_LOG
  pendingTelegramAuths.set(tempToken, { token, user });
  cleanupPendingAuths();

  // Auto-expire after 2 minutes
  setTimeout(() => pendingTelegramAuths.delete(tempToken), 120000);

  res.json({ success: true });
});

router.get('/telegram/check', (req, res) => {
  const { token } = req.query;
  console.log('[AUTH_LOG][api:telegram:check] token=', token); // AUTH_LOG
  const auth = pendingTelegramAuths.get(token as string);
  if (auth) {
    console.log('[AUTH_LOG][api:telegram:check] found: true, userId=', auth.user._id); // AUTH_LOG
    pendingTelegramAuths.delete(token as string);
    res.json(auth);
  } else {
    console.log('[AUTH_LOG][api:telegram:check] found: false'); // AUTH_LOG
    res.status(404).json({ message: 'Pending' });
  }
});

router.post('/convert', authMiddleware, async (req: AuthRequest, res) => {
  const { provider, ...providerData } = req.body;
  console.log('[AUTH_LOG][api:convert] entry userId=', req.userId, 'provider=', provider); // AUTH_LOG
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
    console.log('[AUTH_LOG][api:convert] success'); // AUTH_LOG
    res.json({ user });
  } catch (error) {
    console.error('[AUTH_LOG][api:convert] error=', error); // AUTH_LOG
    res.status(500).json({ message: 'Error converting account' });
  }
});

export default router;

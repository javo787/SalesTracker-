import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import ShopMember from '../models/ShopMember';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
  shopId?: string;
  role?: 'owner' | 'seller';
  sellerName?: string;
  memberId?: string;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not configured');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;

    // Fetch shop membership
    const member = await ShopMember.findOne({ userId: decoded.userId, isActive: true }).lean();
    if (member) {
      req.shopId = member.shopId.toString();
      req.role = member.role;
      req.sellerName = member.displayName;
      req.memberId = member._id.toString();

      // Update lastActiveAt asynchronously
      ShopMember.findByIdAndUpdate(member._id, { lastActiveAt: new Date() }).exec();
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Middleware: requires shop membership
export const requireShop = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.shopId) {
    return res.status(403).json({ message: 'Not a member of any shop. Create or join a shop first.' });
  }
  next();
};

// Middleware: owner only
export const requireOwner = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== 'owner') {
    return res.status(403).json({ message: 'Owner access required' });
  }
  next();
};

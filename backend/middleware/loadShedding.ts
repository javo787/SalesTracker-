import { Request, Response, NextFunction } from 'express';

let inFlight = 0;
// Подобрано под 512MB RAM / 0.1 vCPU free-tier инстанс Render — можно тюнить по факту нагрузки
const MAX_CONCURRENT = 40;

export function loadSheddingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (inFlight >= MAX_CONCURRENT) {
    res.set('Retry-After', '2');
    return res.status(503).json({ message: 'Server is busy, please retry shortly', code: 'SERVER_BUSY' });
  }

  inFlight++;
  let decremented = false;
  const decrement = () => {
    if (!decremented) {
      decremented = true;
      inFlight--;
    }
  };
  res.on('finish', decrement);
  res.on('close', decrement);

  next();
}

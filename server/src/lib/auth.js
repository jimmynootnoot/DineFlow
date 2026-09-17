import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const TOKEN_EXPIRES_IN = '6h';

export const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES_IN,
  });

export const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

export const authMiddleware = (roles = []) => (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing bearer token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (roles.length > 0 && !roles.includes(decoded.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth error', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

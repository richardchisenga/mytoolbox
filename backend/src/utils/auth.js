const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return secret;
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d', issuer: 'mytoolbox-api', audience: 'mytoolbox-web' }
  );
}

function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });
    req.auth = jwt.verify(token, getJwtSecret(), { issuer: 'mytoolbox-api', audience: 'mytoolbox-web' });
    req.userId = req.auth.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(prisma) {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
      if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required' });
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { signAccessToken, authenticate, requireAdmin };

const jwt = require('jsonwebtoken')
const { getConfig } = require('../database')

function authenticate(req, res, next) {
  const token = req.cookies && req.cookies.token
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const secret = getConfig('JWT_SECRET') || 'super_secret_key_123'
  try {
    const decoded = jwt.verify(token, secret)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' })
    }
    next()
  }
}

module.exports = { authenticate, authorize }

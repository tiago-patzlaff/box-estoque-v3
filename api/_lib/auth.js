const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const config = require('./config');

function setCors(res, req) {
  const origin = req.headers?.origin || '';
  if (config.ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res, req);
    res.status(204).end();
    return true;
  }
  return false;
}

function jsonResponse(res, status, data) {
  res.status(status).json(data);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, nome: user.nome, usuario: user.usuario, perfil: user.perfil },
    config.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  const cookies = (req.headers?.cookie || '').split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k) acc[k] = v;
    return acc;
  }, {});
  return cookies['token'] || null;
}

function getUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

function requireAuth(req, res) {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ erro: 'Nao autenticado' });
    return null;
  }
  return user;
}

function requireWrite(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.perfil === 'visualizador') {
    res.status(403).json({ erro: 'Sem permissao' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.perfil !== 'admin') {
    res.status(403).json({ erro: 'Somente administradores' });
    return null;
  }
  return user;
}

async function logAuditoria(userId, acao, detalhes, ip) {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario_id, acao, detalhes, ip_address) VALUES ($1, $2, $3, $4)',
      [userId, acao, detalhes || '', ip || '']
    );
  } catch {}
}

module.exports = {
  pool, config, setCors, handleOptions, jsonResponse,
  generateToken, verifyToken, getUser, requireAuth, requireWrite, requireAdmin,
  logAuditoria, bcrypt
};

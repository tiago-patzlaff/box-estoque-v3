const { setCors, handleOptions, jsonResponse, getUser, logAuditoria } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  const user = getUser(req);
  if (user) {
    await logAuditoria(user.id, 'logout', `${user.usuario} fez logout`);
  }

  res.setHeader('Set-Cookie', 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  jsonResponse(res, 200, { ok: true });
};

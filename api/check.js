const { setCors, handleOptions, jsonResponse, getUser, pool } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  try {
    const result = await pool.query('SELECT 1 as ok');
    const user = getUser(req);
    if (user) {
      jsonResponse(res, 200, { autenticado: true, usuario: user, db: 'ok' });
    } else {
      jsonResponse(res, 200, { autenticado: false, db: 'ok' });
    }
  } catch (e) {
    jsonResponse(res, 500, { erro: 'Erro de conexao com banco', debug: e.message });
  }
};

const { pool, config, setCors, handleOptions, jsonResponse, generateToken, bcrypt, logAuditoria } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { erro: 'Metodo nao permitido' });
  }

  try {
    const body = req.body || {};
    const { usuario, senha } = body;

    if (!usuario || !senha) {
      return jsonResponse(res, 400, { erro: 'Usuario e senha sao obrigatorios' });
    }

    const result = await pool.query(
      'SELECT id, nome, usuario, senha_hash, perfil, ativo FROM usuarios WHERE usuario = $1 LIMIT 1',
      [usuario]
    );

    if (result.rows.length === 0) {
      return jsonResponse(res, 401, { erro: 'Usuario ou senha invalidos' });
    }

    const user = result.rows[0];

    if (!user.ativo) {
      return jsonResponse(res, 403, { erro: 'Conta desativada. Contate o administrador.' });
    }

    const valid = await bcrypt.compare(senha, user.senha_hash);
    if (!valid) {
      return jsonResponse(res, 401, { erro: 'Usuario ou senha invalidos' });
    }

    const token = generateToken(user);

    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.SESSION_LIFETIME || 28800}`);

    await logAuditoria(user.id, 'login', `${user.usuario} fez login`, req.headers?.['x-forwarded-for'] || '');

    jsonResponse(res, 200, {
      ok: true,
      token,
      usuario: { id: user.id, nome: user.nome, usuario: user.usuario, perfil: user.perfil }
    });
  } catch (e) {
    jsonResponse(res, 500, { erro: 'Erro ao fazer login' });
  }
};

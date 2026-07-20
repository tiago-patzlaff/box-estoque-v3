const { pool, config, setCors, handleOptions, jsonResponse, requireAuth, requireWrite, requireAdmin, logAuditoria } = require('./_lib/auth');

function gerarCor(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
  }
  const hue = (((Math.abs(hash) * 137.508) % 360) + 360) % 360;
  const s = 55 + (((hash >>> 8) % 20));
  const l = 45 + (((hash >>> 16) % 15));
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r, g, b;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function corValida(cor) {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor);
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  try {
    switch (req.method) {
      case 'GET': return await listar(req, res);
      case 'POST': return await criar(req, res);
      case 'PUT': return await atualizar(req, res);
      case 'DELETE': return await deletar(req, res);
      default: return jsonResponse(res, 405, { erro: 'Metodo nao permitido' });
    }
  } catch (e) {
    jsonResponse(res, 500, { erro: 'Erro interno' });
  }
};

async function listar(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const q = req.query?.q;
  let result;

  if (q && q.trim()) {
    result = await pool.query(
      'SELECT id, nome, codigo, descricao, cor, ativo FROM produtos WHERE nome ILIKE $1 OR codigo ILIKE $1 ORDER BY nome',
      [`%${q.trim()}%`]
    );
  } else {
    result = await pool.query(
      'SELECT id, nome, codigo, descricao, cor, ativo FROM produtos ORDER BY nome'
    );
  }

  jsonResponse(res, 200, result.rows);
}

async function criar(req, res) {
  const user = requireWrite(req, res);
  if (!user) return;

  const { nome, codigo, descricao, cor } = req.body || {};

  if (!nome || !nome.trim()) {
    return jsonResponse(res, 400, { erro: 'Nome e obrigatorio' });
  }
  if (!codigo || !codigo.trim()) {
    return jsonResponse(res, 400, { erro: 'Codigo e obrigatorio' });
  }
  if (nome.trim().length > 200) {
    return jsonResponse(res, 400, { erro: 'Nome excede 200 caracteres' });
  }
  if (codigo.trim().length > 50) {
    return jsonResponse(res, 400, { erro: 'Codigo excede 50 caracteres' });
  }

  const existente = await pool.query('SELECT id FROM produtos WHERE codigo = $1', [codigo.trim()]);
  if (existente.rows.length > 0) {
    return jsonResponse(res, 409, { erro: 'Codigo ja cadastrado' });
  }

  const finalCor = corValida(cor) ? cor : gerarCor(nome.trim() + codigo.trim());

  const result = await pool.query(
    'INSERT INTO produtos (nome, codigo, descricao, cor) VALUES ($1, $2, $3, $4) RETURNING id',
    [nome.trim(), codigo.trim(), descricao || '', finalCor]
  );

  const ip = req.headers?.['x-forwarded-for'] || '';
  await logAuditoria(user.id, 'criar_produto', `Produto "${nome.trim()}" (id: ${result.rows[0].id}) criado`, ip);

  jsonResponse(res, 201, { id: result.rows[0].id, mensagem: 'Produto criado com sucesso' });
}

async function atualizar(req, res) {
  const user = requireWrite(req, res);
  if (!user) return;

  const { id, nome, codigo, descricao, cor, ativo } = req.body || {};

  if (!id || !Number.isInteger(id) || id <= 0) {
    return jsonResponse(res, 400, { erro: 'ID invalido' });
  }
  if (!nome || !nome.trim()) {
    return jsonResponse(res, 400, { erro: 'Nome e obrigatorio' });
  }
  if (!codigo || !codigo.trim()) {
    return jsonResponse(res, 400, { erro: 'Codigo e obrigatorio' });
  }
  if (nome.trim().length > 200) {
    return jsonResponse(res, 400, { erro: 'Nome excede 200 caracteres' });
  }
  if (codigo.trim().length > 50) {
    return jsonResponse(res, 400, { erro: 'Codigo excede 50 caracteres' });
  }

  const existente = await pool.query('SELECT id FROM produtos WHERE codigo = $1 AND id != $2', [codigo.trim(), id]);
  if (existente.rows.length > 0) {
    return jsonResponse(res, 409, { erro: 'Codigo ja cadastrado' });
  }

  const atual = await pool.query('SELECT cor FROM produtos WHERE id = $1', [id]);
  if (atual.rows.length === 0) {
    return jsonResponse(res, 404, { erro: 'Produto nao encontrado' });
  }

  const finalCor = corValida(cor) ? cor : (atual.rows[0].cor && corValida(atual.rows[0].cor) ? atual.rows[0].cor : gerarCor(nome.trim() + codigo.trim()));

  await pool.query(
    'UPDATE produtos SET nome = $1, codigo = $2, descricao = $3, cor = $4, ativo = $5 WHERE id = $6',
    [nome.trim(), codigo.trim(), descricao || '', finalCor, ativo !== false, id]
  );

  const ip = req.headers?.['x-forwarded-for'] || '';
  await logAuditoria(user.id, 'atualizar_produto', `Produto "${nome.trim()}" (id: ${id}) atualizado`, ip);

  jsonResponse(res, 200, { mensagem: 'Produto atualizado com sucesso' });
}

async function deletar(req, res) {
  const user = requireAdmin(req, res);
  if (!user) return;

  const id = Number(req.query?.id);
  if (!id || !Number.isInteger(id) || id <= 0) {
    return jsonResponse(res, 400, { erro: 'ID invalido' });
  }

  const produto = await pool.query('SELECT id, nome FROM produtos WHERE id = $1', [id]);
  if (produto.rows.length === 0) {
    return jsonResponse(res, 404, { erro: 'Produto nao encontrado' });
  }

  const estoque = await pool.query(
    'SELECT COUNT(*) FROM posicoes WHERE produto_id = $1 AND quantidade > 0',
    [id]
  );
  if (parseInt(estoque.rows[0].count) > 0) {
    return jsonResponse(res, 409, { erro: 'Produto possui estoque e nao pode ser removido' });
  }

  await pool.query('UPDATE posicoes SET produto_id = NULL WHERE produto_id = $1', [id]);
  await pool.query('DELETE FROM produtos WHERE id = $1', [id]);

  const ip = req.headers?.['x-forwarded-for'] || '';
  await logAuditoria(user.id, 'deletar_produto', `Produto "${produto.rows[0].nome}" (id: ${id}) removido`, ip);

  jsonResponse(res, 200, { mensagem: 'Produto removido com sucesso' });
}

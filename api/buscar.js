const { pool, config, setCors, handleOptions, jsonResponse, requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Método não permitido' });
  }

  const authError = requireAuth(req, res);
  if (authError) return;

  const { q } = req.query;

  if (!q || !q.trim()) {
    return jsonResponse(res, 400, { error: 'Parâmetro de busca "q" é obrigatório' });
  }

  try {
    const termo = `%${q.trim()}%`;
    const result = await pool.query(`
      SELECT p.id, p.fileira, p.altura, p.quantidade,
             pr.id AS produto_id, pr.nome AS produto_nome,
             pr.codigo AS produto_codigo, pr.cor AS produto_cor
      FROM posicoes p LEFT JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.quantidade > 0 AND (pr.nome ILIKE $1 OR pr.codigo ILIKE $1)
      ORDER BY pr.nome, p.fileira
    `, [termo]);

    return jsonResponse(res, 200, {
      resultados: result.rows,
      total: result.rows.length,
      busca: q.trim()
    });
  } catch (error) {
    console.error('Erro ao buscar posições:', error);
    return jsonResponse(res, 500, { error: 'Erro interno na busca' });
  }
};

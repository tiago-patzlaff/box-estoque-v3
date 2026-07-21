const { pool, config, setCors, handleOptions, jsonResponse, requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { erro: 'Metodo nao permitido' });
  }

  try {
    const user = requireAuth(req, res);
    if (!user) return;

    const page = Math.max(1, parseInt(req.query?.page) || 1);
    const porPagina = Math.min(100, Math.max(1, parseInt(req.query?.por_pagina) || 20));
    const offset = (page - 1) * porPagina;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (req.query?.tipo) {
      conditions.push(`m.tipo = $${paramIndex++}`);
      params.push(req.query.tipo);
    }
    if (req.query?.produto_id) {
      conditions.push(`m.produto_id = $${paramIndex++}`);
      params.push(parseInt(req.query.produto_id));
    }
    if (req.query?.data_inicio) {
      conditions.push(`m.created_at >= $${paramIndex++}`);
      params.push(req.query.data_inicio);
    }
    if (req.query?.data_fim) {
      conditions.push(`m.created_at <= ($${paramIndex++}::date + interval '1 day')`);
      params.push(req.query.data_fim);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM movimentacoes m ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    const total_pages = Math.ceil(total / porPagina);

    const dataResult = await pool.query(
      `SELECT m.id, m.tipo, m.produto_id, m.fileira, m.altura, m.quantidade, m.observacao, m.created_at,
              p.nome AS produto_nome, p.codigo AS produto_codigo, p.cor AS produto_cor,
              u.nome AS usuario_nome
       FROM movimentacoes m
       LEFT JOIN produtos p ON p.id = m.produto_id
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, porPagina, offset]
    );

    jsonResponse(res, 200, {
      movimentacoes: dataResult.rows,
      total,
      page,
      total_pages
    });

  } catch (e) {
    jsonResponse(res, 500, { erro: 'Erro interno' });
  }
};

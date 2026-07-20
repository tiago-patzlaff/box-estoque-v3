const { pool, setCors, handleOptions, jsonResponse, requireAuth, config } = require('./_lib/auth');

const MAX_FILEIRAS = config.MAX_FILEIRAS;
const MAX_ALTURAS = config.MAX_ALTURAS;
const MAX_PALLET_PER_POS = config.MAX_PALLET_PER_POS;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { erro: 'Metodo nao permitido' });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const { fileira, altura } = req.query;

  try {
    if (fileira && altura) {
      const { rows } = await pool.query(
        `SELECT p.id, p.fileira, p.altura, p.quantidade,
                pr.id AS produto_id, pr.nome AS produto_nome,
                pr.codigo AS produto_codigo, pr.cor AS produto_cor
         FROM posicoes p
         LEFT JOIN produtos pr ON p.produto_id = pr.id
         WHERE p.fileira = $1 AND p.altura = $2
         ORDER BY pr.nome`,
        [fileira, altura]
      );

      const produtos = rows
        .filter(r => r.produto_id !== null)
        .map(r => ({
          id: r.id,
          produto_id: r.produto_id,
          produto_nome: r.produto_nome,
          produto_codigo: r.produto_codigo,
          produto_cor: r.produto_cor,
          quantidade: r.quantidade
        }));

      const totalQuantidade = produtos.reduce((sum, p) => sum + p.quantidade, 0);

      return jsonResponse(res, 200, {
        posicao: {
          fileira: Number(fileira),
          altura: Number(altura),
          quantidade: totalQuantidade,
          produtos
        }
      });
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.fileira, p.altura, p.quantidade,
              pr.id AS produto_id, pr.nome AS produto_nome,
              pr.codigo AS produto_codigo, pr.cor AS produto_cor
       FROM posicoes p
       LEFT JOIN produtos pr ON p.produto_id = pr.id
       WHERE p.quantidade > 0
       ORDER BY p.altura, p.fileira, pr.nome`
    );

    const grouped = {};
    for (const r of rows) {
      const key = `${r.fileira}-${r.altura}`;
      if (!grouped[key]) {
        grouped[key] = { fileira: r.fileira, altura: r.altura, quantidade: 0, produtos: [] };
      }
      grouped[key].quantidade += r.quantidade;
      if (r.produto_id !== null) {
        grouped[key].produtos.push({
          id: r.id,
          produto_id: r.produto_id,
          produto_nome: r.produto_nome,
          produto_codigo: r.produto_codigo,
          produto_cor: r.produto_cor,
          quantidade: r.quantidade
        });
      }
    }

    const posicoes = Object.values(grouped);

    const totalPosicoes = MAX_FILEIRAS * MAX_ALTURAS;
    const ocupadas = posicoes.length;
    const totalPallets = posicoes.reduce((sum, p) => sum + p.quantidade, 0);

    const produtoSet = new Set();
    for (const p of posicoes) {
      for (const prod of p.produtos) {
        produtoSet.add(prod.produto_id);
      }
    }

    const resumo = {
      total_posicoes: totalPosicoes,
      ocupadas,
      livres: totalPosicoes - ocupadas,
      total_pallets: totalPallets,
      capacidade_maxima: totalPosicoes * MAX_PALLET_PER_POS,
      produtos_distintos: produtoSet.size
    };

    return jsonResponse(res, 200, { posicoes, resumo });
  } catch (err) {
    console.error('Erro ao buscar posicoes:', err);
    return jsonResponse(res, 500, { erro: 'Erro interno ao buscar posicoes' });
  }
};

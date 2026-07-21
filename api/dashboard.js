const { pool, config, setCors, handleOptions, jsonResponse, requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Método não permitido' });
  }

  const authError = requireAuth(req, res);
  if (authError) return;

  try {
    const posicoesResult = await pool.query(`
      SELECT p.fileira, p.altura, p.quantidade, p.produto_id,
             pr.nome AS produto_nome, pr.cor AS produto_cor
      FROM posicoes p LEFT JOIN produtos pr ON p.produto_id = pr.id
      ORDER BY p.altura, p.fileira
    `);

    const posicoes = posicoesResult.rows;

    const porPosicao = {};
    for (const p of posicoes) {
      const key = `${p.fileira}_${p.altura}`;
      if (!porPosicao[key]) {
        porPosicao[key] = { fileira: p.fileira, altura: p.altura, total: 0, produtos: [] };
      }
      porPosicao[key].total += p.quantidade;
      if (p.produto_nome) {
        porPosicao[key].produtos.push(p.produto_nome);
      }
    }

    let posicoesOcupadas = 0;
    const criticas = [];
    const atencao = [];

    for (const key in porPosicao) {
      const pos = porPosicao[key];
      if (pos.total > 0) {
        posicoesOcupadas++;
        const entry = {
          fileira: pos.fileira,
          altura: pos.altura,
          quantidade: pos.total,
          produto: [...new Set(pos.produtos)].join(', ')
        };
        if (pos.total <= 3) {
          criticas.push(entry);
        } else if (pos.total <= 6) {
          atencao.push(entry);
        }
      }
    }

    criticas.sort((a, b) => a.quantidade - b.quantidade);
    atencao.sort((a, b) => a.quantidade - b.quantidade);

    const totalPallets = posicoes.reduce((sum, p) => sum + p.quantidade, 0);
    const totalPosicoes = 120;
    const capacidadeMaxima = 1800;

    const produtosMap = {};
    for (const p of posicoes) {
      if (!p.produto_nome) continue;
      if (!produtosMap[p.produto_id]) {
        produtosMap[p.produto_id] = { nome: p.produto_nome, cor: p.produto_cor, total: 0, posicoes: 0 };
      }
      produtosMap[p.produto_id].total += p.quantidade;
      if (p.quantidade > 0) {
        produtosMap[p.produto_id].posicoes++;
      }
    }

    const porProduto = Object.values(produtosMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const porFileira = {};
    for (let f = 1; f <= 24; f++) {
      porFileira[f] = 0;
    }
    for (const p of posicoes) {
      if (porFileira[p.fileira] !== undefined) {
        porFileira[p.fileira] += p.quantidade;
      }
    }

    const porAltura = {};
    for (let a = 1; a <= 5; a++) {
      porAltura[a] = 0;
    }
    for (const p of posicoes) {
      if (porAltura[p.altura] !== undefined) {
        porAltura[p.altura] += p.quantidade;
      }
    }

    const movResult = await pool.query(`
      SELECT m.tipo, m.quantidade, m.created_at, pr.nome AS produto_nome, pr.cor AS produto_cor
      FROM movimentacoes m LEFT JOIN produtos pr ON m.produto_id = pr.id
      ORDER BY m.created_at DESC LIMIT 10
    `);

    const movHojeResult = await pool.query(`
      SELECT tipo, COUNT(*) as total, SUM(quantidade) as qtd_total
      FROM movimentacoes WHERE DATE(created_at) = CURRENT_DATE GROUP BY tipo
    `);

    return jsonResponse(res, 200, {
      resumo: {
        total_pallets: totalPallets,
        posicoes_ocupadas: posicoesOcupadas,
        posicoes_livres: totalPosicoes - posicoesOcupadas,
        capacidade_maxima: capacidadeMaxima,
        total_posicoes: totalPosicoes,
        produtos_distintos: Object.keys(produtosMap).length,
        ocupacao_posicoes: Math.round((posicoesOcupadas / totalPosicoes) * 100),
        ocupacao_pallets: Math.round((totalPallets / capacidadeMaxima) * 100)
      },
      movimentacoes_hoje: movHojeResult.rows,
      por_produto: porProduto,
      por_fileira: Object.entries(porFileira).map(([fileira, total]) => ({ fileira: Number(fileira), total })),
      por_altura: Object.entries(porAltura).map(([altura, total]) => ({ altura: Number(altura), total })),
      criticas: criticas.slice(0, 20),
      atencao: atencao.slice(0, 20),
      ultimas_movimentacoes: movResult.rows
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return jsonResponse(res, 500, { error: 'Erro interno ao buscar dados do dashboard' });
  }
};

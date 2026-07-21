const { pool, config, setCors, handleOptions, jsonResponse, requireWrite, logAuditoria } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { erro: 'Metodo nao permitido' });
  }

  try {
    const user = requireWrite(req, res);
    if (!user) return;

    const { tipo, produto_id, fileira, altura, quantidade, observacao } = req.body || {};

    if (!tipo || !['entrada', 'saida'].includes(tipo)) {
      return jsonResponse(res, 400, { erro: "Tipo deve ser 'entrada' ou 'saida'" });
    }
    if (!produto_id || !Number.isInteger(produto_id) || produto_id <= 0) {
      return jsonResponse(res, 400, { erro: 'produto_id invalido' });
    }
    if (!fileira || !Number.isInteger(fileira) || fileira < 1 || fileira > config.MAX_FILEIRAS) {
      return jsonResponse(res, 400, { erro: `Fileira deve ser entre 1 e ${config.MAX_FILEIRAS}` });
    }
    if (!altura || !Number.isInteger(altura) || altura < 1 || altura > config.MAX_ALTURAS) {
      return jsonResponse(res, 400, { erro: `Altura deve ser entre 1 e ${config.MAX_ALTURAS}` });
    }
    if (!quantidade || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > config.MAX_PALLET_PER_POS) {
      return jsonResponse(res, 400, { erro: `Quantidade deve ser entre 1 e ${config.MAX_PALLET_PER_POS}` });
    }
    if (observacao && observacao.length > 500) {
      return jsonResponse(res, 400, { erro: 'Observacao excede 500 caracteres' });
    }

    const ip = req.headers?.['x-forwarded-for'] || '';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (tipo === 'entrada') {
        const allRows = await client.query(
          'SELECT id, quantidade FROM posicoes WHERE fileira = $1 AND altura = $2',
          [fileira, altura]
        );
        const totalCurrent = allRows.rows.reduce((sum, r) => sum + r.quantidade, 0);

        if (totalCurrent + quantidade > config.MAX_PALLET_PER_POS) {
          await client.query('ROLLBACK');
          return jsonResponse(res, 400, {
            erro: `Posicao ja contem ${totalCurrent} pallets. Nao e possivel adicionar ${quantidade} (max ${config.MAX_PALLET_PER_POS})`
          });
        }

        const existing = await client.query(
          'SELECT id, quantidade FROM posicoes WHERE fileira = $1 AND altura = $2 AND produto_id = $3',
          [fileira, altura, produto_id]
        );

        if (existing.rows.length > 0) {
          await client.query(
            'UPDATE posicoes SET quantidade = quantidade + $1 WHERE id = $2',
            [quantidade, existing.rows[0].id]
          );
        } else {
          await client.query(
            'INSERT INTO posicoes (fileira, altura, produto_id, quantidade) VALUES ($1, $2, $3, $4)',
            [fileira, altura, produto_id, quantidade]
          );
        }

      } else {
        const existing = await client.query(
          'SELECT id, quantidade FROM posicoes WHERE fileira = $1 AND altura = $2 AND produto_id = $3',
          [fileira, altura, produto_id]
        );

        if (existing.rows.length === 0) {
          await client.query('ROLLBACK');
          return jsonResponse(res, 404, { erro: 'Produto nao encontrado nesta posicao' });
        }

        const available = existing.rows[0].quantidade;
        if (quantidade > available) {
          await client.query('ROLLBACK');
          return jsonResponse(res, 400, {
            erro: `Quantidade indisponivel. Disponivel: ${available}, solicitado: ${quantidade}`
          });
        }

        const remaining = available - quantidade;
        if (remaining === 0) {
          await client.query('DELETE FROM posicoes WHERE id = $1', [existing.rows[0].id]);
        } else {
          await client.query(
            'UPDATE posicoes SET quantidade = $1 WHERE id = $2',
            [remaining, existing.rows[0].id]
          );
        }
      }

      await client.query(
        'INSERT INTO movimentacoes (tipo, produto_id, fileira, altura, quantidade, observacao, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [tipo, produto_id, fileira, altura, quantidade, observacao || '', user.id]
      );

      await client.query('COMMIT');

      await logAuditoria(user.id, `movimentacao_${tipo}`, `${tipo} - produto_id:${produto_id} fileira:${fileira} altura:${altura} qtd:${quantidade}`, ip);

      jsonResponse(res, 201, { mensagem: `${tipo} registrada com sucesso` });

    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

  } catch (e) {
    jsonResponse(res, 500, { erro: 'Erro interno' });
  }
};

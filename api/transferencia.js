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

    const { produto_id, fileira_origem, altura_origem, fileira_destino, altura_destino, quantidade, observacao } = req.body || {};

    if (!produto_id || !Number.isInteger(produto_id) || produto_id <= 0) {
      return jsonResponse(res, 400, { erro: 'produto_id invalido' });
    }
    if (!fileira_origem || !Number.isInteger(fileira_origem) || fileira_origem < 1 || fileira_origem > config.MAX_FILEIRAS) {
      return jsonResponse(res, 400, { erro: `fileira_origem deve ser entre 1 e ${config.MAX_FILEIRAS}` });
    }
    if (!altura_origem || !Number.isInteger(altura_origem) || altura_origem < 1 || altura_origem > config.MAX_ALTURAS) {
      return jsonResponse(res, 400, { erro: `altura_origem deve ser entre 1 e ${config.MAX_ALTURAS}` });
    }
    if (!fileira_destino || !Number.isInteger(fileira_destino) || fileira_destino < 1 || fileira_destino > config.MAX_FILEIRAS) {
      return jsonResponse(res, 400, { erro: `fileira_destino deve ser entre 1 e ${config.MAX_FILEIRAS}` });
    }
    if (!altura_destino || !Number.isInteger(altura_destino) || altura_destino < 1 || altura_destino > config.MAX_ALTURAS) {
      return jsonResponse(res, 400, { erro: `altura_destino deve ser entre 1 e ${config.MAX_ALTURAS}` });
    }
    if (!quantidade || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > config.MAX_PALLET_PER_POS) {
      return jsonResponse(res, 400, { erro: `Quantidade deve ser entre 1 e ${config.MAX_PALLET_PER_POS}` });
    }
    if (observacao && observacao.length > 500) {
      return jsonResponse(res, 400, { erro: 'Observacao excede 500 caracteres' });
    }

    if (fileira_origem === fileira_destino && altura_origem === altura_destino) {
      return jsonResponse(res, 400, { erro: 'Origem e destino devem ser diferentes' });
    }

    const ip = req.headers?.['x-forwarded-for'] || '';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const originRow = await client.query(
        'SELECT id, quantidade FROM posicoes WHERE fileira = $1 AND altura = $2 AND produto_id = $3',
        [fileira_origem, altura_origem, produto_id]
      );

      if (originRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return jsonResponse(res, 404, { erro: 'Produto nao encontrado na posicao de origem' });
      }

      if (quantidade > originRow.rows[0].quantidade) {
        await client.query('ROLLBACK');
        return jsonResponse(res, 400, {
          erro: `Quantidade indisponivel na origem. Disponivel: ${originRow.rows[0].quantidade}, solicitado: ${quantidade}`
        });
      }

      const destTotal = await client.query(
        'SELECT COALESCE(SUM(quantidade), 0) AS total FROM posicoes WHERE fileira = $1 AND altura = $2',
        [fileira_destino, altura_destino]
      );

      if (parseInt(destTotal.rows[0].total) + quantidade > config.MAX_PALLET_PER_POS) {
        await client.query('ROLLBACK');
        return jsonResponse(res, 400, {
          erro: `Destino ja contem ${destTotal.rows[0].total} pallets. Nao e possivel adicionar ${quantidade} (max ${config.MAX_PALLET_PER_POS})`
        });
      }

      const remainingOrigin = originRow.rows[0].quantidade - quantidade;
      if (remainingOrigin === 0) {
        await client.query('DELETE FROM posicoes WHERE id = $1', [originRow.rows[0].id]);
      } else {
        await client.query(
          'UPDATE posicoes SET quantidade = $1 WHERE id = $2',
          [remainingOrigin, originRow.rows[0].id]
        );
      }

      const existingDest = await client.query(
        'SELECT id FROM posicoes WHERE fileira = $1 AND altura = $2 AND produto_id = $3',
        [fileira_destino, altura_destino, produto_id]
      );

      if (existingDest.rows.length > 0) {
        await client.query(
          'UPDATE posicoes SET quantidade = quantidade + $1 WHERE id = $2',
          [quantidade, existingDest.rows[0].id]
        );
      } else {
        await client.query(
          'INSERT INTO posicoes (fileira, altura, produto_id, quantidade) VALUES ($1, $2, $3, $4)',
          [fileira_destino, altura_destino, produto_id, quantidade]
        );
      }

      await client.query(
        'INSERT INTO movimentacoes (tipo, produto_id, fileira, altura, quantidade, observacao, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['transferencia', produto_id, fileira_destino, altura_destino, quantidade,
         `Transferido de [${fileira_origem},${altura_origem}] para [${fileira_destino},${altura_destino}]${observacao ? ' - ' + observacao : ''}`,
         user.id]
      );

      await client.query('COMMIT');

      await logAuditoria(user.id, 'transferencia', `Produto ${produto_id}: [${fileira_origem},${altura_origem}] -> [${fileira_destino},${altura_destino}] qtd:${quantidade}`, ip);

      jsonResponse(res, 201, { mensagem: 'Transferencia realizada com sucesso' });

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

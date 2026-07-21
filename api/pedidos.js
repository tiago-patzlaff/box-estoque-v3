const https = require('https');
const { pool, config, setCors, handleOptions, jsonResponse, requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Método não permitido' });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const { mesAno, pedidoExp, po } = req.query;

  if (!config.PELLETS_API_URL) {
    return jsonResponse(res, 500, { error: 'API externa não configurada' });
  }

  if (!config.PELLETS_API_KEY) {
    return jsonResponse(res, 500, { error: 'Chave da API externa não configurada' });
  }

  const params = new URLSearchParams();
  if (mesAno) params.append('mesAno', mesAno);
  if (pedidoExp) params.append('pedidoExp', pedidoExp);
  if (po) params.append('po', po);

  const queryString = params.toString();
  const url = `${config.PELLETS_API_URL}${queryString ? '?' + queryString : ''}`;

  try {
    const pedidos = await fetchExternal(url, config.PELLETS_API_KEY);
    return jsonResponse(res, 200, { pedidos });
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error.message);
    return jsonResponse(res, 502, { error: 'Erro ao comunicar com API externa', detalhes: error.message });
  }
};

function fetchExternal(url, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'X-API-Key': apiKey },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`API retornou status ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const parsed = JSON.parse(data);
          const pedidos = (parsed.pedidos || parsed.data || parsed).map(p => ({
            numped: p.numped,
            produto: p.produto,
            bags: p.bags,
            datprv: p.datprv,
            usu_pedcli: p.usu_pedcli,
            usu_nconteiner: p.usu_nconteiner
          }));
          resolve(pedidos);
        } catch (e) {
          reject(new Error('Resposta da API não é JSON válido'));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao comunicar com API externa'));
    });
  });
}

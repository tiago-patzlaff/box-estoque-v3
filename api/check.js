const { setCors, handleOptions, jsonResponse, getUser } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (handleOptions(req, res)) return;

  const user = getUser(req);
  if (user) {
    jsonResponse(res, 200, { autenticado: true, usuario: user });
  } else {
    jsonResponse(res, 200, { autenticado: false });
  }
};

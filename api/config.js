module.exports = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || 'box-estoque-v3-secret-change-in-production',
  PELLETS_API_KEY: process.env.PELLETS_API_KEY || '',
  PELLETS_API_URL: process.env.PELLETS_API_URL || 'https://portalvendas.ipumirimws.com.br/exportacao/buscaPellets',
  MAX_PALLET_PER_POS: 15,
  MAX_FILEIRAS: 24,
  MAX_ALTURAS: 5,
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost,http://127.0.0.1').split(',')
};

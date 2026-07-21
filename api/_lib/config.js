module.exports = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret-change-me',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  PELLETS_API_KEY: process.env.PELLETS_API_KEY || '',
  PELLETS_API_URL: process.env.PELLETS_API_URL || '',
  SESSION_LIFETIME: parseInt(process.env.SESSION_LIFETIME || '28800', 10),
  MAX_FILEIRAS: parseInt(process.env.MAX_FILEIRAS || '24', 10),
  MAX_ALTURAS: parseInt(process.env.MAX_ALTURAS || '5', 10),
  MAX_PALLET_PER_POS: parseInt(process.env.MAX_PALLET_PER_POS || '15', 10)
};

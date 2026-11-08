import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = process.cwd();
const isProduction = process.env.NODE_ENV === 'production';

function getSecret(name) {
  const value = process.env[name];

  if (isProduction && (!value || value.length < 32)) {
    throw new Error(`${name} must be at least 32 characters in production.`);
  }

  return value || crypto.randomBytes(32).toString('hex');
}

function getNumber(name, fallback, min, max) {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid configuration value: ${name}`);
  }

  return value;
}

const storageDir = path.resolve(
  rootDir,
  process.env.STORAGE_DIR || 'storage'
);

const databasePath = path.resolve(
  rootDir,
  process.env.DB_PATH || path.join(storageDir, 'database', 'forexweaver.sqlite')
);

const appUrl = process.env.APP_URL || 'http://localhost:3000';

if (isProduction) {
  let parsedUrl;

  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error('APP_URL must be a valid URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Production APP_URL must use HTTPS.');
  }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || appUrl)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',

  port: getNumber('PORT', 3000, 1, 65535),

  host: process.env.HOST || '0.0.0.0',

  appUrl,

  allowedOrigins,

  jwtSecret: getSecret('JWT_SECRET'),

  sessionSecret: getSecret('SESSION_SECRET'),

  owner: {
    name: process.env.MASTER_OWNER_NAME || 'DIFFERCE FXP',
    email: process.env.MASTER_OWNER_EMAIL || '',
    password: process.env.MASTER_OWNER_PASSWORD || '',
    phone: process.env.MASTER_OWNER_PHONE || '256700000000'
  },

  paths: {
    root: rootDir,
    storage: storageDir,
    sessions: path.join(storageDir, 'sessions'),
    database: databasePath,
    media: path.join(storageDir, 'media'),
    temp: path.join(storageDir, 'temp'),
    backups: path.join(storageDir, 'backups'),
    logs: path.join(storageDir, 'logs')
  },

  whatsapp: {
    defaultPrefix: '.',

    brandAbout:
      'FOREXWEAVER BOT 📊 Advanced WhatsApp Automation System. Forex Trading Motivation. Powered by DIFFERCE FXP.',

    defaultOfflineReply:
      "Hello Am forexweaver-bot. The bot admin isn't available right now. How can I help you?",

    connectTimeoutMs: 60000,

    keepAliveIntervalMs: 25000
  },

  limits: {
    maxUploadSizeMb: getNumber('MAX_UPLOAD_SIZE_MB', 50, 1, 500),

    tempFileTtlMinutes: getNumber(
      'MEDIA_TEMP_LIFETIME_MINUTES',
      60,
      1,
      10080
    ),

    maxAccountsPerUserDefault: getNumber(
      'MAX_ACCOUNTS_PER_USER_DEFAULT',
      9999,
      1,
      100000
    )
  },

  apis: {
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY || null,
    finnhub: process.env.FINNHUB_API_KEY || null,
    openai: process.env.OPENAI_API_KEY || null
  }
};

// Create only the required storage directories.
const requiredDirectories = [
  config.paths.storage,
  config.paths.sessions,
  path.dirname(config.paths.database),
  config.paths.media,
  config.paths.temp,
  config.paths.backups,
  config.paths.logs
];

for (const directory of requiredDirectories) {
  fs.mkdirSync(directory, { recursive: true });
}

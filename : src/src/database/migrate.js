import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { getDatabase, closeDatabase } from './db.js';
import { config } from '../config.js';

export function runMigrations() {
  const db = getDatabase();

  const migrate = db.transaction(() => {

    // 1. Users and permissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('owner', 'user')) DEFAULT 'user',
        status TEXT CHECK(status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
        max_accounts INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. WhatsApp accounts
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        phone_number TEXT,
        name TEXT NOT NULL,
        prefix TEXT DEFAULT '.',
        mode TEXT CHECK(mode IN (
          'public', 'private', 'self',
          'group-only', 'private-only', 'maintenance'
        )) DEFAULT 'public',
        status TEXT CHECK(status IN (
          'disconnected', 'pairing', 'connecting',
          'connected', 'paused', 'error'
        )) DEFAULT 'disconnected',
        is_approved INTEGER DEFAULT 0,
        auto_reply_enabled INTEGER DEFAULT 1,
        offline_reply_text TEXT,
        settings_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 3. Group moderation settings
      CREATE TABLE IF NOT EXISTS group_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        group_jid TEXT NOT NULL,
        group_name TEXT,
        welcome_enabled INTEGER DEFAULT 1,
        welcome_message TEXT,
        goodbye_enabled INTEGER DEFAULT 1,
        goodbye_message TEXT,
        anti_link INTEGER DEFAULT 0,
        anti_spam INTEGER DEFAULT 0,
        anti_flood INTEGER DEFAULT 0,
        anti_badword INTEGER DEFAULT 0,
        badwords_list TEXT DEFAULT '',
        country_filter_enabled INTEGER DEFAULT 0,
        allowed_country_codes TEXT DEFAULT '',
        inactivity_policy_enabled INTEGER DEFAULT 0,
        warning_days INTEGER DEFAULT 25,
        removal_days INTEGER DEFAULT 30,
        UNIQUE(account_id, group_jid)
      );

      -- 4. Group member activity
      CREATE TABLE IF NOT EXISTS group_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        group_jid TEXT NOT NULL,
        user_jid TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        warning_sent_at DATETIME,
        UNIQUE(account_id, group_jid, user_jid)
      );

      -- 5. Forex trading journal
      CREATE TABLE IF NOT EXISTS trading_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_jid TEXT NOT NULL,
        pair TEXT NOT NULL,
        type TEXT CHECK(type IN ('BUY', 'SELL')) NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        lot_size REAL NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        pnl REAL,
        status TEXT CHECK(status IN (
          'OPEN', 'CLOSED', 'CANCELLED'
        )) DEFAULT 'OPEN',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME
      );

      -- 6. Audit logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        account_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 7. Performance indexes
      CREATE INDEX IF NOT EXISTS idx_accounts_user
        ON accounts(user_id);

      CREATE INDEX IF NOT EXISTS idx_group_activity_lookup
        ON group_activity(account_id, group_jid, user_jid);

      CREATE INDEX IF NOT EXISTS idx_activity_time
        ON group_activity(last_active_at);

      CREATE INDEX IF NOT EXISTS idx_journal_user
        ON trading_journal(account_id, user_jid);
    `);

    // 8. Initialize Master Owner safely
    const existingOwner = db.prepare(`
      SELECT id FROM users
      WHERE role = ?
      LIMIT 1
    `).get('owner');

    if (!existingOwner) {
      const { name, email, password } = config.owner;

      // Never create an owner with empty credentials.
      if (!email || !password) {
        if (config.env === 'production') {
          throw new Error(
            'Master Owner credentials are required in production.'
          );
        }

        console.warn(
          '[BOOTSTRAP] Master Owner not created. Configure owner credentials in .env.'
        );
      } else {
        if (password.length < 12) {
          throw new Error(
            'Master Owner password must contain at least 12 characters.'
          );
        }

        const passwordHash = bcrypt.hashSync(password, 12);

        db.prepare(`
          INSERT INTO users (
            name,
            email,
            password_hash,
            role,
            status,
            max_accounts
          )
          VALUES (?, ?, ?, 'owner', 'active', ?)
        `).run(
          name,
          email.toLowerCase().trim(),
          passwordHash,
          config.limits.maxAccountsPerUserDefault
        );

        console.log(
          `[BOOTSTRAP] Master Owner initialized: ${email}`
        );
      }
    }
  });

  migrate();

  console.log('[DATABASE] Migrations completed successfully.');

  return db;
}

// Allow direct execution using npm run migrate.
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    runMigrations();
  } catch (error) {
    console.error('[DATABASE MIGRATION ERROR]', error);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

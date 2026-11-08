import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dbInstance = null;

export function getDatabase() {
  if (dbInstance && dbInstance.open) {
    return dbInstance;
  }

  const databasePath = config.paths.database;

  if (typeof databasePath !== 'string' || !databasePath) {
    throw new Error('Invalid database path configuration.');
  }

  // Ensure database directory exists.
  fs.mkdirSync(path.dirname(databasePath), {
    recursive: true
  });

  try {
    dbInstance = new Database(databasePath, {
      timeout: 5000
    });

    // Database security and performance settings.
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('busy_timeout = 5000');

    return dbInstance;

  } catch (error) {
    if (dbInstance?.open) {
      dbInstance.close();
    }

    dbInstance = null;

    throw new Error(
      `FOREXWEAVER database initialization failed: ${error.message}`,
      { cause: error }
    );
  }
}

export function closeDatabase() {
  if (dbInstance?.open) {
    dbInstance.close();
  }

  dbInstance = null;
}

export default getDatabase;

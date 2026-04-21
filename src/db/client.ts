import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

let expo: SQLiteDatabase | null = null;
let _db: ExpoSQLiteDatabase<typeof schema> | null = null;

/**
 * Initialize the database for a specific user.
 * Must be called after login before any DB operations.
 */
export function initDb(userId: string) {
  if (_db) return; // already initialized

  const safeName = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  expo = openDatabaseSync(`circle_${safeName}.db`);
  expo.execSync('PRAGMA journal_mode = WAL;');

  _db = drizzle(expo, { schema });

  // Create tables if they don't exist
  expo.execSync(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      public_id TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      key TEXT DEFAULT '',
      public_key TEXT DEFAULT '',
      pub_key_version TEXT DEFAULT '',
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pub_chat_id TEXT DEFAULT '',
      type TEXT DEFAULT 'single',
      chat_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      UNIQUE(chat_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL DEFAULT 0,
      text TEXT DEFAULT '',
      msg_type TEXT DEFAULT 'text',
      status TEXT DEFAULT 'pending',
      pub_msg_id TEXT DEFAULT '',
      pub_chat_id TEXT DEFAULT '',
      offset TEXT DEFAULT '',
      media_urls TEXT DEFAULT '',
      is_downloaded INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  console.log(`[DB] Initialized database for user: ${safeName}`);
}

/**
 * Get the drizzle DB instance. Throws if initDb() hasn't been called.
 */
export function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDb(userId) first.');
  return _db;
}

/**
 * Close and reset the DB (e.g. on logout).
 */
export function closeDb() {
  if (expo) {
    expo.closeSync();
    expo = null;
  }
  _db = null;
}

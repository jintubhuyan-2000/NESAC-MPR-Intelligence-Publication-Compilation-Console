import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { AppSettings } from '../src/types/mpr.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'nesac_mpr.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL DEFAULT '',
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      source_mode TEXT NOT NULL DEFAULT 'server_upload',
      status TEXT NOT NULL DEFAULT 'pending',
      total_paragraphs INTEGER NOT NULL DEFAULT 0,
      section_iv_found INTEGER NOT NULL DEFAULT 0,
      section_v_found INTEGER NOT NULL DEFAULT 0,
      textbox_count INTEGER NOT NULL DEFAULT 0,
      table_count INTEGER NOT NULL DEFAULT 0,
      header_footer_count INTEGER NOT NULL DEFAULT 0,
      diagnostics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS extracted_paragraphs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      paragraph_number INTEGER NOT NULL,
      container_type TEXT NOT NULL,
      xml_source TEXT NOT NULL,
      section_detected TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      is_heading INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      paragraph_id INTEGER,
      original_text TEXT NOT NULL,
      source_section TEXT NOT NULL,
      category TEXT NOT NULL,
      ai_category TEXT NOT NULL,
      ai_confidence REAL NOT NULL DEFAULT 0.0,
      ai_reasoning TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      authors TEXT NOT NULL DEFAULT '',
      journal_name TEXT NOT NULL DEFAULT '',
      book_title TEXT NOT NULL DEFAULT '',
      conference_name TEXT NOT NULL DEFAULT '',
      publication_year TEXT NOT NULL DEFAULT '',
      doi TEXT NOT NULL DEFAULT '',
      isbn TEXT NOT NULL DEFAULT '',
      issn TEXT NOT NULL DEFAULT '',
      volume TEXT NOT NULL DEFAULT '',
      issue TEXT NOT NULL DEFAULT '',
      page_numbers TEXT NOT NULL DEFAULT '',
      presentation_type TEXT NOT NULL DEFAULT '',
      event_location TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL DEFAULT '',
      publication_type TEXT NOT NULL DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'pending',
      duplicate_status TEXT NOT NULL DEFAULT 'unique',
      master_record_id INTEGER,
      duplicate_group_id TEXT,
      duplicate_score REAL NOT NULL DEFAULT 0.0,
      duplicate_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (paragraph_id) REFERENCES extracted_paragraphs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      normalized_name TEXT NOT NULL,
      division TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS record_authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      author_order INTEGER NOT NULL DEFAULT 0,
      original_spelling TEXT NOT NULL,
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      field_changed TEXT NOT NULL DEFAULT '',
      old_value TEXT NOT NULL DEFAULT '',
      new_value TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'Reviewer',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const defaultSettings: Record<string, string> = {
    default_windows_folder: 'W:\\REKHA\\17-11-2026\\MPR',
    local_agent_url: 'http://127.0.0.1:8765',
    local_only_mode: 'false',
    require_transmission_consent: 'true',
    institution_name: 'North Eastern Space Applications Centre (NESAC)',
    report_title: 'Consolidated Monthly Progress Report — Publications & Conferences',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }
}

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    default_windows_folder:
      map.get('default_windows_folder') ?? 'W:\\REKHA\\17-11-2026\\MPR',
    local_agent_url: map.get('local_agent_url') ?? 'http://127.0.0.1:8765',
    local_only_mode: map.get('local_only_mode') === 'true',
    require_transmission_consent:
      (map.get('require_transmission_consent') ?? 'true') === 'true',
    institution_name:
      map.get('institution_name') ??
      'North Eastern Space Applications Centre (NESAC)',
    report_title:
      map.get('report_title') ??
      'Consolidated Monthly Progress Report — Publications & Conferences',
  };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries: Array<[string, string]>) => {
    for (const [k, v] of entries) {
      upsert.run(k, v);
    }
  });
  const entries: Array<[string, string]> = [];
  if (partial.default_windows_folder !== undefined) {
    entries.push(['default_windows_folder', partial.default_windows_folder]);
  }
  if (partial.local_agent_url !== undefined) {
    entries.push(['local_agent_url', partial.local_agent_url]);
  }
  if (partial.local_only_mode !== undefined) {
    entries.push(['local_only_mode', String(partial.local_only_mode)]);
  }
  if (partial.require_transmission_consent !== undefined) {
    entries.push([
      'require_transmission_consent',
      String(partial.require_transmission_consent),
    ]);
  }
  if (partial.institution_name !== undefined) {
    entries.push(['institution_name', partial.institution_name]);
  }
  if (partial.report_title !== undefined) {
    entries.push(['report_title', partial.report_title]);
  }
  tx(entries);
  return getSettings();
}

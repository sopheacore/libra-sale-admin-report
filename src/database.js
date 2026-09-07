import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import dayjs from 'dayjs';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/sales_reports.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      telegram_user_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      sale_rep_code TEXT NOT NULL,
      service_category TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      client_name TEXT,
      notes TEXT,
      telegram_message_id TEXT,
      reported_by TEXT,
      raw_text TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_saler ON daily_reports(sale_rep_code);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_category ON daily_reports(service_category);
    CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON daily_reports(status);

    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      total_new_start REAL DEFAULT 0,
      total_extra REAL DEFAULT 0,
      total_reduction REAL DEFAULT 0,
      total_terminate REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      total_entries INTEGER DEFAULT 0,
      summary_payload TEXT,
      sent_to_telegram INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Seed default sales reps if none exist or synchronize
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM sales_reps').get().count;
  const defaultReps = [
    { code: 'Mr. Chun Sros', name: 'Mr. Chun Sros' },
    { code: 'Mr. Heng Chin', name: 'Mr. Heng Chin' },
    { code: 'Mr. Heng Long', name: 'Mr. Heng Long' },
    { code: 'Mr. Bou Dalin', name: 'Mr. Bou Dalin' }
  ];

  const insertOrUpdateRep = db.prepare(`
    INSERT INTO sales_reps (code, name, active) VALUES (?, ?, 1)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, active = 1
  `);

  for (const rep of defaultReps) {
    insertOrUpdateRep.run(rep.code, rep.name);
  }
}

// Insert single daily report record
export function insertReport(entry) {
  const stmt = db.prepare(`
    INSERT INTO daily_reports (
      report_date, sale_rep_code, service_category, status,
      amount, client_name, notes, telegram_message_id, reported_by, raw_text
    ) VALUES (
      @report_date, @sale_rep_code, @service_category, @status,
      @amount, @client_name, @notes, @telegram_message_id, @reported_by, @raw_text
    )
  `);

  const info = stmt.run({
    report_date: entry.report_date || dayjs().format('YYYY-MM-DD'),
    sale_rep_code: entry.sale_rep_code,
    service_category: entry.service_category,
    status: entry.status,
    amount: entry.amount,
    client_name: entry.client_name || null,
    notes: entry.notes || null,
    telegram_message_id: entry.telegram_message_id ? String(entry.telegram_message_id) : null,
    reported_by: entry.reported_by || null,
    raw_text: entry.raw_text || null
  });

  return info.lastInsertRowid;
}

// Batch insert multiple reports
export function insertBatchReports(entries) {
  const insertMany = db.transaction((items) => {
    const insertedIds = [];
    for (const item of items) {
      const id = insertReport(item);
      insertedIds.push(id);
    }
    return insertedIds;
  });
  return insertMany(entries);
}

// Get reports for a specific date
export function getReportsByDate(dateStr) {
  return db.prepare(`
    SELECT * FROM daily_reports 
    WHERE report_date = ? 
    ORDER BY id ASC
  `).all(dateStr);
}

// Get reports for a date range (inclusive)
export function getReportsByDateRange(startDateStr, endDateStr) {
  return db.prepare(`
    SELECT * FROM daily_reports 
    WHERE report_date >= ? AND report_date <= ? 
    ORDER BY report_date ASC, id ASC
  `).all(startDateStr, endDateStr);
}

// Get all active sales reps
export function getActiveSalesReps() {
  return db.prepare(`SELECT * FROM sales_reps WHERE active = 1 ORDER BY code ASC`).all();
}

// Add or update sales rep
export function upsertSalesRep(code, name, telegramUserId = null) {
  const stmt = db.prepare(`
    INSERT INTO sales_reps (code, name, telegram_user_id, active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      telegram_user_id = COALESCE(excluded.telegram_user_id, sales_reps.telegram_user_id),
      active = 1
  `);
  return stmt.run(code, name, telegramUserId);
}

// Delete a report by ID
export function deleteReportById(id) {
  const stmt = db.prepare(`DELETE FROM daily_reports WHERE id = ?`);
  const res = stmt.run(id);
  return res.changes > 0;
}

// Get report by ID
export function getReportById(id) {
  return db.prepare(`SELECT * FROM daily_reports WHERE id = ?`).get(id);
}

// Save weekly summary log
export function recordWeeklySummary(summary) {
  const stmt = db.prepare(`
    INSERT INTO weekly_summaries (
      week_start, week_end, total_new_start, total_extra,
      total_reduction, total_terminate, net_amount, total_entries,
      summary_payload, sent_to_telegram
    ) VALUES (
      @week_start, @week_end, @total_new_start, @total_extra,
      @total_reduction, @total_terminate, @net_amount, @total_entries,
      @summary_payload, @sent_to_telegram
    )
  `);

  return stmt.run(summary).lastInsertRowid;
}

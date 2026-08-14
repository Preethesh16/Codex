/**
 * feedbackService.ts
 * ------------------------------------------------------------------
 * Bridges a local CSV export (for example Google Forms → Sheets → CSV) with
 * the app's feedback queue without parsing binary documents.
 *
 * Flow:
 *   Google Form  →  Google Sheet  →  Download CSV  →  feedback.csv
 *        ↓ import()
 *   SQLite `feedback` table  →  Fix Center UI  →  autonomous fix  →  approve
 *        ↓ syncToCsv()
 *   feedback.csv status column updated
 *
 * The path is configured via FEEDBACK_CSV_PATH (default ./feedback.csv).
 */
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';

const CSV_PATH = path.isAbsolute(process.env.FEEDBACK_CSV_PATH || '')
  ? (process.env.FEEDBACK_CSV_PATH as string)
  : path.join(process.cwd(), process.env.FEEDBACK_CSV_PATH || 'feedback.csv');

function parseCsv(input: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted && char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.length)) records.push(row);
      row = [];
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); records.push(row); }
  const headers = records.shift()?.map((header) => header.replace(/^\uFEFF/, '').trim()) || [];
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(rows: Record<string, unknown>[]): void {
  const headers = rows.length ? Object.keys(rows[0]) : ['ID', 'Message', 'Status'];
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))];
  fs.writeFileSync(CSV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

// ─── Scoring ────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
const URGENCY_WEIGHT: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

function normPriority(v: any): 'high' | 'medium' | 'low' {
  const s = String(v || '').trim().toLowerCase();
  if (['high', 'p0', 'p1', 'urgent', 'critical'].includes(s)) return 'high';
  if (['low', 'p3', 'p4', 'minor', 'nice to have', 'nice-to-have'].includes(s)) return 'low';
  return 'medium';
}

function normUrgency(v: any): 'critical' | 'high' | 'normal' | 'low' {
  const s = String(v || '').trim().toLowerCase();
  if (['critical', 'blocker', 'down', 'outage', 'sev1'].includes(s)) return 'critical';
  if (['high', 'urgent', 'asap'].includes(s)) return 'high';
  if (['low', 'whenever', 'someday'].includes(s)) return 'low';
  return 'normal';
}

function normCategory(v: any): string {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('error') || s.includes('crash') || s.includes('exception')) return 'error';
  if (s.includes('bug') || s.includes('broken') || s.includes('defect')) return 'bug';
  if (s.includes('feature') || s.includes('request') || s.includes('enhanc')) return 'feature';
  if (s.includes('ux') || s.includes('ui') || s.includes('design')) return 'ux';
  if (s.includes('perf') || s.includes('slow') || s.includes('speed')) return 'performance';
  return 'bug';
}

export function computeScore(priority: string, urgency: string): number {
  return (PRIORITY_WEIGHT[priority] || 2) * 10 + (URGENCY_WEIGHT[urgency] || 2);
}

// ─── CSV column mapping (tolerant of Google Form header naming) ──────────────

function pick(row: Record<string, any>, keys: string[]): string {
  const lowerMap: Record<string, any> = {};
  for (const k of Object.keys(row)) lowerMap[k.trim().toLowerCase()] = row[k];
  for (const key of keys) {
    const v = lowerMap[key.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface ImportResult {
  imported: number;
  updated: number;
  total: number;
}

/**
 * Read the CSV export and upsert rows into the feedback table.
 * Dedupe key = external_id (Google Forms "Timestamp" + email, or an explicit ID column).
 */
export function importFromCsv(): ImportResult {
  ensureFeedbackCsvExists();

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

  let imported = 0;
  let updated = 0;

  const upsert = db.transaction((records: Record<string, any>[]) => {
    for (const row of records) {
      const message = pick(row, ['message', 'feedback', 'description', 'issue', 'what went wrong', 'details', 'comment']);
      if (!message) continue;

      const externalId =
        pick(row, ['id', 'external_id', 'response id']) ||
        `${pick(row, ['timestamp', 'date', 'submitted at'])}|${pick(row, ['email', 'email address'])}|${message.slice(0, 40)}`;

      const priority = normPriority(pick(row, ['priority', 'severity']));
      const urgency = normUrgency(pick(row, ['urgency', 'severity', 'impact']));
      const category = normCategory(pick(row, ['category', 'type', 'kind']) || message);
      const userName = pick(row, ['name', 'user', 'full name', 'submitted by']);
      const email = pick(row, ['email', 'email address']);
      const projectPath = pick(row, ['project', 'project_path', 'project path', 'url', 'site']);
      const createdAt = pick(row, ['timestamp', 'date', 'submitted at', 'created_at']) || new Date().toISOString();
      const score = computeScore(priority, urgency);

      const existing = db.prepare('SELECT id, status FROM feedback WHERE external_id = ?').get(externalId) as any;
      if (existing) {
        // Only refresh classification fields; never clobber an in-progress/approved status.
        db.prepare(`
          UPDATE feedback SET
            user_name=?, email=?, project_path=?, category=?, message=?,
            priority=?, urgency=?, score=?
          WHERE id=?
        `).run(userName, email, projectPath, category, message, priority, urgency, score, existing.id);
        updated++;
      } else {
        db.prepare(`
          INSERT INTO feedback
            (external_id, source, user_name, email, project_path, category, message,
             priority, urgency, score, status, created_at)
          VALUES (?, 'csv', ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
        `).run(externalId, userName, email, projectPath, category, message,
          priority, urgency, score, createdAt);
        imported++;
      }
    }
  });

  upsert(rows);

  const total = (db.prepare('SELECT COUNT(*) c FROM feedback').get() as any).c;
  return { imported, updated, total };
}

/**
 * Write current statuses back to the CSV export. The function name is retained
 * temporarily for route compatibility.
 */
export function syncToCsv(): { rows: number; path: string } {
  const items = db.prepare('SELECT * FROM feedback ORDER BY score DESC, datetime(created_at) DESC').all() as any[];

  const data = items.map((f) => ({
    ID: f.external_id,
    Name: f.user_name,
    Email: f.email,
    Project: f.project_path,
    Category: f.category,
    Message: f.message,
    Priority: f.priority,
    Urgency: f.urgency,
    Score: f.score,
    Status: f.status,
    'Files Changed': safeJoin(f.files_changed),
    'Fix Summary': f.fix_summary || '',
    'Fixed At': f.fixed_at || '',
    'Approved At': f.approved_at || '',
    'Created At': f.created_at || ''
  }));

  writeCsv(data);
  return { rows: data.length, path: CSV_PATH };
}

function safeJoin(json: string): string {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.join(', ') : '';
  } catch {
    return '';
  }
}

/**
 * Seed a realistic sample CSV if none exists yet, so the Fix Center
 * has data on first launch even before a Google Form is connected.
 */
export function ensureFeedbackCsvExists(): void {
  if (fs.existsSync(CSV_PATH)) return;

  const sample = [
    { Timestamp: new Date(Date.now() - 3600e3).toISOString(), Name: 'Ava Chen', Email: 'ava@acme.io', Project: '', Category: 'error', Message: 'Checkout page throws a white screen — nothing renders after clicking Pay.', Priority: 'high', Urgency: 'critical' },
    { Timestamp: new Date(Date.now() - 7200e3).toISOString(), Name: 'Marcus Reid', Email: 'marcus@shoply.com', Project: '', Category: 'bug', Message: 'The mobile navbar overlaps the hero text and buttons are unclickable on iPhone.', Priority: 'high', Urgency: 'high' },
    { Timestamp: new Date(Date.now() - 10800e3).toISOString(), Name: 'Priya Nair', Email: 'priya@fintrack.app', Project: '', Category: 'performance', Message: 'Dashboard takes 8+ seconds to load charts; feels sluggish.', Priority: 'medium', Urgency: 'high' },
    { Timestamp: new Date(Date.now() - 14400e3).toISOString(), Name: 'Diego Santos', Email: 'diego@marketly.co', Project: '', Category: 'feature', Message: 'Please add a dark mode toggle in the top navigation.', Priority: 'medium', Urgency: 'normal' },
    { Timestamp: new Date(Date.now() - 18000e3).toISOString(), Name: 'Lena Ford', Email: 'lena@bloomkit.io', Project: '', Category: 'ux', Message: 'The pricing cards need clearer contrast — the text is hard to read on the gradient.', Priority: 'low', Urgency: 'normal' },
    { Timestamp: new Date(Date.now() - 21600e3).toISOString(), Name: 'Omar Haddad', Email: 'omar@quicksell.io', Project: '', Category: 'feature', Message: 'Add a testimonials section with a carousel to the landing page.', Priority: 'low', Urgency: 'low' }
  ];

  writeCsv(sample);
  console.log(`📗 Seeded sample feedback CSV at ${CSV_PATH}`);
}

export function getFeedbackCsvPath(): string {
  return CSV_PATH;
}

// ─── DB → client shape ───────────────────────────────────────────────────────

export function mapFeedbackRow(f: any) {
  return {
    id: f.id,
    externalId: f.external_id,
    source: f.source,
    userName: f.user_name,
    email: f.email,
    projectPath: f.project_path,
    category: f.category,
    message: f.message,
    priority: f.priority,
    urgency: f.urgency,
    score: f.score,
    status: f.status,
    buildId: f.build_id,
    filesChanged: parseArr(f.files_changed),
    fixSummary: f.fix_summary,
    createdAt: f.created_at,
    fixedAt: f.fixed_at,
    approvedAt: f.approved_at
  };
}

function parseArr(json: string): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

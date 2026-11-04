import { randomBytes } from 'node:crypto';
import type { Database, Role, StaffUser } from './types';
import { upsertStaff } from './operations';

/**
 * Staff list import.
 *
 * The owner sends a spreadsheet of receptionists and cleaners; this turns each row
 * into an account with its own server-generated password. Passwords appear once, in
 * the response and in a downloadable CSV — they are hashed before storage and never
 * shown again, so whoever imports must hand them over. Nothing is emailed: the
 * product has no mail provider connected, and pretending otherwise would leave
 * people locked out.
 *
 * Column headers, case-insensitive, extra columns ignored:
 *   name (required)  ·  username or email (required — unique login handle)
 *   role: receptionist | cleaner | admin  (defaults to receptionist)
 *   phone, jobTitle, shift: morning | afternoon | evening, password (optional)
 */

export interface StaffImportRow {
  index: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  jobTitle: string;
  shift: 'morning' | 'afternoon' | 'evening' | null;
  password: string | null;
  problems: string[];
}

const ROLES: Role[] = ['receptionist', 'cleaner', 'admin'];
const SHIFTS = ['morning', 'afternoon', 'evening'] as const;

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function parseStaffCsv(text: string): { rows: StaffImportRow[]; error: string | null } {
  const table = splitCsv(text);
  if (table.length < 2) {
    return { rows: [], error: 'The file has no data rows. It needs a header row and at least one person.' };
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const nameCol = col('name', 'full name', 'fullname');
  const userCol = col('username', 'email', 'login', 'handle');
  const roleCol = col('role', 'position');
  const phoneCol = col('phone', 'phone number', 'mobile');
  const titleCol = col('jobtitle', 'job title', 'title');
  const shiftCol = col('shift');
  const pwCol = col('password', 'temporary password');

  if (nameCol === -1 || userCol === -1) {
    return {
      rows: [],
      error: 'The header row needs a name column and a username (or email) column.',
    };
  }

  const rows: StaffImportRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (c: number) => (c >= 0 ? (cells[c] ?? '').trim() : '');
    const problems: string[] = [];
    const name = get(nameCol);
    const usernameRaw = get(userCol).toLowerCase();
    const isEmail = usernameRaw.includes('@');
    const username = isEmail ? usernameRaw.split('@')[0] : usernameRaw;

    if (!name) problems.push('No name on this row.');
    if (!username) problems.push('No username or email, so there is no way to sign in.');
    if (username && !/^[a-z0-9._-]{2,32}$/.test(username)) {
      problems.push('The username should be 2–32 characters: letters, numbers, dot, dash or underscore.');
    }
    const roleRaw = (get(roleCol) || 'receptionist').toLowerCase() as Role;
    const role: Role = ROLES.includes(roleRaw) ? roleRaw : 'receptionist';
    if (get(roleCol) && !ROLES.includes(roleRaw)) {
      problems.push(`Role “${get(roleCol)}” is not one of receptionist, cleaner or admin — defaulting to receptionist.`);
    }
    const shiftRaw = get(shiftCol).toLowerCase();
    const shift = SHIFTS.includes(shiftRaw as (typeof SHIFTS)[number])
      ? (shiftRaw as 'morning' | 'afternoon' | 'evening')
      : null;
    const password = get(pwCol) || null;
    if (password && password.length < 6) problems.push('A supplied password must be at least six characters.');

    rows.push({
      index: i + 1,
      name,
      username,
      email: isEmail ? usernameRaw : '',
      phone: get(phoneCol),
      role,
      jobTitle: get(titleCol) || (role === 'cleaner' ? 'Housekeeping Attendant' : role === 'admin' ? 'Administrator' : 'Receptionist'),
      shift,
      password,
      problems,
    });
  });

  return { rows, error: null };
}

export function temporaryPassword(): string {
  // Readable but not guessable: three groups, no ambiguous characters.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join('');
  return `${group()}-${group()}-${group()}`;
}

export interface StaffImportResult {
  created: { name: string; username: string; role: Role; password: string; staffId: string }[];
  skipped: { index: number; name: string; reason: string }[];
  existing: { username: string; role: Role }[];
}

export function importStaff(
  db: Database,
  actorId: string,
  rows: StaffImportRow[],
): StaffImportResult {
  const created: StaffImportResult['created'] = [];
  const skipped: StaffImportResult['skipped'] = [];
  const existing: StaffImportResult['existing'] = [];
  const taken = new Set(db.staff.map((s) => s.username.toLowerCase()));

  for (const row of rows) {
    if (!row.name || !row.username) {
      skipped.push({ index: row.index, name: row.name || `Row ${row.index}`, reason: 'Missing name or username.' });
      continue;
    }
    if (taken.has(row.username)) {
      existing.push({ username: row.username, role: (db.staff.find((s) => s.username.toLowerCase() === row.username)?.role ?? row.role) as Role });
      continue;
    }
    if (row.password && row.password.length < 6) {
      skipped.push({ index: row.index, name: row.name, reason: 'Password too short — leave it blank to generate one.' });
      continue;
    }
    const password = row.password ?? temporaryPassword();
    try {
      const staff: StaffUser = upsertStaff(db, actorId, {
        name: row.name,
        username: row.username,
        email: row.email,
        phone: row.phone,
        role: row.role,
        jobTitle: row.jobTitle,
        shift: row.shift,
        password,
      });
      taken.add(row.username);
      created.push({ name: staff.name, username: staff.username, role: staff.role, password, staffId: staff.id });
    } catch (err) {
      skipped.push({
        index: row.index,
        name: row.name,
        reason: err instanceof Error ? err.message : 'Could not create this account.',
      });
    }
  }

  return { created, skipped, existing };
}

export function staffImportCsv(result: StaffImportResult): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Name', 'Username', 'Role', 'Job title', 'Temporary password'];
  const rows = result.created.map((c) => [c.name, c.username, c.role, '', c.password]);
  return [header, ...rows]
    .map((r) => r.map((c) => escape(String(c))).join(','))
    .join('\r\n');
}

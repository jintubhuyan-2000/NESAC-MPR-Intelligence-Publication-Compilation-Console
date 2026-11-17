import { db } from './db.ts';
import type { AuthorProfile } from '../src/types/mpr.ts';

export function splitAuthorsPreserveSpelling(authorsRaw: string): string[] {
  if (!authorsRaw || !authorsRaw.trim()) return [];

  // Split by semicolon, " and ", " & ", or commas that separate full author tokens
  // Preserve "Last, F. M." style if formatted carefully vs "A. B. Sharma, R. K. Das"
  const normalizedSeparators = authorsRaw
    .replace(/\s+and\s+/gi, '; ')
    .replace(/\s*&\s*/g, '; ');

  // If semicolons exist, split on semicolons first
  if (normalizedSeparators.includes(';')) {
    return normalizedSeparators
      .split(';')
      .map((s) => s.trim().replace(/[.,]+$/, (m) => (m === '.' ? '.' : '')))
      .filter((s) => s.length > 1);
  }

  // Otherwise split on comma, unless it looks like a single "Surname, Initials"
  const commaParts = normalizedSeparators.split(',').map((s) => s.trim()).filter(Boolean);
  if (commaParts.length === 2 && /^[A-Z]\.(\s*[A-Z]\.)?$/.test(commaParts[1])) {
    return [`${commaParts[0]}, ${commaParts[1]}`];
  }

  // Recombine "Surname, F.M." pairs if every odd element is initials
  const combined: string[] = [];
  for (let i = 0; i < commaParts.length; i++) {
    const cur = commaParts[i];
    const next = commaParts[i + 1];
    if (next && /^(?:[A-Z]\.\s*){1,3}$/.test(next)) {
      combined.push(`${cur}, ${next}`);
      i++;
    } else {
      combined.push(cur);
    }
  }

  return combined.filter((s) => s.length > 1);
}

export function normalizeAuthorKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function syncRecordAuthors(recordId: number, authorsRaw: string): void {
  const list = splitAuthorsPreserveSpelling(authorsRaw);

  const deleteExisting = db.prepare('DELETE FROM record_authors WHERE record_id = ?');
  // Match strictly by exact original spelling so we NEVER merge two scientists merely because names are similar
  const findAuthor = db.prepare('SELECT id FROM authors WHERE name = ?');
  const insertAuthor = db.prepare(
    'INSERT INTO authors (name, normalized_name) VALUES (?, ?)'
  );
  const insertLink = db.prepare(
    'INSERT INTO record_authors (record_id, author_id, author_order, original_spelling) VALUES (?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    deleteExisting.run(recordId);
    list.forEach((authorName, idx) => {
      const cleanName = authorName.trim();
      let row = findAuthor.get(cleanName) as { id: number } | undefined;
      if (!row) {
        const res = insertAuthor.run(cleanName, normalizeAuthorKey(cleanName));
        row = { id: Number(res.lastInsertRowid) };
      }
      insertLink.run(recordId, row.id, idx + 1, cleanName);
    });
  });

  tx();
}

export function rebuildAllAuthorsIndex(): void {
  const records = db
    .prepare('SELECT id, authors FROM records')
    .all() as Array<{ id: number; authors: string }>;
  for (const r of records) {
    syncRecordAuthors(r.id, r.authors);
  }
}

export function getAuthorProfiles(searchQuery = ''): AuthorProfile[] {
  const authors = db
    .prepare('SELECT id, name, normalized_name, division, notes, created_at FROM authors ORDER BY name ASC')
    .all() as Array<{
    id: number;
    name: string;
    normalized_name: string;
    division: string;
    notes: string;
    created_at: string;
  }>;

  const links = db
    .prepare(
      `SELECT ra.author_id, r.category, r.publication_year
       FROM record_authors ra
       JOIN records r ON r.id = ra.record_id`
    )
    .all() as Array<{
    author_id: number;
    category: string;
    publication_year: string;
  }>;

  const statsMap = new Map<
    number,
    {
      total: number;
      rp: number;
      bc: number;
      conf: number;
      rev: number;
      years: Record<string, number>;
    }
  >();

  for (const l of links) {
    if (!statsMap.has(l.author_id)) {
      statsMap.set(l.author_id, {
        total: 0,
        rp: 0,
        bc: 0,
        conf: 0,
        rev: 0,
        years: {},
      });
    }
    const st = statsMap.get(l.author_id)!;
    st.total++;
    if (l.category === 'Research Papers') st.rp++;
    else if (l.category === 'Book Chapters') st.bc++;
    else if (l.category === 'Conference Proceedings/Seminars') st.conf++;
    else st.rev++;

    const yr = l.publication_year?.trim() || 'Unspecified';
    st.years[yr] = (st.years[yr] ?? 0) + 1;
  }

  const q = searchQuery.trim().toLowerCase();
  const profiles: AuthorProfile[] = [];
  for (const a of authors) {
    const st = statsMap.get(a.id);
    if (!st || st.total === 0) continue;
    if (q && !a.name.toLowerCase().includes(q) && !a.division.toLowerCase().includes(q)) {
      continue;
    }
    profiles.push({
      id: a.id,
      name: a.name,
      normalized_name: a.normalized_name,
      division: a.division,
      notes: a.notes,
      total_records: st.total,
      research_papers: st.rp,
      book_chapters: st.bc,
      conference_contributions: st.conf,
      review_required: st.rev,
      year_breakdown: st.years,
      created_at: a.created_at,
    });
  }

  return profiles.sort((a, b) => b.total_records - a.total_records || a.name.localeCompare(b.name));
}

export function renameAuthorForRecordOrGlobal(
  authorId: number,
  newName: string,
  division?: string,
  notes?: string
): void {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Author name cannot be empty.');

  const existing = db
    .prepare('SELECT id, name FROM authors WHERE id = ?')
    .get(authorId) as { id: number; name: string } | undefined;
  if (!existing) throw new Error('Author not found.');

  const collision = db
    .prepare('SELECT id FROM authors WHERE name = ? AND id != ?')
    .get(trimmed, authorId) as { id: number } | undefined;

  const tx = db.transaction(() => {
    if (collision) {
      // Explicit user-initiated merge into target author name
      db.prepare('UPDATE record_authors SET author_id = ?, original_spelling = ? WHERE author_id = ?').run(
        collision.id,
        trimmed,
        authorId
      );
      if (division !== undefined || notes !== undefined) {
        db.prepare('UPDATE authors SET division = COALESCE(?, division), notes = COALESCE(?, notes) WHERE id = ?').run(
          division ?? null,
          notes ?? null,
          collision.id
        );
      }
      db.prepare('DELETE FROM authors WHERE id = ?').run(authorId);
    } else {
      db.prepare(
        'UPDATE authors SET name = ?, normalized_name = ?, division = COALESCE(?, division), notes = COALESCE(?, notes) WHERE id = ?'
      ).run(trimmed, normalizeAuthorKey(trimmed), division ?? null, notes ?? null, authorId);
      db.prepare('UPDATE record_authors SET original_spelling = ? WHERE author_id = ?').run(
        trimmed,
        authorId
      );
    }

    // Update authors string on affected records preserving author order
    const affectedRecords = db
      .prepare(
        'SELECT DISTINCT record_id FROM record_authors WHERE author_id = ?'
      )
      .all(collision ? collision.id : authorId) as Array<{ record_id: number }>;

    for (const ar of affectedRecords) {
      const ordered = db
        .prepare(
          'SELECT original_spelling FROM record_authors WHERE record_id = ? ORDER BY author_order ASC'
        )
        .all(ar.record_id) as Array<{ original_spelling: string }>;
      const joined = ordered.map((o) => o.original_spelling).join(', ');
      const prev = db.prepare('SELECT authors FROM records WHERE id = ?').get(ar.record_id) as { authors: string };
      db.prepare("UPDATE records SET authors = ?, updated_at = datetime('now') WHERE id = ?").run(
        joined,
        ar.record_id
      );
      db.prepare(
        'INSERT INTO audit_logs (record_id, action, field_changed, old_value, new_value, actor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        ar.record_id,
        'AUTHOR_CORRECTION',
        'authors',
        prev?.authors ?? '',
        joined,
        'Reviewer',
        `Corrected author spelling: "${existing.name}" -> "${trimmed}"`
      );
    }
  });

  tx();
}

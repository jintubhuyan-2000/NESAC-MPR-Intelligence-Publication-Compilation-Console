import { db } from './db.ts';
import type { DuplicateStatus } from '../src/types/mpr.ts';

interface RecordRow {
  id: number;
  document_id: number;
  title: string;
  authors: string;
  doi: string;
  publication_year: string;
  original_text: string;
  master_record_id: number | null;
}

export function normalizeTextForCompare(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDoi(doi: string): string {
  return (doi || '')
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/[.,;)\s]+$/g, '')
    .trim();
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter((w) => w.length > 2));
  const setB = new Set(b.split(' ').filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (Math.max(m, n) > 350) {
    return tokenJaccard(a, b);
  }
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  const dist = dp[n];
  return 1 - dist / Math.max(m, n);
}

export function recomputeDuplicates(): {
  groupsFound: number;
  confirmedCount: number;
  possibleCount: number;
} {
  const rows = db
    .prepare(
      'SELECT id, document_id, title, authors, doi, publication_year, original_text, master_record_id FROM records ORDER BY id ASC'
    )
    .all() as RecordRow[];

  const parent = new Map<number, number>();
  for (const r of rows) parent.set(r.id, r.id);

  function find(x: number): number {
    let p = parent.get(x)!;
    while (p !== parent.get(p)!) {
      p = parent.get(p)!;
    }
    return p;
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      const root = Math.min(ra, rb);
      const other = Math.max(ra, rb);
      parent.set(other, root);
    }
  }

  const pairDetails = new Map<number, { status: DuplicateStatus; score: number; reasons: string[] }>();

  const setMatch = (id: number, status: DuplicateStatus, score: number, reason: string) => {
    const existing = pairDetails.get(id);
    if (!existing) {
      pairDetails.set(id, { status, score, reasons: [reason] });
      return;
    }
    if (
      status === 'confirmed_duplicate' ||
      (status === 'possible_duplicate' && existing.status !== 'confirmed_duplicate')
    ) {
      existing.status = status;
    }
    existing.score = Math.max(existing.score, score);
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  };

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];

      const doiA = normalizeDoi(a.doi);
      const doiB = normalizeDoi(b.doi);
      const titleA = normalizeTextForCompare(a.title || a.original_text);
      const titleB = normalizeTextForCompare(b.title || b.original_text);
      const authA = normalizeTextForCompare(a.authors);
      const authB = normalizeTextForCompare(b.authors);

      // 1. Exact DOI match
      if (doiA && doiB && doiA === doiB) {
        union(a.id, b.id);
        const msg = `Exact DOI match (${doiA})`;
        setMatch(a.id, 'confirmed_duplicate', 1.0, msg);
        setMatch(b.id, 'confirmed_duplicate', 1.0, msg);
        continue;
      }

      // 2. Normalized Title comparison + Fuzzy ratio + Authors + Year
      const titleJaccard = tokenJaccard(titleA, titleB);
      const titleLev = levenshteinRatio(titleA, titleB);
      const titleScore = Math.max(titleJaccard, titleLev);
      const authorScore = authA && authB ? tokenJaccard(authA, authB) : 0;
      const sameYear =
        Boolean(a.publication_year) &&
        Boolean(b.publication_year) &&
        a.publication_year.trim() === b.publication_year.trim();

      if (titleA && titleB && titleA === titleB && (authorScore >= 0.4 || sameYear || (!authA && !authB))) {
        union(a.id, b.id);
        const msg = `Exact normalized title match${sameYear ? ` (${a.publication_year})` : ''}`;
        setMatch(a.id, 'confirmed_duplicate', 0.96, msg);
        setMatch(b.id, 'confirmed_duplicate', 0.96, msg);
      } else if (titleScore >= 0.82 && (authorScore >= 0.4 || sameYear)) {
        union(a.id, b.id);
        const combined = Number((titleScore * 0.7 + authorScore * 0.2 + (sameYear ? 0.1 : 0)).toFixed(2));
        const msg = `High title similarity (${Math.round(titleScore * 100)}%)${authorScore >= 0.4 ? ` & author overlap (${Math.round(authorScore * 100)}%)` : ''}${sameYear ? ` · ${a.publication_year}` : ''}`;
        const status: DuplicateStatus = combined >= 0.88 ? 'confirmed_duplicate' : 'possible_duplicate';
        setMatch(a.id, status, combined, msg);
        setMatch(b.id, status, combined, msg);
      } else if (titleScore >= 0.68 || (titleScore >= 0.55 && authorScore >= 0.65 && sameYear)) {
        union(a.id, b.id);
        const combined = Number((titleScore * 0.65 + authorScore * 0.25 + (sameYear ? 0.1 : 0)).toFixed(2));
        const msg = `Fuzzy title similarity (${Math.round(titleScore * 100)}%)${authorScore > 0 ? ` · Author overlap (${Math.round(authorScore * 100)}%)` : ''}`;
        setMatch(a.id, 'possible_duplicate', combined, msg);
        setMatch(b.id, 'possible_duplicate', combined, msg);
      }
    }
  }

  // Group sizes
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    const root = find(r.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r.id);
  }

  const updateStmt = db.prepare(`
    UPDATE records
    SET duplicate_status = ?,
        duplicate_group_id = ?,
        duplicate_score = ?,
        duplicate_reason = ?,
        master_record_id = COALESCE(master_record_id, ?)
    WHERE id = ?
  `);

  let groupsFound = 0;
  let confirmedCount = 0;
  let possibleCount = 0;

  const tx = db.transaction(() => {
    for (const [root, memberIds] of groups.entries()) {
      if (memberIds.length <= 1) {
        updateStmt.run('unique', null, 0, '', null, memberIds[0]);
      } else {
        groupsFound++;
        const groupId = `DUP-GRP-${root}`;
        for (const id of memberIds) {
          const info = pairDetails.get(id);
          const status = info?.status ?? 'possible_duplicate';
          if (status === 'confirmed_duplicate') confirmedCount++;
          else possibleCount++;
          updateStmt.run(
            status,
            groupId,
            info?.score ?? 0.75,
            (info?.reasons ?? ['Cross-document similarity']).join(' | '),
            root,
            id
          );
        }
      }
    }
  });

  tx();
  return { groupsFound, confirmedCount, possibleCount };
}

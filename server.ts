import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getAuthorProfiles,
  rebuildAllAuthorsIndex,
  renameAuthorForRecordOrGlobal,
  syncRecordAuthors,
} from './server/authorService.ts';
import { db, getSettings, initializeDatabase, updateSettings } from './server/db.ts';
import { extractDocxBuffer } from './server/docxExtractor.ts';
import { recomputeDuplicates } from './server/duplicateDetector.ts';
import {
  extractWithGeminiBatch,
  localDeterministicExtract,
  type ExtractedMetadataResult,
  type ExtractionInputItem,
} from './server/geminiAgent.ts';
import {
  generateDocxReportBuffer,
  generateExcelReportBuffer,
} from './server/reportGenerator.ts';
import {
  createTestDocxSuiteBuffers,
  ensureTestDocxFilesOnDisk,
} from './server/testDocxGenerator.ts';
import type {
  DashboardSummary,
  ExtractionDiagnostics,
  MprDocument,
  PublicationCategory,
  PublicationRecord,
  ReviewStatus,
  SectionType,
} from './src/types/mpr.ts';

dotenv.config();

initializeDatabase();
ensureTestDocxFilesOnDisk();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function saveExtractedDocument(params: {
  filename: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  sourceMode: 'server_upload' | 'local_agent' | 'test_suite';
  items: Array<{
    paragraphNumber: number;
    containerType: string;
    xmlSource: string;
    sectionDetected: SectionType;
    rawText: string;
    isHeading: boolean;
  }>;
  diagnostics: ExtractionDiagnostics;
}): { documentId: number; alreadyExists: boolean } {
  const existing = db
    .prepare('SELECT id FROM documents WHERE filename = ? AND file_hash = ?')
    .get(params.filename, params.fileHash) as { id: number } | undefined;

  if (existing) {
    return { documentId: existing.id, alreadyExists: true };
  }

  const tx = db.transaction(() => {
    const textboxCount =
      (params.diagnostics.drawingMlTextBoxes ?? 0) +
      (params.diagnostics.vmlTextBoxes ?? 0);

    const insertDoc = db.prepare(`
      INSERT INTO documents (
        filename, file_path, file_hash, file_size, source_mode, status,
        total_paragraphs, section_iv_found, section_v_found,
        textbox_count, table_count, header_footer_count, diagnostics_json
      ) VALUES (?, ?, ?, ?, ?, 'extracted', ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = insertDoc.run(
      params.filename,
      params.filePath,
      params.fileHash,
      params.fileSize,
      params.sourceMode,
      params.diagnostics.totalParagraphs ?? params.items.length,
      params.diagnostics.sectionIvFound ? 1 : 0,
      params.diagnostics.sectionVFound ? 1 : 0,
      textboxCount,
      params.diagnostics.tableCells ?? 0,
      params.diagnostics.headerFooterItems ?? 0,
      JSON.stringify(params.diagnostics)
    );

    const docId = Number(res.lastInsertRowid);

    const insertPara = db.prepare(`
      INSERT INTO extracted_paragraphs (
        document_id, paragraph_number, container_type, xml_source,
        section_detected, raw_text, is_heading
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of params.items) {
      insertPara.run(
        docId,
        item.paragraphNumber,
        item.containerType,
        item.xmlSource,
        item.sectionDetected,
        item.rawText,
        item.isHeading ? 1 : 0
      );
    }

    return docId;
  });

  const documentId = tx();
  return { documentId, alreadyExists: false };
}

async function processDocumentById(
  documentId: number,
  useGemini: boolean
): Promise<{
  processedCount: number;
  usedMode: 'gemini' | 'local';
}> {
  const doc = db
    .prepare('SELECT * FROM documents WHERE id = ?')
    .get(documentId) as MprDocument | undefined;
  if (!doc) throw new Error('Document not found.');

  const paragraphs = db
    .prepare(
      `SELECT id, paragraph_number, container_type, section_detected, raw_text, is_heading
       FROM extracted_paragraphs
       WHERE document_id = ? AND is_heading = 0
         AND (
           section_detected IN ('SECTION_IV', 'SECTION_V')
           OR (xml_source LIKE 'word/header%' OR xml_source LIKE 'word/footer%')
         )
         AND length(raw_text) >= 40
       ORDER BY paragraph_number ASC`
    )
    .all(documentId) as Array<{
    id: number;
    paragraph_number: number;
    container_type: string;
    section_detected: SectionType;
    raw_text: string;
    is_heading: number;
  }>;

  // Fallback: if neither Section IV nor V headings were found, inspect non-heading items with publication clues
  let targetItems = paragraphs;
  if (targetItems.length === 0) {
    targetItems = db
      .prepare(
        `SELECT id, paragraph_number, container_type, section_detected, raw_text, is_heading
         FROM extracted_paragraphs
         WHERE document_id = ? AND is_heading = 0 AND length(raw_text) >= 25
         ORDER BY paragraph_number ASC`
      )
      .all(documentId) as typeof paragraphs;
  }

  const inputs: ExtractionInputItem[] = targetItems.map((p) => ({
    paragraphId: p.id,
    sourceFilename: doc.filename,
    sourceSection: p.section_detected,
    containerType: p.container_type,
    rawText: p.raw_text,
  }));

  let extracted: ExtractedMetadataResult[] = [];
  let usedMode: 'gemini' | 'local' = 'local';

  if (inputs.length > 0) {
    if (useGemini) {
      extracted = await extractWithGeminiBatch(inputs);
      usedMode = 'gemini';
    } else {
      extracted = inputs.map((it) => localDeterministicExtract(it));
      usedMode = 'local';
    }
  }

  const paraMap = new Map(targetItems.map((p) => [p.id, p]));

  const tx = db.transaction(() => {
    // Remove previous records for this document if reprocessing
    db.prepare('DELETE FROM records WHERE document_id = ?').run(documentId);

    const insertRec = db.prepare(`
      INSERT INTO records (
        document_id, paragraph_id, original_text, source_section,
        category, ai_category, ai_confidence, ai_reasoning,
        title, authors, journal_name, book_title, conference_name,
        publication_year, doi, isbn, issn, volume, issue, page_numbers,
        presentation_type, event_location, event_date, publication_type,
        review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const insertedIds: Array<{ id: number; authors: string }> = [];

    for (const res of extracted) {
      if (!res.isValidPublicationOrActivity) continue;
      const para = paraMap.get(res.paragraphId);
      if (!para) continue;

      const info = insertRec.run(
        documentId,
        res.paragraphId,
        para.raw_text,
        para.section_detected,
        res.category,
        res.category,
        res.confidence,
        res.reasoning,
        res.title,
        res.authors,
        res.journalName,
        res.bookTitle,
        res.conferenceName,
        res.publicationYear,
        res.doi,
        res.isbn,
        res.issn,
        res.volume,
        res.issue,
        res.pageNumbers,
        res.presentationType,
        res.eventLocation,
        res.eventDate,
        res.publicationType
      );
      const recId = Number(info.lastInsertRowid);
      insertedIds.push({ id: recId, authors: res.authors });
    }

    db.prepare(
      "UPDATE documents SET status = 'processed', processed_at = datetime('now') WHERE id = ?"
    ).run(documentId);

    return insertedIds;
  });

  const inserted = tx();
  for (const item of inserted) {
    syncRecordAuthors(item.id, item.authors);
  }
  recomputeDuplicates();

  return { processedCount: inserted.length, usedMode };
}

// ======================= API ROUTES =======================

app.get('/api/dashboard', (_req, res) => {
  const docs = db.prepare('SELECT * FROM documents').all() as MprDocument[];
  const records = db
    .prepare(
      `SELECT r.*, d.filename AS source_filename
       FROM records r JOIN documents d ON d.id = r.document_id`
    )
    .all() as PublicationRecord[];

  const yearMap = new Map<
    string,
    { year: string; researchPapers: number; bookChapters: number; conferences: number }
  >();

  for (const r of records) {
    const yr = r.publication_year?.trim() || 'Unspecified';
    if (!yearMap.has(yr)) {
      yearMap.set(yr, { year: yr, researchPapers: 0, bookChapters: 0, conferences: 0 });
    }
    const row = yearMap.get(yr)!;
    if (r.category === 'Research Papers') row.researchPapers++;
    else if (r.category === 'Book Chapters') row.bookChapters++;
    else if (r.category === 'Conference Proceedings/Seminars') row.conferences++;
  }

  const monthlyDocuments = docs.map((d) => {
    const docRecs = records.filter((r) => r.document_id === d.id);
    return {
      filename: d.filename,
      researchPapers: docRecs.filter((r) => r.category === 'Research Papers').length,
      bookChapters: docRecs.filter((r) => r.category === 'Book Chapters').length,
      conferences: docRecs.filter((r) => r.category === 'Conference Proceedings/Seminars').length,
      reviewRequired: docRecs.filter((r) => r.category === 'Review Required').length,
    };
  });

  const summary: DashboardSummary = {
    totalDocuments: docs.length,
    documentsProcessed: docs.filter((d) => d.status === 'processed').length,
    documentsPending: docs.filter((d) => d.status !== 'processed').length,
    totalExtractedEntries: records.length,
    researchPapers: records.filter((r) => r.category === 'Research Papers').length,
    bookChapters: records.filter((r) => r.category === 'Book Chapters').length,
    conferenceContributions: records.filter(
      (r) => r.category === 'Conference Proceedings/Seminars'
    ).length,
    reviewRequired: records.filter((r) => r.category === 'Review Required').length,
    pendingReviews: records.filter((r) => r.review_status === 'pending').length,
    approvedRecords: records.filter((r) => r.review_status === 'approved').length,
    rejectedRecords: records.filter((r) => r.review_status === 'rejected').length,
    flaggedRecords: records.filter((r) => r.review_status === 'flagged').length,
    possibleDuplicates: records.filter((r) => r.duplicate_status === 'possible_duplicate').length,
    confirmedDuplicates: records.filter((r) => r.duplicate_status === 'confirmed_duplicate').length,
    yearDistribution: Array.from(yearMap.values()).sort((a, b) => a.year.localeCompare(b.year)),
    monthlyDocuments,
  };

  res.json(summary);
});

app.get('/api/documents', (_req, res) => {
  const docs = db.prepare('SELECT * FROM documents ORDER BY id DESC').all();
  res.json({ documents: docs });
});

app.get('/api/documents/:id/diagnostics', (req, res) => {
  const docId = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as
    | MprDocument
    | undefined;
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const paragraphs = db
    .prepare(
      'SELECT * FROM extracted_paragraphs WHERE document_id = ? ORDER BY paragraph_number ASC'
    )
    .all(docId);

  res.json({
    document: doc,
    diagnostics: JSON.parse(doc.diagnostics_json || '{}'),
    paragraphs,
  });
});

app.delete('/api/documents/:id', (req, res) => {
  const docId = Number(req.params.id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
  recomputeDuplicates();
  rebuildAllAuthorsIndex();
  res.json({ ok: true });
});

app.post('/api/documents/upload', upload.array('files', 200), (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No DOCX files uploaded.' });
  }

  const results = [];
  const ignoredTemp: string[] = [];
  const ignoredOther: string[] = [];

  for (const f of files) {
    const baseName = path.basename(f.originalname);
    if (baseName.startsWith('~$') || baseName.startsWith('.')) {
      ignoredTemp.push(baseName);
      continue;
    }
    if (!baseName.toLowerCase().endsWith('.docx')) {
      ignoredOther.push(baseName);
      continue;
    }
    const extracted = extractDocxBuffer(f.buffer, baseName);
    const saved = saveExtractedDocument({
      filename: baseName,
      filePath: f.originalname,
      fileHash: extracted.fileHash,
      fileSize: f.size,
      sourceMode: 'server_upload',
      items: extracted.items,
      diagnostics: extracted.diagnostics,
    });
    results.push({
      filename: baseName,
      documentId: saved.documentId,
      alreadyExists: saved.alreadyExists,
      diagnostics: extracted.diagnostics,
    });
  }

  res.json({ uploaded: results, ignoredTemp, ignoredOther });
});

// Sync pre-extracted OOXML output from the Local Windows Python Agent
app.post('/api/documents/sync-local', (req, res) => {
  const payload = req.body as {
    documents?: Array<{
      filename: string;
      file_path: string;
      file_hash: string;
      file_size: number;
      items: Array<{
        paragraphNumber: number;
        containerType: string;
        xmlSource: string;
        sectionDetected: SectionType;
        rawText: string;
        isHeading: boolean;
      }>;
      diagnostics: ExtractionDiagnostics;
    }>;
  };

  if (!payload.documents || payload.documents.length === 0) {
    return res.status(400).json({ error: 'No extracted local documents provided.' });
  }

  const synced = [];
  for (const d of payload.documents) {
    const saved = saveExtractedDocument({
      filename: d.filename,
      filePath: d.file_path,
      fileHash: d.file_hash,
      fileSize: d.file_size,
      sourceMode: 'local_agent',
      items: d.items,
      diagnostics: d.diagnostics,
    });
    synced.push({
      filename: d.filename,
      documentId: saved.documentId,
      alreadyExists: saved.alreadyExists,
    });
  }

  res.json({ synced });
});

// Preview the minimal text snippets before transmitting to Gemini
app.post('/api/documents/preview-transmission', (req, res) => {
  const { documentIds } = req.body as { documentIds: number[] };
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res.json({ items: [] });
  }
  const placeholders = documentIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT ep.id, d.filename, ep.section_detected, ep.container_type, ep.raw_text
       FROM extracted_paragraphs ep
       JOIN documents d ON d.id = ep.document_id
       WHERE ep.document_id IN (${placeholders})
         AND ep.is_heading = 0
         AND ep.section_detected IN ('SECTION_IV', 'SECTION_V')
       ORDER BY ep.document_id ASC, ep.paragraph_number ASC`
    )
    .all(...documentIds);

  res.json({ items: rows });
});

// Process documents incrementally via Gemini AI (or Local-Only Mode)
app.post('/api/documents/process', async (req, res) => {
  try {
    const { documentIds, mode } = req.body as {
      documentIds: number[];
      mode?: 'gemini' | 'local';
    };
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one document to process.' });
    }

    const settings = getSettings();
    const useGemini =
      settings.local_only_mode ? false : mode === 'local' ? false : true;

    const outcomes = [];
    for (const id of documentIds) {
      const outcome = await processDocumentById(id, useGemini);
      outcomes.push({ documentId: id, ...outcome });
    }

    res.json({ outcomes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Programmatic Test Suite: creates real OOXML DOCX files & runs extraction + optional processing
app.post('/api/test-suite/run', async (req, res) => {
  try {
    const { processWithAi } = (req.body || {}) as { processWithAi?: boolean };
    const suite = createTestDocxSuiteBuffers();
    const settings = getSettings();
    const useGemini = Boolean(processWithAi) && !settings.local_only_mode;

    const loaded = [];
    for (const item of suite) {
      const extracted = extractDocxBuffer(item.buffer, item.filename);
      const saved = saveExtractedDocument({
        filename: item.filename,
        filePath: `test_data/${item.filename}`,
        fileHash: extracted.fileHash,
        fileSize: item.buffer.length,
        sourceMode: 'test_suite',
        items: extracted.items,
        diagnostics: extracted.diagnostics,
      });

      const proc = await processDocumentById(saved.documentId, useGemini);
      loaded.push({
        filename: item.filename,
        documentId: saved.documentId,
        alreadyExists: saved.alreadyExists,
        diagnostics: extracted.diagnostics,
        processedCount: proc.processedCount,
        usedMode: proc.usedMode,
      });
    }

    res.json({ suiteResults: loaded });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/test-suite/download/:filename', (req, res) => {
  const suite = createTestDocxSuiteBuffers();
  const match = suite.find((s) => s.filename === req.params.filename);
  if (!match) return res.status(404).json({ error: 'Test file not found.' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${match.filename}"`);
  res.send(match.buffer);
});

// ======================= RECORDS & REVIEW =======================

app.get('/api/records', (req, res) => {
  const { category, review_status, duplicate_status, search } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category && category !== 'all') {
    conditions.push('r.category = ?');
    params.push(category);
  }
  if (review_status && review_status !== 'all') {
    conditions.push('r.review_status = ?');
    params.push(review_status);
  }
  if (duplicate_status && duplicate_status !== 'all') {
    conditions.push('r.duplicate_status = ?');
    params.push(duplicate_status);
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      '(r.title LIKE ? OR r.authors LIKE ? OR r.original_text LIKE ? OR r.journal_name LIKE ? OR r.conference_name LIKE ? OR r.book_title LIKE ? OR r.doi LIKE ?)'
    );
    params.push(q, q, q, q, q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const records = db
    .prepare(
      `SELECT r.*, d.filename AS source_filename,
              ep.paragraph_number AS paragraph_number,
              ep.container_type AS container_type
       FROM records r
       JOIN documents d ON d.id = r.document_id
       LEFT JOIN extracted_paragraphs ep ON ep.id = r.paragraph_id
       ${where}
       ORDER BY r.id DESC`
    )
    .all(...params);

  res.json({ records });
});

app.patch('/api/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as
    | PublicationRecord
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Record not found.' });

  const editableFields = [
    'category',
    'title',
    'authors',
    'journal_name',
    'book_title',
    'conference_name',
    'publication_year',
    'doi',
    'isbn',
    'issn',
    'volume',
    'issue',
    'page_numbers',
    'presentation_type',
    'event_location',
    'event_date',
    'publication_type',
    'review_status',
  ] as const;

  const body = req.body as Partial<PublicationRecord> & { actor?: string; notes?: string };
  const actor = body.actor || 'Reviewer';
  const updates: string[] = [];
  const values: unknown[] = [];

  const auditStmt = db.prepare(
    'INSERT INTO audit_logs (record_id, action, field_changed, old_value, new_value, actor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const field of editableFields) {
      if (body[field] !== undefined && String(body[field]) !== String(existing[field] ?? '')) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
        auditStmt.run(
          id,
          field === 'review_status' ? 'REVIEW_STATUS_CHANGE' : 'METADATA_EDIT',
          field,
          String(existing[field] ?? ''),
          String(body[field]),
          actor,
          body.notes ?? ''
        );
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE records SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
  });

  tx();

  if (body.authors !== undefined) {
    syncRecordAuthors(id, body.authors);
  }
  recomputeDuplicates();

  const updated = db
    .prepare(
      `SELECT r.*, d.filename AS source_filename
       FROM records r JOIN documents d ON d.id = r.document_id
       WHERE r.id = ?`
    )
    .get(id);

  res.json({ record: updated });
});

app.post('/api/records/bulk-review', (req, res) => {
  const { recordIds, reviewStatus, notes } = req.body as {
    recordIds: number[];
    reviewStatus: ReviewStatus;
    notes?: string;
  };
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return res.status(400).json({ error: 'No records selected.' });
  }

  const updateStmt = db.prepare(
    "UPDATE records SET review_status = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const getStmt = db.prepare('SELECT review_status FROM records WHERE id = ?');
  const auditStmt = db.prepare(
    'INSERT INTO audit_logs (record_id, action, field_changed, old_value, new_value, actor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const id of recordIds) {
      const prev = getStmt.get(id) as { review_status: string } | undefined;
      if (!prev) continue;
      updateStmt.run(reviewStatus, id);
      auditStmt.run(
        id,
        'BULK_REVIEW',
        'review_status',
        prev.review_status,
        reviewStatus,
        'Reviewer',
        notes ?? ''
      );
    }
  });

  tx();
  res.json({ updated: recordIds.length });
});

app.get('/api/records/:id/audit', (req, res) => {
  const id = Number(req.params.id);
  const logs = db
    .prepare('SELECT * FROM audit_logs WHERE record_id = ? ORDER BY id DESC')
    .all(id);
  res.json({ logs });
});

// ======================= DUPLICATES =======================

app.get('/api/duplicates', (_req, res) => {
  const records = db
    .prepare(
      `SELECT r.*, d.filename AS source_filename
       FROM records r
       JOIN documents d ON d.id = r.document_id
       WHERE r.duplicate_status != 'unique'
       ORDER BY r.duplicate_group_id ASC, r.id ASC`
    )
    .all() as PublicationRecord[];

  const groupsMap = new Map<string, PublicationRecord[]>();
  for (const r of records) {
    const key = r.duplicate_group_id || `GRP-${r.id}`;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(r);
  }

  res.json({
    groups: Array.from(groupsMap.entries()).map(([groupId, items]) => ({
      groupId,
      masterRecordId: items[0]?.master_record_id ?? items[0]?.id,
      status: items.some((i) => i.duplicate_status === 'confirmed_duplicate')
        ? 'confirmed_duplicate'
        : 'possible_duplicate',
      items,
    })),
  });
});

app.post('/api/duplicates/select-master', (req, res) => {
  const { groupId, masterRecordId } = req.body as {
    groupId: string;
    masterRecordId: number;
  };
  if (!groupId || !masterRecordId) {
    return res.status(400).json({ error: 'groupId and masterRecordId are required.' });
  }

  const members = db
    .prepare('SELECT id, master_record_id FROM records WHERE duplicate_group_id = ?')
    .all(groupId) as Array<{ id: number; master_record_id: number | null }>;

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE records SET master_record_id = ?, updated_at = datetime('now') WHERE duplicate_group_id = ?"
    ).run(masterRecordId, groupId);

    for (const m of members) {
      db.prepare(
        'INSERT INTO audit_logs (record_id, action, field_changed, old_value, new_value, actor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        m.id,
        'DUPLICATE_MASTER_SELECTED',
        'master_record_id',
        String(m.master_record_id ?? ''),
        String(masterRecordId),
        'Reviewer',
        `Selected record #${masterRecordId} as master in ${groupId}`
      );
    }
  });

  tx();
  res.json({ ok: true });
});

app.post('/api/duplicates/mark-unique', (req, res) => {
  const { recordId } = req.body as { recordId: number };
  db.prepare(
    "UPDATE records SET duplicate_status = 'unique', duplicate_group_id = NULL, master_record_id = NULL, duplicate_score = 0, duplicate_reason = 'Cleared by human reviewer', updated_at = datetime('now') WHERE id = ?"
  ).run(recordId);
  db.prepare(
    'INSERT INTO audit_logs (record_id, action, field_changed, old_value, new_value, actor, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    recordId,
    'DUPLICATE_CLEARED',
    'duplicate_status',
    'duplicate',
    'unique',
    'Reviewer',
    'Marked as distinct publication by reviewer'
  );
  res.json({ ok: true });
});

// ======================= AUTHORS =======================

app.get('/api/authors', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const authors = getAuthorProfiles(q);
  res.json({ authors });
});

app.get('/api/authors/:id/records', (req, res) => {
  const authorId = Number(req.params.id);
  const author = db.prepare('SELECT * FROM authors WHERE id = ?').get(authorId);
  if (!author) return res.status(404).json({ error: 'Author not found.' });

  const records = db
    .prepare(
      `SELECT r.*, d.filename AS source_filename
       FROM record_authors ra
       JOIN records r ON r.id = ra.record_id
       JOIN documents d ON d.id = r.document_id
       WHERE ra.author_id = ?
       ORDER BY r.publication_year DESC, r.id DESC`
    )
    .all(authorId);

  res.json({ author, records });
});

app.patch('/api/authors/:id', (req, res) => {
  try {
    const authorId = Number(req.params.id);
    const { name, division, notes } = req.body as {
      name: string;
      division?: string;
      notes?: string;
    };
    renameAuthorForRecordOrGlobal(authorId, name, division, notes);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ======================= SETTINGS =======================

app.get('/api/settings', (_req, res) => {
  res.json({
    settings: getSettings(),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
  });
});

app.put('/api/settings', (req, res) => {
  const updated = updateSettings(req.body);
  res.json({ settings: updated });
});

// ======================= EXPORTS (XLSX, DOCX, PROJECT ZIP) =======================

app.get('/api/export/xlsx', async (req, res) => {
  try {
    const approvedOnly = req.query.approvedOnly === 'true';
    const buffer = await generateExcelReportBuffer(approvedOnly);
    const tag = approvedOnly ? 'Approved' : 'All';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="NESAC_MPR_Compilation_${tag}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/export/docx', async (req, res) => {
  try {
    const approvedOnly = req.query.approvedOnly === 'true';
    const buffer = await generateDocxReportBuffer(approvedOnly);
    const tag = approvedOnly ? 'Approved' : 'All';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="NESAC_MPR_Compilation_${tag}.docx"`
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/export/project-zip', (_req, res) => {
  try {
    const zip = new AdmZip();
    const rootDir = process.cwd();
    const dirsToInclude = ['src', 'server', 'python_agent', 'scripts', 'test_data'];
    const filesToInclude = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'metadata.json',
      '.env.example',
      'server.ts',
      'README.md',
    ];

    const addDirRecursive = (absDir: string, zipPrefix: string) => {
      for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (
          entry.name === '.venv' ||
          entry.name === '__pycache__' ||
          entry.name === 'node_modules'
        ) {
          continue;
        }
        const fullPath = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          addDirRecursive(fullPath, `${zipPrefix}/${entry.name}`);
        } else if (entry.isFile()) {
          zip.addLocalFile(fullPath, zipPrefix);
        }
      }
    };

    for (const dir of dirsToInclude) {
      const full = path.join(rootDir, dir);
      if (fs.existsSync(full)) {
        addDirRecursive(full, dir);
      }
    }

    for (const f of filesToInclude) {
      const full = path.join(rootDir, f);
      if (fs.existsSync(full)) {
        zip.addLocalFile(full, '');
      }
    }

    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="NESAC-MPR-Intelligence-Agent.zip"'
    );
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ======================= VITE / STATIC SERVING =======================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NESAC MPR Intelligence Agent running at http://localhost:${PORT}`);
  });
}

startServer();

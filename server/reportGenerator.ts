import ExcelJS from 'exceljs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { db, getSettings } from './db.ts';
import { getAuthorProfiles } from './authorService.ts';
import type { MprDocument, PublicationRecord } from '../src/types/mpr.ts';

function fetchRecordsForReport(approvedOnly: boolean): PublicationRecord[] {
  const whereClause = approvedOnly ? "WHERE r.review_status = 'approved'" : '';
  return db
    .prepare(
      `SELECT r.*, d.filename AS source_filename
       FROM records r
       JOIN documents d ON d.id = r.document_id
       ${whereClause}
       ORDER BY r.category ASC, r.publication_year DESC, r.id ASC`
    )
    .all() as PublicationRecord[];
}

export async function generateExcelReportBuffer(approvedOnly: boolean): Promise<Buffer> {
  const records = fetchRecordsForReport(approvedOnly);
  const allDocuments = db
    .prepare('SELECT * FROM documents ORDER BY id ASC')
    .all() as MprDocument[];
  const authors = getAuthorProfiles('');
  const settings = getSettings();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NESAC MPR Intelligence Agent';
  workbook.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F294A' } },
    alignment: { vertical: 'middle' as const, horizontal: 'left' as const, wrapText: true },
  };

  const buildRecordSheet = (name: string, rows: PublicationRecord[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Title', key: 'title', width: 46 },
      { header: 'Authors (Original Order)', key: 'authors', width: 34 },
      { header: 'Journal / Book / Conference', key: 'venue', width: 34 },
      { header: 'Year', key: 'publication_year', width: 10 },
      { header: 'DOI', key: 'doi', width: 26 },
      { header: 'ISBN / ISSN', key: 'isbn_issn', width: 20 },
      { header: 'Vol / Issue / Pages', key: 'biblio', width: 22 },
      { header: 'Presentation Type', key: 'presentation_type', width: 18 },
      { header: 'Event Location / Date', key: 'event_info', width: 28 },
      { header: 'Source MPR File', key: 'source_filename', width: 28 },
      { header: 'Source Section', key: 'source_section', width: 14 },
      { header: 'Review Status', key: 'review_status', width: 15 },
      { header: 'Duplicate Status', key: 'duplicate_status', width: 20 },
      { header: 'AI Confidence', key: 'ai_confidence', width: 14 },
      { header: 'Original Extracted Text', key: 'original_text', width: 60 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
    });

    for (const r of rows) {
      const venue = r.journal_name || r.book_title || r.conference_name || '';
      const isbnIssn = [r.isbn ? `ISBN: ${r.isbn}` : '', r.issn ? `ISSN: ${r.issn}` : '']
        .filter(Boolean)
        .join(' | ');
      const biblio = [
        r.volume ? `Vol. ${r.volume}` : '',
        r.issue ? `No. ${r.issue}` : '',
        r.page_numbers ? `pp. ${r.page_numbers}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const eventInfo = [r.event_location, r.event_date].filter(Boolean).join(' · ');

      const added = sheet.addRow({
        id: r.id,
        category: r.category,
        title: r.title,
        authors: r.authors,
        venue,
        publication_year: r.publication_year,
        doi: r.doi,
        isbn_issn: isbnIssn,
        biblio,
        presentation_type: r.presentation_type,
        event_info: eventInfo,
        source_filename: r.source_filename ?? '',
        source_section: r.source_section,
        review_status: r.review_status,
        duplicate_status: r.duplicate_status,
        ai_confidence: Number((r.ai_confidence * 100).toFixed(1)),
        original_text: r.original_text,
      });
      added.alignment = { vertical: 'top', wrapText: true };
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  // 1. All Records
  buildRecordSheet('All Records', records);
  // 2. Research Papers
  buildRecordSheet(
    'Research Papers',
    records.filter((r) => r.category === 'Research Papers')
  );
  // 3. Book Chapters
  buildRecordSheet(
    'Book Chapters',
    records.filter((r) => r.category === 'Book Chapters')
  );
  // 4. Conferences and Seminars
  buildRecordSheet(
    'Conferences and Seminars',
    records.filter((r) => r.category === 'Conference Proceedings/Seminars')
  );

  // 5. Author-wise
  const authorSheet = workbook.addWorksheet('Author-wise');
  authorSheet.columns = [
    { header: 'Scientist / Author Name', key: 'name', width: 32 },
    { header: 'Division', key: 'division', width: 22 },
    { header: 'Total Records', key: 'total', width: 15 },
    { header: 'Research Papers', key: 'rp', width: 18 },
    { header: 'Book Chapters', key: 'bc', width: 16 },
    { header: 'Conferences & Seminars', key: 'conf', width: 24 },
    { header: 'Review Required', key: 'rev', width: 16 },
    { header: 'Year-wise Breakdown', key: 'years', width: 32 },
  ];
  const aHeader = authorSheet.getRow(1);
  aHeader.height = 26;
  aHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
  });
  for (const a of authors) {
    const yearStr = Object.entries(a.year_breakdown)
      .sort(([y1], [y2]) => y2.localeCompare(y1))
      .map(([yr, cnt]) => `${yr}: ${cnt}`)
      .join(', ');
    authorSheet.addRow({
      name: a.name,
      division: a.division,
      total: a.total_records,
      rp: a.research_papers,
      bc: a.book_chapters,
      conf: a.conference_contributions,
      rev: a.review_required,
      years: yearStr,
    });
  }
  authorSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // 6. Possible Duplicates
  buildRecordSheet(
    'Possible Duplicates',
    records.filter((r) => r.duplicate_status !== 'unique')
  );

  // 7. Review Required
  buildRecordSheet(
    'Review Required',
    records.filter(
      (r) =>
        r.category === 'Review Required' ||
        r.review_status === 'pending' ||
        r.review_status === 'flagged'
    )
  );

  // 8. Processing Summary
  const summarySheet = workbook.addWorksheet('Processing Summary');
  summarySheet.columns = [
    { header: 'Metric / Document', key: 'metric', width: 42 },
    { header: 'Value / Details', key: 'value', width: 52 },
  ];
  const sHeader = summarySheet.getRow(1);
  sHeader.height = 26;
  sHeader.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
  });

  summarySheet.addRow({ metric: 'Institution', value: settings.institution_name });
  summarySheet.addRow({
    metric: 'Export Mode',
    value: approvedOnly ? 'Approved Records Only' : 'All Extracted Records',
  });
  summarySheet.addRow({ metric: 'Generated At', value: new Date().toISOString() });
  summarySheet.addRow({ metric: 'Total MPR Documents', value: allDocuments.length });
  summarySheet.addRow({
    metric: 'Documents Processed',
    value: allDocuments.filter((d) => d.status === 'processed').length,
  });
  summarySheet.addRow({ metric: 'Exported Publication Records', value: records.length });
  summarySheet.addRow({
    metric: 'Research Papers',
    value: records.filter((r) => r.category === 'Research Papers').length,
  });
  summarySheet.addRow({
    metric: 'Book Chapters',
    value: records.filter((r) => r.category === 'Book Chapters').length,
  });
  summarySheet.addRow({
    metric: 'Conference Proceedings/Seminars',
    value: records.filter((r) => r.category === 'Conference Proceedings/Seminars').length,
  });
  summarySheet.addRow({
    metric: 'Review Required',
    value: records.filter((r) => r.category === 'Review Required').length,
  });
  summarySheet.addRow({ metric: '', value: '' });
  summarySheet.addRow({ metric: 'Source Document Filename', value: 'Status | Paragraphs | Sec IV | Sec V | TextBoxes' });
  for (const doc of allDocuments) {
    summarySheet.addRow({
      metric: doc.filename,
      value: `${doc.status.toUpperCase()} | ${doc.total_paragraphs} paragraphs | Sec IV: ${
        doc.section_iv_found ? 'Found' : 'Missing'
      } | Sec V: ${doc.section_v_found ? 'Found' : 'Missing'} | TextBoxes: ${doc.textbox_count}`,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateDocxReportBuffer(approvedOnly: boolean): Promise<Buffer> {
  const records = fetchRecordsForReport(approvedOnly);
  const allDocuments = db
    .prepare('SELECT * FROM documents ORDER BY id ASC')
    .all() as MprDocument[];
  const authors = getAuthorProfiles('');
  const settings = getSettings();

  const researchPapers = records.filter((r) => r.category === 'Research Papers');
  const bookChapters = records.filter((r) => r.category === 'Book Chapters');
  const conferences = records.filter((r) => r.category === 'Conference Proceedings/Seminars');

  const buildSummaryTable = () =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ['Metric', 'Count'].map(
            (text) =>
              new TableCell({
                shading: { fill: '0F294A' },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })],
                  }),
                ],
              })
          ),
        }),
        ...[
          ['Source MPR Documents Compiled', String(allDocuments.length)],
          ['Research Papers', String(researchPapers.length)],
          ['Book Chapters', String(bookChapters.length)],
          ['Conference Proceedings / Seminars', String(conferences.length)],
          ['Total Included Records', String(records.length)],
          ['Export Scope', approvedOnly ? 'Approved Records Only' : 'All Extracted Records'],
        ].map(
          ([k, v]) =>
            new TableRow({
              children: [k, v].map(
                (val) =>
                  new TableCell({
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                    },
                    children: [new Paragraph({ children: [new TextRun({ text: val, size: 21 })] })],
                  })
              ),
            })
        ),
      ],
    });

  const buildCategoryParagraphs = (headingTitle: string, list: PublicationRecord[]): Paragraph[] => {
    const out: Paragraph[] = [
      new Paragraph({
        text: headingTitle,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    ];

    if (list.length === 0) {
      out.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No records recorded in this category for the selected export scope.',
              italics: true,
              color: '64748B',
            }),
          ],
          spacing: { after: 140 },
        })
      );
      return out;
    }

    list.forEach((rec, idx) => {
      const details: string[] = [];
      if (rec.journal_name) details.push(`Journal: ${rec.journal_name}`);
      if (rec.book_title) details.push(`Book: ${rec.book_title}`);
      if (rec.conference_name) details.push(`Event: ${rec.conference_name}`);
      if (rec.volume) details.push(`Vol. ${rec.volume}`);
      if (rec.issue) details.push(`No. ${rec.issue}`);
      if (rec.page_numbers) details.push(`pp. ${rec.page_numbers}`);
      if (rec.publication_year) details.push(`Year: ${rec.publication_year}`);
      if (rec.doi) details.push(`DOI: ${rec.doi}`);
      if (rec.isbn) details.push(`ISBN: ${rec.isbn}`);
      if (rec.issn) details.push(`ISSN: ${rec.issn}`);
      if (rec.event_location) details.push(`Location: ${rec.event_location}`);
      if (rec.event_date) details.push(`Date: ${rec.event_date}`);

      out.push(
        new Paragraph({
          spacing: { before: 140, after: 60 },
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true, color: '0F294A', size: 22 }),
            new TextRun({
              text: rec.title || '(Untitled Entry)',
              bold: true,
              size: 22,
            }),
          ],
        })
      );

      if (rec.authors) {
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Authors: ', bold: true, size: 20, color: '334155' }),
              new TextRun({ text: rec.authors, size: 20 }),
            ],
          })
        );
      }

      if (details.length > 0) {
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: details.join(' | '), size: 20, color: '475569' }),
            ],
          })
        );
      }

      out.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `Original Citation (${rec.source_filename ?? 'MPR'}): `,
              bold: true,
              italics: true,
              size: 18,
              color: '64748B',
            }),
            new TextRun({
              text: rec.original_text,
              italics: true,
              size: 18,
              color: '64748B',
            }),
          ],
        })
      );
    });

    return out;
  };

  const authorSummaryRows = authors.slice(0, 100).map(
    (a) =>
      new TableRow({
        children: [
          a.name,
          String(a.research_papers),
          String(a.book_chapters),
          String(a.conference_contributions),
          String(a.total_records),
        ].map(
          (val) =>
            new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 19 })] })],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          // Title Page
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 1400, after: 200 },
            children: [
              new TextRun({
                text: 'GOVERNMENT OF INDIA · DEPARTMENT OF SPACE',
                bold: true,
                size: 22,
                color: '1E3A8A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: settings.institution_name.toUpperCase(),
                bold: true,
                size: 32,
                color: '0F294A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: settings.report_title,
                bold: true,
                size: 28,
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 },
            children: [
              new TextRun({
                text: `Generated on ${new Date().toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })} · Scope: ${approvedOnly ? 'Approved Records Only' : 'All Extracted Records'}`,
                size: 21,
                color: '475569',
              }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),

          // Compilation Summary
          new Paragraph({
            text: '1. Compilation Summary',
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 180 },
          }),
          buildSummaryTable(),

          ...buildCategoryParagraphs('2. Research Papers', researchPapers),
          ...buildCategoryParagraphs('3. Book Chapters', bookChapters),
          ...buildCategoryParagraphs('4. Conference Proceedings / Seminars', conferences),

          // Author-wise Summary
          new Paragraph({
            text: '5. Author-wise Publication Summary',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 180 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ['Scientist Name', 'Papers', 'Chapters', 'Conferences', 'Total'].map(
                  (hdr) =>
                    new TableCell({
                      shading: { fill: '0F294A' },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: hdr, bold: true, color: 'FFFFFF', size: 20 }),
                          ],
                        }),
                      ],
                    })
                ),
              }),
              ...authorSummaryRows,
            ],
          }),

          // Source MPR References
          new Paragraph({
            text: '6. Source MPR Document References',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 160 },
          }),
          ...allDocuments.map(
            (d, i) =>
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: `${i + 1}. ${d.filename}`,
                    bold: true,
                    size: 20,
                  }),
                  new TextRun({
                    text: ` — Status: ${d.status} · Paragraphs: ${d.total_paragraphs} · Text Boxes: ${d.textbox_count} · Tables: ${d.table_count}`,
                    size: 19,
                    color: '475569',
                  }),
                ],
              })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

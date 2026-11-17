import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import type {
  ContainerType,
  ExtractionDiagnostics,
  SectionType,
} from '../src/types/mpr.ts';

export interface RawExtractedItem {
  paragraphNumber: number;
  containerType: ContainerType;
  xmlSource: string;
  sectionDetected: SectionType;
  rawText: string;
  isHeading: boolean;
}

export interface DocxExtractionResult {
  fileHash: string;
  items: RawExtractedItem[];
  diagnostics: ExtractionDiagnostics;
}

type OrderedXmlNode = Record<string, unknown>;

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
});

function getTagName(node: OrderedXmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') {
      return key;
    }
  }
  return null;
}

function getChildren(node: OrderedXmlNode, tagName: string): OrderedXmlNode[] {
  const val = node[tagName];
  return Array.isArray(val) ? (val as OrderedXmlNode[]) : [];
}

function normalizeHeadingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9/\s&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyHeading(text: string): {
  isHeading: boolean;
  section: SectionType | 'END_SECTION';
} {
  const clean = normalizeHeadingText(text);
  if (!clean || clean.length > 160) {
    return { isHeading: false, section: 'OTHER' };
  }

  // Section IV variations:
  // "IV. Conferences/ Workshops/ Seminars/ Exhibitions"
  // "IV - Conferences, Workshops, Seminars & Exhibitions"
  // "4. Conferences / Seminars / Symposia"
  const secIvRegex =
    /^(?:section\s*)?(?:iv|4)\b[\s.:)-]*(?:.*?(?:conferences?|workshops?|seminars?|exhibitions?|symposi(?:a|ums?)))/i;
  if (secIvRegex.test(clean)) {
    return { isHeading: true, section: 'SECTION_IV' };
  }

  // Section V variations:
  // "V. Research Papers/ Reports Published"
  // "V - Research Papers, Book Chapters & Technical Reports"
  // "5. Publications / Research Papers"
  const secVRegex =
    /^(?:section\s*)?(?:v|5)\b[\s.:)-]*(?:.*?(?:research\s*papers?|publications?|reports?\s*published|book\s*chapters?|papers?\s*published))/i;
  if (secVRegex.test(clean)) {
    return { isHeading: true, section: 'SECTION_V' };
  }

  // Subsequent sections (VI, VII, VIII, IX, X...) terminate Section V
  const laterSectionRegex =
    /^(?:section\s*)?(?:vi|vii|viii|ix|x|6|7|8|9|10)\b[\s.:)-]+[a-z]{3,}/i;
  if (laterSectionRegex.test(clean)) {
    return { isHeading: true, section: 'END_SECTION' };
  }

  // Earlier sections (I, II, III)
  const earlierSectionRegex =
    /^(?:section\s*)?(?:i|ii|iii|1|2|3)\b[\s.:)-]+[a-z]{3,}/i;
  if (earlierSectionRegex.test(clean)) {
    return { isHeading: true, section: 'END_SECTION' };
  }

  return { isHeading: false, section: 'OTHER' };
}

function extractParagraphText(pChildren: OrderedXmlNode[]): string {
  const parts: string[] = [];

  function walkRuns(nodes: OrderedXmlNode[]) {
    for (const node of nodes) {
      const tag = getTagName(node);
      if (!tag) continue;

      if (tag === 'mc:AlternateContent') {
        const mcChildren = getChildren(node, tag);
        const choice = mcChildren.find((c) => getTagName(c) === 'mc:Choice');
        const fallback = mcChildren.find((c) => getTagName(c) === 'mc:Fallback');
        if (choice) {
          walkRuns(getChildren(choice, 'mc:Choice'));
        } else if (fallback) {
          walkRuns(getChildren(fallback, 'mc:Fallback'));
        }
        continue;
      }

      // Do not flatten nested textboxes inside the outer paragraph's own text;
      // nested textboxes are emitted as their own items in document order.
      if (tag === 'w:txbxContent' || tag === 'v:textbox' || tag === 'wps:txbx') {
        continue;
      }

      if (tag === 'w:t' || tag === 'w:delText') {
        const tChildren = getChildren(node, tag);
        for (const tc of tChildren) {
          if (typeof tc['#text'] === 'string') {
            parts.push(tc['#text']);
          }
        }
      } else if (tag === 'w:tab') {
        parts.push(' ');
      } else if (tag === 'w:br' || tag === 'w:cr') {
        parts.push(' ');
      } else {
        walkRuns(getChildren(node, tag));
      }
    }
  }

  walkRuns(pChildren);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function isTableHeaderRow(cells: string[]): boolean {
  if (cells.length === 0) return true;
  const joined = cells.join(' ').toLowerCase();
  if (joined.length > 140) return false;
  const headerKeywords = [
    'sl. no',
    'sl no',
    's. no',
    's.no',
    'particulars',
    'title of paper',
    'name of conference',
    'venue',
    'author(s)',
    'remarks',
  ];
  let matches = 0;
  for (const kw of headerKeywords) {
    if (joined.includes(kw)) matches++;
  }
  return matches >= 2 || /^(?:sl\.?\s*no\.?|s\.?\s*no\.?)$/i.test(cells[0]?.trim() ?? '');
}

function isBoilerplateText(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length < 3) return true;
  if (/^(?:nil|none|na|n\/a|-+|—+)$/i.test(clean)) return true;
  if (/^page\s*\d+(\s*of\s*\d+)?$/i.test(clean)) return true;
  return false;
}

export function extractDocxBuffer(buffer: Buffer, filename: string): DocxExtractionResult {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const diagnostics: ExtractionDiagnostics = {
    xmlFilesScanned: [],
    totalParagraphs: 0,
    normalParagraphs: 0,
    drawingMlTextBoxes: 0,
    vmlTextBoxes: 0,
    tableCells: 0,
    headerFooterItems: 0,
    sectionIvFound: false,
    sectionIvLocation: null,
    sectionVFound: false,
    sectionVLocation: null,
    sectionIvItemCount: 0,
    sectionVItemCount: 0,
    warnings: [],
    errors: [],
  };

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    diagnostics.errors.push(
      `Invalid DOCX/ZIP archive (${filename}): ${err instanceof Error ? err.message : String(err)}`
    );
    return { fileHash, items: [], diagnostics };
  }

  const entries = zip.getEntries();
  const entryMap = new Map(entries.map((e) => [e.entryName, e]));

  const xmlPaths: string[] = [];
  if (entryMap.has('word/document.xml')) {
    xmlPaths.push('word/document.xml');
  } else {
    diagnostics.errors.push('Missing word/document.xml inside DOCX archive.');
  }

  const headerPaths = entries
    .map((e) => e.entryName)
    .filter((n) => /^word\/header\d*\.xml$/i.test(n))
    .sort();
  const footerPaths = entries
    .map((e) => e.entryName)
    .filter((n) => /^word\/footer\d*\.xml$/i.test(n))
    .sort();

  xmlPaths.push(...headerPaths, ...footerPaths);

  const items: RawExtractedItem[] = [];
  let paragraphCounter = 0;

  for (const xmlPath of xmlPaths) {
    const entry = entryMap.get(xmlPath);
    if (!entry) continue;
    diagnostics.xmlFilesScanned.push(xmlPath);

    let parsed: OrderedXmlNode[];
    try {
      const xmlStr = entry.getData().toString('utf8');
      parsed = xmlParser.parse(xmlStr) as OrderedXmlNode[];
    } catch (err) {
      diagnostics.errors.push(
        `Failed parsing ${xmlPath}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    const isHeader = /^word\/header/i.test(xmlPath);
    const isFooter = /^word\/footer/i.test(xmlPath);
    let currentSection: SectionType = 'OTHER';

    const recordItem = (
      text: string,
      containerType: ContainerType
    ) => {
      if (isBoilerplateText(text)) return;

      const headingInfo = classifyHeading(text);
      if (headingInfo.isHeading) {
        if (headingInfo.section === 'SECTION_IV') {
          currentSection = 'SECTION_IV';
          if (!diagnostics.sectionIvFound) {
            diagnostics.sectionIvFound = true;
            diagnostics.sectionIvLocation = `${xmlPath} (${containerType})`;
          }
        } else if (headingInfo.section === 'SECTION_V') {
          currentSection = 'SECTION_V';
          if (!diagnostics.sectionVFound) {
            diagnostics.sectionVFound = true;
            diagnostics.sectionVLocation = `${xmlPath} (${containerType})`;
          }
        } else {
          currentSection = 'OTHER';
        }
      }

      paragraphCounter++;
      diagnostics.totalParagraphs++;
      if (containerType === 'paragraph') diagnostics.normalParagraphs++;
      if (containerType === 'textbox_drawingml') diagnostics.drawingMlTextBoxes++;
      if (containerType === 'textbox_vml') diagnostics.vmlTextBoxes++;
      if (containerType === 'table') diagnostics.tableCells++;
      if (isHeader || isFooter) diagnostics.headerFooterItems++;

      if (!headingInfo.isHeading) {
        if (currentSection === 'SECTION_IV') diagnostics.sectionIvItemCount++;
        if (currentSection === 'SECTION_V') diagnostics.sectionVItemCount++;
      }

      items.push({
        paragraphNumber: paragraphCounter,
        containerType,
        xmlSource: xmlPath,
        sectionDetected: headingInfo.isHeading && headingInfo.section === 'END_SECTION' ? 'OTHER' : currentSection,
        rawText: text,
        isHeading: headingInfo.isHeading,
      });
    };

    function walkNodes(
      nodes: OrderedXmlNode[],
      activeTextboxKind: 'textbox_drawingml' | 'textbox_vml' | null,
      insideTable: boolean
    ) {
      for (const node of nodes) {
        const tag = getTagName(node);
        if (!tag) continue;
        const children = getChildren(node, tag);

        if (tag === 'mc:AlternateContent') {
          const choice = children.find((c) => getTagName(c) === 'mc:Choice');
          const fallback = children.find((c) => getTagName(c) === 'mc:Fallback');
          if (choice) {
            walkNodes(getChildren(choice, 'mc:Choice'), activeTextboxKind, insideTable);
          } else if (fallback) {
            walkNodes(getChildren(fallback, 'mc:Fallback'), activeTextboxKind, insideTable);
          }
          continue;
        }

        if (tag === 'wps:txbx') {
          walkNodes(children, 'textbox_drawingml', insideTable);
          continue;
        }

        if (tag === 'v:textbox') {
          walkNodes(children, 'textbox_vml', insideTable);
          continue;
        }

        if (tag === 'w:txbxContent') {
          const tbKind = activeTextboxKind ?? 'textbox_drawingml';
          walkNodes(children, tbKind, insideTable);
          continue;
        }

        if (tag === 'w:tbl' && !activeTextboxKind) {
          // Process table rows cleanly so multi-column publication rows stay together
          for (const tblChild of children) {
            const tblChildTag = getTagName(tblChild);
            if (tblChildTag === 'w:tr') {
              const rowCells: string[] = [];
              const trChildren = getChildren(tblChild, 'w:tr');
              for (const trChild of trChildren) {
                if (getTagName(trChild) === 'w:tc') {
                  const tcChildren = getChildren(trChild, 'w:tc');
                  const cellParagraphs: string[] = [];
                  for (const tcChild of tcChildren) {
                    const tcTag = getTagName(tcChild);
                    if (tcTag === 'w:p') {
                      const pTxt = extractParagraphText(getChildren(tcChild, 'w:p'));
                      if (pTxt) cellParagraphs.push(pTxt);
                      // Also walk any nested textboxes inside table cell paragraphs
                      walkNestedTextboxes(getChildren(tcChild, 'w:p'));
                    } else if (tcTag === 'w:tbl') {
                      walkNodes([tcChild], activeTextboxKind, true);
                    }
                  }
                  if (cellParagraphs.length > 0) {
                    rowCells.push(cellParagraphs.join(' '));
                  }
                }
              }

              if (rowCells.length > 0 && !isTableHeaderRow(rowCells)) {
                // Drop pure serial-number prefix cell like "1." or "1" when merging row
                const cleanedCells =
                  rowCells.length > 1 && /^\d{1,3}\.?$/.test(rowCells[0].trim())
                    ? rowCells.slice(1)
                    : rowCells;
                const rowText = cleanedCells.join(' — ').trim();
                const effectiveType: ContainerType = isHeader
                  ? 'header'
                  : isFooter
                  ? 'footer'
                  : 'table';
                recordItem(rowText, effectiveType);
              }
            }
          }
          continue;
        }

        if (tag === 'w:p') {
          const text = extractParagraphText(children);
          if (text) {
            const effectiveType: ContainerType = activeTextboxKind
              ? activeTextboxKind
              : isHeader
              ? 'header'
              : isFooter
              ? 'footer'
              : insideTable
              ? 'table'
              : 'paragraph';
            recordItem(text, effectiveType);
          }
          // Walk nested shapes/textboxes anchored inside this paragraph
          walkNestedTextboxes(children);
          continue;
        }

        walkNodes(children, activeTextboxKind, insideTable);
      }
    }

    function walkNestedTextboxes(nodes: OrderedXmlNode[]) {
      for (const node of nodes) {
        const tag = getTagName(node);
        if (!tag) continue;
        const children = getChildren(node, tag);

        if (tag === 'mc:AlternateContent') {
          const choice = children.find((c) => getTagName(c) === 'mc:Choice');
          const fallback = children.find((c) => getTagName(c) === 'mc:Fallback');
          if (choice) {
            walkNestedTextboxes(getChildren(choice, 'mc:Choice'));
          } else if (fallback) {
            walkNestedTextboxes(getChildren(fallback, 'mc:Fallback'));
          }
          continue;
        }

        if (tag === 'wps:txbx') {
          walkNodes(children, 'textbox_drawingml', false);
        } else if (tag === 'v:textbox') {
          walkNodes(children, 'textbox_vml', false);
        } else if (tag === 'w:txbxContent') {
          walkNodes(children, 'textbox_drawingml', false);
        } else {
          walkNestedTextboxes(children);
        }
      }
    }

    walkNodes(parsed, null, false);
  }

  if (!diagnostics.sectionIvFound) {
    diagnostics.warnings.push(
      'Section IV (Conferences/Workshops/Seminars/Exhibitions) heading was not detected in document, headers, or text boxes.'
    );
  }
  if (!diagnostics.sectionVFound) {
    diagnostics.warnings.push(
      'Section V (Research Papers/Reports Published) heading was not detected in document, headers, or text boxes.'
    );
  }
  if (diagnostics.totalParagraphs === 0) {
    diagnostics.warnings.push(
      'No readable text paragraphs were extracted from this DOCX archive.'
    );
  }

  return { fileHash, items, diagnostics };
}

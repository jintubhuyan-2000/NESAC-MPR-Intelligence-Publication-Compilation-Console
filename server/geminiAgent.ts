import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { PublicationCategory, SectionType } from '../src/types/mpr.ts';

export interface ExtractionInputItem {
  paragraphId: number;
  sourceFilename: string;
  sourceSection: SectionType;
  containerType: string;
  rawText: string;
}

export interface ExtractedMetadataResult {
  paragraphId: number;
  isValidPublicationOrActivity: boolean;
  category: PublicationCategory;
  confidence: number;
  reasoning: string;
  title: string;
  authors: string;
  journalName: string;
  bookTitle: string;
  conferenceName: string;
  publicationYear: string;
  doi: string;
  isbn: string;
  issn: string;
  volume: string;
  issue: string;
  pageNumbers: string;
  presentationType: string;
  eventLocation: string;
  eventDate: string;
  publicationType: string;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or enable Local-Only Mode in Settings.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_CATEGORIES = new Set<PublicationCategory>([
  'Research Papers',
  'Book Chapters',
  'Conference Proceedings/Seminars',
  'Review Required',
]);

function sanitizeCategory(val: string): PublicationCategory {
  if (VALID_CATEGORIES.has(val as PublicationCategory)) {
    return val as PublicationCategory;
  }
  const lower = (val || '').toLowerCase();
  if (lower.includes('book') && lower.includes('chapter')) return 'Book Chapters';
  if (lower.includes('research') || lower.includes('journal') || lower.includes('paper')) {
    return 'Research Papers';
  }
  if (
    lower.includes('conference') ||
    lower.includes('seminar') ||
    lower.includes('workshop') ||
    lower.includes('symposium') ||
    lower.includes('proceeding')
  ) {
    return 'Conference Proceedings/Seminars';
  }
  return 'Review Required';
}

export async function extractWithGeminiBatch(
  items: ExtractionInputItem[]
): Promise<ExtractedMetadataResult[]> {
  if (items.length === 0) return [];

  const ai = getAiClient();
  const batchSize = 8;
  const results: ExtractedMetadataResult[] = [];

  const systemInstruction = `You are the NESAC (North Eastern Space Applications Centre) Monthly Progress Report (MPR) Scientific Publication Extraction and Classification Agent.

Your task is to analyze extracted text entries from Section IV (Conferences/Workshops/Seminars/Exhibitions) and Section V (Research Papers/Reports Published) of monthly MPR Word documents.

STRICT RULES:
1. NEVER invent, guess, or fabricate metadata. If a field (DOI, ISBN, ISSN, volume, issue, pageNumbers, eventDate, etc.) is NOT explicitly present in the source text, return an empty string "".
2. Preserve author names and initials exactly as written in the original text (comma-separated if multiple authors).
3. Classify each valid entry into EXACTLY ONE category:
   - "Research Papers": Journal articles, peer-reviewed research papers, published scientific articles.
   - "Book Chapters": Chapters published inside edited books or monographs (look for "In:", "Book Chapter", "Ed.", "Eds.", "ISBN", "Chapter", publisher book title).
   - "Conference Proceedings/Seminars": Conference papers, symposium/workshop presentations, invited talks, seminars, exhibitions, proceedings.
   - "Review Required": Temporary review status ONLY for ambiguous items, internal technical reports without clear publication status, or incomplete citations that need human verification.
4. Section context matters (Section IV usually holds conferences/seminars, Section V usually holds research papers/reports), BUT do NOT classify solely by section if the text clearly indicates another category (e.g. a book chapter or conference proceedings paper placed inside Section V, or a journal paper noted in Section IV).
5. If an item is purely administrative filler, a generic section subtitle, or not a publication/conference activity, set isValidPublicationOrActivity = false.
6. Provide a calibrated confidence score (0.0 to 1.0) and concise reasoning explaining both the category choice and any ambiguity.`;

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);

    const promptPayload = chunk.map((it) => ({
      paragraphId: it.paragraphId,
      sourceFilename: it.sourceFilename,
      sourceSection: it.sourceSection,
      containerType: it.containerType,
      text: it.rawText,
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze and extract structured publication/conference metadata for the following ${chunk.length} MPR entries:\n\n${JSON.stringify(
        promptPayload,
        null,
        2
      )}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              paragraphId: { type: Type.INTEGER },
              isValidPublicationOrActivity: { type: Type.BOOLEAN },
              category: {
                type: Type.STRING,
                description:
                  'Must be one of: "Research Papers", "Book Chapters", "Conference Proceedings/Seminars", or "Review Required"',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Confidence score between 0.0 and 1.0',
              },
              reasoning: { type: Type.STRING },
              title: { type: Type.STRING },
              authors: { type: Type.STRING },
              journalName: { type: Type.STRING },
              bookTitle: { type: Type.STRING },
              conferenceName: { type: Type.STRING },
              publicationYear: { type: Type.STRING },
              doi: { type: Type.STRING },
              isbn: { type: Type.STRING },
              issn: { type: Type.STRING },
              volume: { type: Type.STRING },
              issue: { type: Type.STRING },
              pageNumbers: { type: Type.STRING },
              presentationType: { type: Type.STRING },
              eventLocation: { type: Type.STRING },
              eventDate: { type: Type.STRING },
              publicationType: { type: Type.STRING },
            },
            required: [
              'paragraphId',
              'isValidPublicationOrActivity',
              'category',
              'confidence',
              'reasoning',
              'title',
              'authors',
            ],
          },
        },
      },
    });

    const jsonText = (response.text ?? '[]').trim();
    let parsed: Array<Partial<ExtractedMetadataResult>> = [];
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Gemini returned malformed JSON response during batch extraction.');
    }

    const byId = new Map(parsed.map((p) => [p.paragraphId, p]));
    for (const src of chunk) {
      const item = byId.get(src.paragraphId);
      if (!item) {
        results.push(localDeterministicExtract(src, 'Fallback after missing batch item'));
        continue;
      }
      results.push({
        paragraphId: src.paragraphId,
        isValidPublicationOrActivity: item.isValidPublicationOrActivity ?? true,
        category: sanitizeCategory(item.category ?? 'Review Required'),
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.75))),
        reasoning: item.reasoning ?? '',
        title: (item.title ?? '').trim(),
        authors: (item.authors ?? '').trim(),
        journalName: (item.journalName ?? '').trim(),
        bookTitle: (item.bookTitle ?? '').trim(),
        conferenceName: (item.conferenceName ?? '').trim(),
        publicationYear: (item.publicationYear ?? '').trim(),
        doi: (item.doi ?? '').trim(),
        isbn: (item.isbn ?? '').trim(),
        issn: (item.issn ?? '').trim(),
        volume: (item.volume ?? '').trim(),
        issue: (item.issue ?? '').trim(),
        pageNumbers: (item.pageNumbers ?? '').trim(),
        presentationType: (item.presentationType ?? '').trim(),
        eventLocation: (item.eventLocation ?? '').trim(),
        eventDate: (item.eventDate ?? '').trim(),
        publicationType: (item.publicationType ?? '').trim(),
      });
    }
  }

  return results;
}

export function localDeterministicExtract(
  item: ExtractionInputItem,
  reasonPrefix = 'Local-Only Mode deterministic extraction (no external API call)'
): ExtractedMetadataResult {
  const text = item.rawText.trim();
  const lower = text.toLowerCase();

  if (
    /^(?:nesac|north\s+eastern\s+space\s+applications\s+centre).*monthly\s+progress\s+report/i.test(
      text
    ) &&
    text.length < 110
  ) {
    return {
      paragraphId: item.paragraphId,
      isValidPublicationOrActivity: false,
      category: 'Review Required',
      confidence: 0.95,
      reasoning: 'Header/title banner excluded.',
      title: '',
      authors: '',
      journalName: '',
      bookTitle: '',
      conferenceName: '',
      publicationYear: '',
      doi: '',
      isbn: '',
      issn: '',
      volume: '',
      issue: '',
      pageNumbers: '',
      presentationType: '',
      eventLocation: '',
      eventDate: '',
      publicationType: '',
    };
  }

  const doiMatch = text.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
  const isbnMatch = text.match(/isbn[:\s-]*([0-9Xx-]{10,17})/i);
  const issnMatch = text.match(/issn[:\s-]*([0-9Xx-]{8,9})/i);
  const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
  const volMatch = text.match(/\b(?:vol\.?|volume)\s*([0-9]+[A-Za-z]?)/i);
  const issueMatch = text.match(/\b(?:no\.?|issue)\s*([0-9]+(?:\([0-9]+\))?)/i);
  const pagesMatch = text.match(/\b(?:pp?\.?|pages?)\s*([0-9]+\s*[-–]\s*[0-9]+)/i);

  let category: PublicationCategory = 'Review Required';
  let confidence = 0.62;
  let reasoning = `${reasonPrefix}. `;

  const isBookChapter =
    lower.includes('book chapter') ||
    lower.includes('isbn') ||
    /\bin:\s/i.test(text) ||
    /\b(?:eds?\.|edited by)\b/i.test(text);

  const isConference =
    lower.includes('conference') ||
    lower.includes('seminar') ||
    lower.includes('workshop') ||
    lower.includes('symposium') ||
    lower.includes('proceedings') ||
    lower.includes('exhibition') ||
    lower.includes('presented') ||
    lower.includes('invited talk') ||
    lower.includes('keynote');

  const isResearchPaper =
    lower.includes('journal') ||
    lower.includes('doi') ||
    lower.includes('issn') ||
    lower.includes('vol.') ||
    lower.includes('impact factor') ||
    lower.includes('published in') ||
    lower.includes('remote sensing');

  const isAmbiguousReport =
    (lower.includes('internal report') ||
      lower.includes('technical note') ||
      lower.includes('draft') ||
      lower.includes('submitted') ||
      lower.includes('under preparation')) &&
    !doiMatch &&
    !isConference;

  if (isAmbiguousReport) {
    category = 'Review Required';
    confidence = 0.48;
    reasoning += 'Flagged as Review Required because publication status appears preliminary or internal.';
  } else if (isBookChapter) {
    category = 'Book Chapters';
    confidence = 0.82;
    reasoning += 'Identified edited book / ISBN / chapter markers.';
  } else if (isConference && (!isResearchPaper || item.sourceSection === 'SECTION_IV')) {
    category = 'Conference Proceedings/Seminars';
    confidence = 0.84;
    reasoning += 'Identified conference, seminar, symposium, or workshop indicators.';
  } else if (isResearchPaper) {
    category = 'Research Papers';
    confidence = 0.85;
    reasoning += 'Identified journal, DOI, volume, or published research paper indicators.';
  } else if (item.sourceSection === 'SECTION_IV') {
    category = 'Conference Proceedings/Seminars';
    confidence = 0.66;
    reasoning += 'Derived from Section IV context.';
  } else if (item.sourceSection === 'SECTION_V') {
    category = 'Review Required';
    confidence = 0.5;
    reasoning += 'Extracted from Section V without clear journal/book/conference identifiers; flagged for human review.';
  }

  // Heuristic title & authors extraction
  const quotedTitle = text.match(/[“"]([^”"]{8,220})[”"]/);
  let title = quotedTitle ? quotedTitle[1].trim() : '';
  let authors = '';

  const splitParts = text.split(/\.\s+/);
  if (!title && splitParts.length >= 2) {
    // Check if first segment looks like authors
    if (splitParts[0].length < 130 && (splitParts[0].includes(',') || /\b[A-Z]\./.test(splitParts[0]))) {
      authors = splitParts[0].trim();
      title = splitParts[1].trim();
    } else {
      title = splitParts[0].trim();
    }
  } else if (quotedTitle && quotedTitle.index && quotedTitle.index > 3) {
    authors = text.slice(0, quotedTitle.index).replace(/[.,:\s]+$/, '').trim();
  }

  if (!title) {
    title = text.slice(0, 140).trim();
  }

  return {
    paragraphId: item.paragraphId,
    isValidPublicationOrActivity: true,
    category,
    confidence,
    reasoning,
    title,
    authors,
    journalName: category === 'Research Papers' ? extractVenue(text, ['journal of', 'international journal', 'ieee', 'current science', 'geocarto', 'remote sensing']) : '',
    bookTitle: category === 'Book Chapters' ? extractAfterMarker(text, /\bin:\s*([^,.(]+)/i) : '',
    conferenceName: category === 'Conference Proceedings/Seminars' ? extractVenue(text, ['conference', 'seminar', 'workshop', 'symposium', 'exhibition']) : '',
    publicationYear: yearMatch ? yearMatch[1] : '',
    doi: doiMatch ? doiMatch[1].replace(/[.,;)]+$/, '') : '',
    isbn: isbnMatch ? isbnMatch[1].trim() : '',
    issn: issnMatch ? issnMatch[1].trim() : '',
    volume: volMatch ? volMatch[1].trim() : '',
    issue: issueMatch ? issueMatch[1].trim() : '',
    pageNumbers: pagesMatch ? pagesMatch[1].replace(/\s+/g, '') : '',
    presentationType: lower.includes('oral') ? 'Oral' : lower.includes('poster') ? 'Poster' : lower.includes('keynote') ? 'Keynote' : lower.includes('invited') ? 'Invited Talk' : '',
    eventLocation: '',
    eventDate: '',
    publicationType: category === 'Research Papers' ? 'Journal Article' : category === 'Book Chapters' ? 'Book Chapter' : category === 'Conference Proceedings/Seminars' ? 'Conference/Seminar' : 'Report / Unverified',
  };
}

function extractAfterMarker(text: string, regex: RegExp): string {
  const m = text.match(regex);
  return m ? m[1].trim() : '';
}

function extractVenue(text: string, keywords: string[]): string {
  const segments = text.split(/[.,;]/).map((s) => s.trim());
  for (const seg of segments) {
    const low = seg.toLowerCase();
    if (keywords.some((kw) => low.includes(kw)) && seg.length > 6 && seg.length < 160) {
      return seg;
    }
  }
  return '';
}

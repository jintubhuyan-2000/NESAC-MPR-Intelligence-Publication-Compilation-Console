export type PublicationCategory =
  | 'Research Papers'
  | 'Book Chapters'
  | 'Conference Proceedings/Seminars'
  | 'Review Required';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export type DuplicateStatus = 'unique' | 'possible_duplicate' | 'confirmed_duplicate';

export type ContainerType =
  | 'paragraph'
  | 'textbox_drawingml'
  | 'textbox_vml'
  | 'table'
  | 'header'
  | 'footer';

export type SectionType = 'SECTION_IV' | 'SECTION_V' | 'OTHER';

export interface ExtractionDiagnostics {
  xmlFilesScanned: string[];
  totalParagraphs: number;
  normalParagraphs: number;
  drawingMlTextBoxes: number;
  vmlTextBoxes: number;
  tableCells: number;
  headerFooterItems: number;
  sectionIvFound: boolean;
  sectionIvLocation: string | null;
  sectionVFound: boolean;
  sectionVLocation: string | null;
  sectionIvItemCount: number;
  sectionVItemCount: number;
  warnings: string[];
  errors: string[];
}

export interface MprDocument {
  id: number;
  filename: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  source_mode: 'server_upload' | 'local_agent' | 'test_suite';
  status: 'pending' | 'extracted' | 'processed' | 'error';
  total_paragraphs: number;
  section_iv_found: number;
  section_v_found: number;
  textbox_count: number;
  table_count: number;
  header_footer_count: number;
  diagnostics_json: string;
  created_at: string;
  processed_at: string | null;
}

export interface ExtractedParagraph {
  id: number;
  document_id: number;
  paragraph_number: number;
  container_type: ContainerType;
  xml_source: string;
  section_detected: SectionType;
  raw_text: string;
  is_heading: number;
}

export interface PublicationRecord {
  id: number;
  document_id: number;
  source_filename?: string;
  paragraph_id: number | null;
  paragraph_number?: number | null;
  container_type?: ContainerType | null;
  original_text: string;
  source_section: SectionType;
  category: PublicationCategory;
  ai_category: PublicationCategory;
  ai_confidence: number;
  ai_reasoning: string;
  title: string;
  authors: string;
  journal_name: string;
  book_title: string;
  conference_name: string;
  publication_year: string;
  doi: string;
  isbn: string;
  issn: string;
  volume: string;
  issue: string;
  page_numbers: string;
  presentation_type: string;
  event_location: string;
  event_date: string;
  publication_type: string;
  review_status: ReviewStatus;
  duplicate_status: DuplicateStatus;
  master_record_id: number | null;
  duplicate_group_id: string | null;
  duplicate_score: number;
  duplicate_reason: string;
  created_at: string;
  updated_at: string;
}

export interface AuthorProfile {
  id: number;
  name: string;
  normalized_name: string;
  division: string;
  notes: string;
  total_records: number;
  research_papers: number;
  book_chapters: number;
  conference_contributions: number;
  review_required: number;
  year_breakdown: Record<string, number>;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  record_id: number;
  action: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  actor: string;
  notes: string;
  created_at: string;
}

export interface AppSettings {
  default_windows_folder: string;
  local_agent_url: string;
  local_only_mode: boolean;
  require_transmission_consent: boolean;
  institution_name: string;
  report_title: string;
}

export interface DashboardSummary {
  totalDocuments: number;
  documentsProcessed: number;
  documentsPending: number;
  totalExtractedEntries: number;
  researchPapers: number;
  bookChapters: number;
  conferenceContributions: number;
  reviewRequired: number;
  pendingReviews: number;
  approvedRecords: number;
  rejectedRecords: number;
  flaggedRecords: number;
  possibleDuplicates: number;
  confirmedDuplicates: number;
  yearDistribution: Array<{ year: string; researchPapers: number; bookChapters: number; conferences: number }>;
  monthlyDocuments: Array<{ filename: string; researchPapers: number; bookChapters: number; conferences: number; reviewRequired: number }>;
}

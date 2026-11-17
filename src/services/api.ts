import type {
  AppSettings,
  AuditLogEntry,
  AuthorProfile,
  DashboardSummary,
  ExtractionDiagnostics,
  MprDocument,
  PublicationRecord,
  ReviewStatus,
} from '../types/mpr.ts';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
      else if (body?.detail) msg = body.detail;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getDashboard: () => apiJson<DashboardSummary>('/api/dashboard'),

  getDocuments: () => apiJson<{ documents: MprDocument[] }>('/api/documents'),

  getDocumentDiagnostics: (id: number) =>
    apiJson<{
      document: MprDocument;
      diagnostics: ExtractionDiagnostics;
      paragraphs: Array<{
        id: number;
        paragraph_number: number;
        container_type: string;
        xml_source: string;
        section_detected: string;
        raw_text: string;
        is_heading: number;
      }>;
    }>(`/api/documents/${id}/diagnostics`),

  deleteDocument: (id: number) =>
    apiJson<{ ok: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),

  uploadDocuments: async (files: FileList | File[]) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    return apiJson<{
      uploaded: Array<{
        filename: string;
        documentId: number;
        alreadyExists: boolean;
        diagnostics: ExtractionDiagnostics;
      }>;
      ignoredTemp?: string[];
      ignoredOther?: string[];
    }>('/api/documents/upload', { method: 'POST', body: fd });
  },

  syncLocalDocuments: (documents: unknown[]) =>
    apiJson<{
      synced: Array<{ filename: string; documentId: number; alreadyExists: boolean }>;
    }>('/api/documents/sync-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
    }),

  previewTransmission: (documentIds: number[]) =>
    apiJson<{
      items: Array<{
        id: number;
        filename: string;
        section_detected: string;
        container_type: string;
        raw_text: string;
      }>;
    }>('/api/documents/preview-transmission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds }),
    }),

  processDocuments: (documentIds: number[], mode: 'gemini' | 'local') =>
    apiJson<{
      outcomes: Array<{
        documentId: number;
        processedCount: number;
        usedMode: 'gemini' | 'local';
      }>;
    }>('/api/documents/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds, mode }),
    }),

  runTestSuite: (processWithAi: boolean) =>
    apiJson<{
      suiteResults: Array<{
        filename: string;
        documentId: number;
        alreadyExists: boolean;
        diagnostics: ExtractionDiagnostics;
        processedCount: number;
        usedMode: 'gemini' | 'local';
      }>;
    }>('/api/test-suite/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processWithAi }),
    }),

  getRecords: (params?: {
    category?: string;
    review_status?: string;
    duplicate_status?: string;
    search?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.category) sp.set('category', params.category);
    if (params?.review_status) sp.set('review_status', params.review_status);
    if (params?.duplicate_status) sp.set('duplicate_status', params.duplicate_status);
    if (params?.search) sp.set('search', params.search);
    return apiJson<{ records: PublicationRecord[] }>(`/api/records?${sp.toString()}`);
  },

  updateRecord: (id: number, patch: Partial<PublicationRecord> & { notes?: string }) =>
    apiJson<{ record: PublicationRecord }>(`/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  bulkReview: (recordIds: number[], reviewStatus: ReviewStatus, notes?: string) =>
    apiJson<{ updated: number }>('/api/records/bulk-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordIds, reviewStatus, notes }),
    }),

  getRecordAudit: (id: number) =>
    apiJson<{ logs: AuditLogEntry[] }>(`/api/records/${id}/audit`),

  getDuplicates: () =>
    apiJson<{
      groups: Array<{
        groupId: string;
        masterRecordId: number;
        status: string;
        items: PublicationRecord[];
      }>;
    }>('/api/duplicates'),

  selectMasterDuplicate: (groupId: string, masterRecordId: number) =>
    apiJson<{ ok: boolean }>('/api/duplicates/select-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, masterRecordId }),
    }),

  markDuplicateUnique: (recordId: number) =>
    apiJson<{ ok: boolean }>('/api/duplicates/mark-unique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId }),
    }),

  getAuthors: (q = '') =>
    apiJson<{ authors: AuthorProfile[] }>(
      `/api/authors?q=${encodeURIComponent(q)}`
    ),

  getAuthorRecords: (id: number) =>
    apiJson<{
      author: { id: number; name: string; division: string; notes: string };
      records: PublicationRecord[];
    }>(`/api/authors/${id}/records`),

  updateAuthor: (id: number, data: { name: string; division?: string; notes?: string }) =>
    apiJson<{ ok: boolean }>(`/api/authors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getSettings: () =>
    apiJson<{ settings: AppSettings; geminiConfigured: boolean }>('/api/settings'),

  updateSettings: (settings: Partial<AppSettings>) =>
    apiJson<{ settings: AppSettings }>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
};

// Localhost Python Agent Client (communicates directly with user's Windows 10/11 agent on 127.0.0.1:8765)
export const localAgentClient = {
  checkHealth: async (baseUrl: string) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      mode: 'cors',
    });
    if (!res.ok) throw new Error('Local Python agent unreachable');
    return res.json() as Promise<{
      status: string;
      agent: string;
      version: string;
      os: string;
      python: string;
      default_folder: string;
      default_folder_exists: boolean;
    }>;
  },

  scanFolder: async (baseUrl: string, folderPath: string) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/scan`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-NESAC-Local-Agent': 'nesac-mpr-v1',
      },
      body: JSON.stringify({ folder_path: folderPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Folder scan failed (${res.status})`);
    }
    return res.json() as Promise<{
      folder_path: string;
      files: Array<{
        filename: string;
        file_path: string;
        file_size: number;
        modified_at: string;
        file_hash: string;
      }>;
      ignored_temporary_files: string[];
      total_found: number;
    }>;
  },

  extractFiles: async (baseUrl: string, filePaths: string[]) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-NESAC-Local-Agent': 'nesac-mpr-v1',
      },
      body: JSON.stringify({ file_paths: filePaths }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Local extraction failed (${res.status})`);
    }
    return res.json() as Promise<{ extracted: unknown[] }>;
  },

  exportViaLocalAgent: async (
    baseUrl: string,
    format: 'xlsx' | 'docx',
    records: PublicationRecord[],
    approvedOnly: boolean
  ) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/export/${format}`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-NESAC-Local-Agent': 'nesac-mpr-v1',
      },
      body: JSON.stringify({ records, approved_only: approvedOnly }),
    });
    if (!res.ok) {
      throw new Error(`Local agent ${format.toUpperCase()} export failed`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESAC_MPR_Local_${approvedOnly ? 'Approved' : 'All'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

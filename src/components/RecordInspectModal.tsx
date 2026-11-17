import { useEffect, useState } from 'react';
import { Check, Flag, History, Save, X } from 'lucide-react';
import { api } from '../services/api.ts';
import type {
  AuditLogEntry,
  PublicationCategory,
  PublicationRecord,
  ReviewStatus,
} from '../types/mpr.ts';

interface Props {
  record: PublicationRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES: PublicationCategory[] = [
  'Research Papers',
  'Book Chapters',
  'Conference Proceedings/Seminars',
  'Review Required',
];

export function RecordInspectModal({ record, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<PublicationRecord>>({});
  const [notes, setNotes] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!record) return;
    setForm({
      category: record.category,
      title: record.title,
      authors: record.authors,
      journal_name: record.journal_name,
      book_title: record.book_title,
      conference_name: record.conference_name,
      publication_year: record.publication_year,
      doi: record.doi,
      isbn: record.isbn,
      issn: record.issn,
      volume: record.volume,
      issue: record.issue,
      page_numbers: record.page_numbers,
      presentation_type: record.presentation_type,
      event_location: record.event_location,
      event_date: record.event_date,
      publication_type: record.publication_type,
      review_status: record.review_status,
    });
    setNotes('');
    setError('');
    api
      .getRecordAudit(record.id)
      .then((res) => setAuditLogs(res.logs))
      .catch(() => setAuditLogs([]));
  }, [record]);

  if (!record) return null;

  const handleSave = async (overrideStatus?: ReviewStatus) => {
    setSaving(true);
    setError('');
    try {
      await api.updateRecord(record.id, {
        ...form,
        review_status: overrideStatus ?? form.review_status,
        notes,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#0F294A] px-6 py-4 text-white">
          <div>
            <h2 className="text-base font-semibold">
              Publication Inspection & Review Workspace · Record #{record.id}
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Source: {record.source_filename ?? 'MPR Document'} · Section: {record.source_section} ·
              AI Confidence: {Math.round(record.ai_confidence * 100)}%
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Left column: Original Extracted Text & AI Reasoning & Audit Trail */}
          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Original Extracted Text (Verbatim)</span>
                <span className="font-mono text-slate-500">
                  {record.container_type || 'paragraph'}
                  {record.paragraph_number ? ` · ¶${record.paragraph_number}` : ''}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {record.original_text}
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Classification Rationale</span>
                <span className="font-mono tabular-nums text-[#0F294A]">
                  {Math.round(record.ai_confidence * 100)}% confidence
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                {record.ai_reasoning || 'No reasoning recorded.'}
              </p>
              <div className="mt-2 text-xs text-slate-500">
                Initial AI Assignment: <span className="font-medium text-slate-800">{record.ai_category}</span>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <History className="h-4 w-4 text-slate-500" />
                <span>Human Audit Trail ({auditLogs.length})</span>
              </div>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400">No edits or approvals recorded yet.</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border-b border-slate-100 pb-2 text-xs last:border-b-0"
                    >
                      <div className="flex items-center justify-between font-medium text-slate-800">
                        <span>{log.action} · {log.field_changed}</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {log.created_at}
                        </span>
                      </div>
                      <div className="mt-0.5 text-slate-600">
                        <span className="line-through text-slate-400">{log.old_value || '(blank)'}</span>
                        {' → '}
                        <span className="text-slate-800">{log.new_value || '(blank)'}</span>
                      </div>
                      {log.notes && <div className="mt-0.5 italic text-slate-500">{log.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Editable Structured Metadata */}
          <div className="space-y-4 lg:col-span-7">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Assigned Category
                </label>
                <select
                  value={form.category ?? 'Review Required'}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as PublicationCategory })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Review Status
                </label>
                <select
                  value={form.review_status ?? 'pending'}
                  onChange={(e) =>
                    setForm({ ...form, review_status: e.target.value as ReviewStatus })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
                >
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="flagged">Flagged / Uncertain</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Publication / Activity Title
              </label>
              <textarea
                rows={2}
                value={form.title ?? ''}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Authors (Preserve Original Order & Initials)
              </label>
              <input
                type="text"
                value={form.authors ?? ''}
                onChange={(e) => setForm({ ...form, authors: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Journal Name</label>
                <input
                  type="text"
                  value={form.journal_name ?? ''}
                  onChange={(e) => setForm({ ...form, journal_name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Book Title</label>
                <input
                  type="text"
                  value={form.book_title ?? ''}
                  onChange={(e) => setForm({ ...form, book_title: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Conference / Seminar Name
                </label>
                <input
                  type="text"
                  value={form.conference_name ?? ''}
                  onChange={(e) => setForm({ ...form, conference_name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Year</label>
                <input
                  type="text"
                  value={form.publication_year ?? ''}
                  onChange={(e) => setForm({ ...form, publication_year: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Volume</label>
                <input
                  type="text"
                  value={form.volume ?? ''}
                  onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Issue</label>
                <input
                  type="text"
                  value={form.issue ?? ''}
                  onChange={(e) => setForm({ ...form, issue: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Pages</label>
                <input
                  type="text"
                  value={form.page_numbers ?? ''}
                  onChange={(e) => setForm({ ...form, page_numbers: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">DOI</label>
                <input
                  type="text"
                  value={form.doi ?? ''}
                  onChange={(e) => setForm({ ...form, doi: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">ISBN</label>
                <input
                  type="text"
                  value={form.isbn ?? ''}
                  onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">ISSN</label>
                <input
                  type="text"
                  value={form.issn ?? ''}
                  onChange={(e) => setForm({ ...form, issn: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Presentation Type
                </label>
                <input
                  type="text"
                  value={form.presentation_type ?? ''}
                  onChange={(e) => setForm({ ...form, presentation_type: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Event Location
                </label>
                <input
                  type="text"
                  value={form.event_location ?? ''}
                  onChange={(e) => setForm({ ...form, event_location: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Event Date</label>
                <input
                  type="text"
                  value={form.event_date ?? ''}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Reviewer Note (Recorded in Audit Trail)
              </label>
              <input
                type="text"
                placeholder="Reason for category change, metadata correction, or approval..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <button
              disabled={saving}
              onClick={() => handleSave('approved')}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Save & Approve
            </button>
            <button
              disabled={saving}
              onClick={() => handleSave('flagged')}
              className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <Flag className="h-4 w-4" />
              Flag Uncertain
            </button>
            <button
              disabled={saving}
              onClick={() => handleSave('rejected')}
              className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => handleSave()}
              className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

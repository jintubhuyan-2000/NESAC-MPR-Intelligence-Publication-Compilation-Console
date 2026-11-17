import { useEffect, useState } from 'react';
import { Cpu, Eye, ShieldCheck, Sparkles } from 'lucide-react';
import { RecordInspectModal } from '../components/RecordInspectModal.tsx';
import { TransmissionConsentModal } from '../components/TransmissionConsentModal.tsx';
import { api } from '../services/api.ts';
import type { AppSettings, MprDocument, PublicationRecord } from '../types/mpr.ts';

interface Props {
  settings: AppSettings;
  geminiConfigured: boolean;
  onDataChanged: () => void;
}

export function AiExtractionView({ settings, geminiConfigured, onDataChanged }: Props) {
  const [docs, setDocs] = useState<MprDocument[]>([]);
  const [records, setRecords] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [inspectRec, setInspectRec] = useState<PublicationRecord | null>(null);

  const [consentOpen, setConsentOpen] = useState(false);
  const [consentItems, setConsentItems] = useState<
    Array<{
      id: number;
      filename: string;
      section_detected: string;
      container_type: string;
      raw_text: string;
    }>
  >([]);
  const [queuedIds, setQueuedIds] = useState<number[]>([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dRes, rRes] = await Promise.all([api.getDocuments(), api.getRecords()]);
      setDocs(dRes.documents);
      setRecords(rRes.records);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const triggerBatch = async (docIds: number[]) => {
    if (docIds.length === 0) return;
    setError('');
    if (settings.local_only_mode) {
      await runExtraction(docIds, 'local');
      return;
    }
    if (settings.require_transmission_consent) {
      const prev = await api.previewTransmission(docIds);
      setConsentItems(prev.items);
      setQueuedIds(docIds);
      setConsentOpen(true);
    } else {
      await runExtraction(docIds, geminiConfigured ? 'gemini' : 'local');
    }
  };

  const runExtraction = async (docIds: number[], mode: 'gemini' | 'local') => {
    setConsentOpen(false);
    setRunning(true);
    setError('');
    try {
      await api.processDocuments(docIds, mode);
      await loadAll();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setRunning(false);
    }
  };

  const pendingDocs = docs.filter((d) => d.status !== 'processed');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            AI Metadata Extraction & Classification Pipeline
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Extracts structured metadata (title, authors, journal, book, conference, year, DOI, ISBN, ISSN) without inventing missing fields, and classifies into Research Papers, Book Chapters, or Conference Proceedings/Seminars.
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
              {settings.local_only_mode
                ? 'Local-Only Mode Active (External AI Blocked)'
                : geminiConfigured
                ? 'Server-Side Gemini API Ready (Minimal Text Transmission)'
                : 'Gemini Key Missing — Configure in Secrets or Use Local Mode'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingDocs.length > 0 && (
            <button
              disabled={running}
              onClick={() => triggerBatch(pendingDocs.map((d) => d.id))}
              className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {running ? 'Processing...' : `Process ${pendingDocs.length} Pending Document(s)`}
            </button>
          )}
          {docs.length > 0 && (
            <button
              disabled={running}
              onClick={() => triggerBatch(docs.map((d) => d.id))}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Cpu className="h-4 w-4" />
              Re-Run All ({docs.length})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          AI Classification Output & Confidence Log ({records.length} records)
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading extracted records...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No extracted records yet. Load documents in MPR Document Manager and run AI Extraction.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2.5">Source File · Sec</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Assigned Category</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Confidence</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Extracted Title & Authors</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">AI Reasoning</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="font-medium text-slate-900">{r.source_filename}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {r.source_section} · {r.container_type || 'paragraph'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-[#0F294A]">
                      {r.category}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {Math.round(r.ai_confidence * 100)}%
                    </td>
                    <td className="max-w-sm px-4 py-2.5">
                      <div className="font-medium text-slate-900 line-clamp-2">
                        {r.title || '(Untitled)'}
                      </div>
                      <div className="mt-0.5 text-slate-600 line-clamp-1">
                        {r.authors || 'No authors parsed'}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-2.5 text-slate-600">
                      <div className="line-clamp-2">{r.ai_reasoning}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        onClick={() => setInspectRec(r)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RecordInspectModal
        record={inspectRec}
        onClose={() => setInspectRec(null)}
        onSaved={() => {
          loadAll();
          onDataChanged();
        }}
      />

      <TransmissionConsentModal
        open={consentOpen}
        items={consentItems}
        localOnlyMode={settings.local_only_mode}
        onCancel={() => setConsentOpen(false)}
        onConfirmGemini={() => runExtraction(queuedIds, 'gemini')}
        onRunLocalInstead={() => runExtraction(queuedIds, 'local')}
      />
    </div>
  );
}

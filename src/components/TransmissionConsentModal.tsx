import { ShieldAlert, Sparkles, X } from 'lucide-react';

interface PreviewItem {
  id: number;
  filename: string;
  section_detected: string;
  container_type: string;
  raw_text: string;
}

interface Props {
  open: boolean;
  items: PreviewItem[];
  localOnlyMode: boolean;
  onCancel: () => void;
  onConfirmGemini: () => void;
  onRunLocalInstead: () => void;
}

export function TransmissionConsentModal({
  open,
  items,
  localOnlyMode,
  onCancel,
  onConfirmGemini,
  onRunLocalInstead,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#0F294A] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="text-base font-semibold">
                AI Data Transmission Preview & Consent
              </h2>
              <p className="text-xs text-slate-300">
                Full DOCX files are never uploaded. Only minimal Section IV & V extracted snippets are sent.
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded p-1 text-slate-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <strong>{items.length}</strong> extracted text entries from Section IV / V are queued
            for structured metadata extraction and classification. Review the exact text payloads
            below before confirming transmission to the server-side Gemini API.
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No Section IV or Section V entries found; deterministic fallback will inspect general paragraphs if needed.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 rounded border border-slate-200">
              {items.map((it) => (
                <div key={it.id} className="p-3 text-xs">
                  <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                    <span className="font-semibold text-[#0F294A]">{it.filename}</span>
                    <span>·</span>
                    <span>{it.section_detected}</span>
                    <span>·</span>
                    <span>{it.container_type}</span>
                  </div>
                  <div className="text-slate-800">{it.raw_text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onRunLocalInstead}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Process Locally (No External API)
            </button>
            {!localOnlyMode && (
              <button
                onClick={onConfirmGemini}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
              >
                <Sparkles className="h-4 w-4" />
                Confirm & Extract with Gemini AI
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

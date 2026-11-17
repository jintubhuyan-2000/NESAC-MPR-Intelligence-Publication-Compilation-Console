import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode, X } from 'lucide-react';
import { api } from '../services/api.ts';
import type { ExtractionDiagnostics, MprDocument } from '../types/mpr.ts';

interface Props {
  documentId: number | null;
  onClose: () => void;
}

export function DiagnosticsModal({ documentId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<MprDocument | null>(null);
  const [diag, setDiag] = useState<ExtractionDiagnostics | null>(null);
  const [paragraphs, setParagraphs] = useState<
    Array<{
      id: number;
      paragraph_number: number;
      container_type: string;
      xml_source: string;
      section_detected: string;
      raw_text: string;
      is_heading: number;
    }>
  >([]);

  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    api
      .getDocumentDiagnostics(documentId)
      .then((res) => {
        setDoc(res.document);
        setDiag(res.diagnostics);
        setParagraphs(res.paragraphs);
      })
      .finally(() => setLoading(false));
  }, [documentId]);

  if (!documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#0F294A] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <FileCode className="h-5 w-5 text-sky-300" />
            <div>
              <h2 className="text-base font-semibold">
                OOXML Extraction Diagnostics · {doc?.filename ?? 'Loading...'}
              </h2>
              <p className="text-xs text-slate-300">
                Paragraph order, floating text boxes (DrawingML & VML), tables, headers, and footers
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {loading || !diag ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading XML extraction diagnostics...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Total Paragraphs</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.totalParagraphs}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Normal w:p</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.normalParagraphs}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">DrawingML Boxes</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.drawingMlTextBoxes}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">VML Text Boxes</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.vmlTextBoxes}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Table Entries</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.tableCells}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Header / Footer</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {diag.headerFooterItems}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded border border-slate-200 p-4 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
                    {diag.sectionIvFound ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <span>Section IV Detection</span>
                  </div>
                  <div className="text-slate-600">
                    {diag.sectionIvFound
                      ? `Found in ${diag.sectionIvLocation} · ${diag.sectionIvItemCount} items extracted`
                      : 'Section IV heading not detected'}
                  </div>
                </div>

                <div className="rounded border border-slate-200 p-4 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
                    {diag.sectionVFound ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <span>Section V Detection</span>
                  </div>
                  <div className="text-slate-600">
                    {diag.sectionVFound
                      ? `Found in ${diag.sectionVLocation} · ${diag.sectionVItemCount} items extracted`
                      : 'Section V heading not detected'}
                  </div>
                </div>
              </div>

              {(diag.warnings.length > 0 || diag.errors.length > 0) && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold">Diagnostics Warnings & Errors</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {diag.errors.map((e, i) => (
                      <li key={`e-${i}`} className="text-red-700">
                        {e}
                      </li>
                    ))}
                    {diag.warnings.map((w, i) => (
                      <li key={`w-${i}`}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">
                    Extracted Paragraphs in Original Order
                  </span>
                  <span className="font-mono">
                    XML Parts: {diag.xmlFilesScanned.join(', ')}
                  </span>
                </div>
                <div className="overflow-x-auto rounded border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 font-mono">¶#</th>
                        <th className="border-b border-slate-200 px-3 py-2">XML Source</th>
                        <th className="border-b border-slate-200 px-3 py-2">Container</th>
                        <th className="border-b border-slate-200 px-3 py-2">Section</th>
                        <th className="border-b border-slate-200 px-3 py-2">Extracted Text</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {paragraphs.map((p) => (
                        <tr
                          key={p.id}
                          className={p.is_heading ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50'}
                        >
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                            {p.paragraph_number}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-600">
                            {p.xml_source}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-700">
                            {p.container_type}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {p.section_detected}
                          </td>
                          <td className="px-3 py-2 text-slate-900">{p.raw_text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

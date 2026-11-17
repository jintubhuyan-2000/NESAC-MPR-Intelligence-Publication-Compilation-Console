import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  Download,
  FileSearch,
  FlaskConical,
  FolderOpen,
  FolderSearch,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { DiagnosticsModal } from '../components/DiagnosticsModal.tsx';
import { TransmissionConsentModal } from '../components/TransmissionConsentModal.tsx';
import { api, localAgentClient } from '../services/api.ts';
import type { AppSettings, MprDocument } from '../types/mpr.ts';

interface Props {
  settings: AppSettings;
  geminiConfigured: boolean;
  onDataChanged: () => void;
}

interface ScannedLocalFile {
  filename: string;
  file_path: string;
  file_size: number;
  modified_at: string;
  file_hash: string;
}

export function DocumentManagerView({ settings, geminiConfigured, onDataChanged }: Props) {
  const [documents, setDocuments] = useState<MprDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingIds, setProcessingIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [diagnosticsDocId, setDiagnosticsDocId] = useState<number | null>(null);

  // Local Python Agent state
  const [folderPath, setFolderPath] = useState(settings.default_windows_folder);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [agentInfo, setAgentInfo] = useState<string>('');
  const [scannedFiles, setScannedFiles] = useState<ScannedLocalFile[]>([]);
  const [ignoredFiles, setIgnoredFiles] = useState<string[]>([]);
  const [scanningLocal, setScanningLocal] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);

  // Consent preview modal
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
  const [pendingProcessIds, setPendingProcessIds] = useState<number[]>([]);

  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const res = await api.getDocuments();
      setDocuments(res.documents);
    } finally {
      setLoading(false);
    }
  };

  const checkLocalAgent = async () => {
    try {
      const health = await localAgentClient.checkHealth(settings.local_agent_url);
      setAgentOnline(true);
      setAgentInfo(`${health.agent} v${health.version} · Python ${health.python} · ${health.os}`);
    } catch {
      setAgentOnline(false);
      setAgentInfo('Local Python Agent not reachable on ' + settings.local_agent_url);
    }
  };

  useEffect(() => {
    setFolderPath(settings.default_windows_folder);
    loadDocs();
    checkLocalAgent();
  }, [settings.default_windows_folder, settings.local_agent_url]);

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const allFiles = Array.from(files);
    const validDocx = allFiles.filter((f) => {
      const name = f.name;
      return (
        name.toLowerCase().endsWith('.docx') &&
        !name.startsWith('~$') &&
        !name.startsWith('.')
      );
    });
    const skippedTemp = allFiles.filter(
      (f) => f.name.toLowerCase().endsWith('.docx') && (f.name.startsWith('~$') || f.name.startsWith('.'))
    );

    if (validDocx.length === 0) {
      setStatusMessage({
        type: 'err',
        text: `No valid .docx files found in selection (${allFiles.length} file(s) checked, ${skippedTemp.length} temporary ~$ file(s) ignored).`,
      });
      return;
    }

    setUploading(true);
    setStatusMessage(null);
    try {
      const res = await api.uploadDocuments(validDocx);
      const newCount = res.uploaded.filter((u) => !u.alreadyExists).length;
      const dupCount = res.uploaded.filter((u) => u.alreadyExists).length;
      setStatusMessage({
        type: 'ok',
        text: `Extracted ${res.uploaded.length} DOCX document(s) (${newCount} new, ${dupCount} already indexed${skippedTemp.length ? `, ${skippedTemp.length} temp ~$ ignored` : ''}).`,
      });
      await loadDocs();
      onDataChanged();
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleScanLocalFolder = async () => {
    setScanningLocal(true);
    setStatusMessage(null);
    try {
      const res = await localAgentClient.scanFolder(settings.local_agent_url, folderPath);
      setScannedFiles(res.files);
      setIgnoredFiles(res.ignored_temporary_files);
      setStatusMessage({
        type: 'ok',
        text: `Scanned ${res.folder_path}: ${res.total_found} DOCX file(s) discovered (${res.ignored_temporary_files.length} temporary ~$ files ignored).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to scan Windows folder.',
      });
    } finally {
      setScanningLocal(false);
    }
  };

  const handleExtractFromLocalFolder = async (pathsToExtract: string[]) => {
    if (pathsToExtract.length === 0) return;
    setSyncingLocal(true);
    setStatusMessage(null);
    try {
      const extRes = await localAgentClient.extractFiles(
        settings.local_agent_url,
        pathsToExtract
      );
      const syncRes = await api.syncLocalDocuments(extRes.extracted);
      setStatusMessage({
        type: 'ok',
        text: `Synced ${syncRes.synced.length} local DOCX document(s) via Python lxml agent.`,
      });
      await loadDocs();
      onDataChanged();
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Local extraction sync failed.',
      });
    } finally {
      setSyncingLocal(false);
    }
  };

  const initiateProcessing = async (ids: number[]) => {
    if (ids.length === 0) return;
    setStatusMessage(null);

    if (settings.local_only_mode) {
      await executeProcessing(ids, 'local');
      return;
    }

    if (settings.require_transmission_consent) {
      const preview = await api.previewTransmission(ids);
      setConsentItems(preview.items);
      setPendingProcessIds(ids);
      setConsentOpen(true);
    } else {
      await executeProcessing(ids, geminiConfigured ? 'gemini' : 'local');
    }
  };

  const executeProcessing = async (ids: number[], mode: 'gemini' | 'local') => {
    setConsentOpen(false);
    setProcessingIds(ids);
    setStatusMessage(null);
    try {
      const res = await api.processDocuments(ids, mode);
      const total = res.outcomes.reduce((acc, o) => acc + o.processedCount, 0);
      setStatusMessage({
        type: 'ok',
        text: `Processed ${res.outcomes.length} document(s) using ${mode === 'gemini' ? 'Gemini AI' : 'Local Deterministic Engine'}: ${total} publication/conference records saved.`,
      });
      setSelectedIds([]);
      await loadDocs();
      onDataChanged();
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Processing failed.',
      });
    } finally {
      setProcessingIds([]);
    }
  };

  const handleRunTestSuite = async (useAi: boolean) => {
    setUploading(true);
    setStatusMessage(null);
    try {
      const res = await api.runTestSuite(useAi);
      const totalRecs = res.suiteResults.reduce((acc, r) => acc + r.processedCount, 0);
      setStatusMessage({
        type: 'ok',
        text: `Programmatic OOXML Test Suite verified: ${res.suiteResults.length} test DOCX files (${totalRecs} entries extracted across paragraphs, DrawingML/VML text boxes, tables, and headers/footers).`,
      });
      await loadDocs();
      onDataChanged();
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Test suite failed.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteDocument(id);
    await loadDocs();
    onDataChanged();
  };

  const pendingDocs = documents.filter((d) => d.status !== 'processed');
  const existingHashes = new Set(documents.map((d) => d.file_hash));

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`flex items-center justify-between rounded-md border px-4 py-3 text-xs ${
            statusMessage.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="ml-4 font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dual Ingestion Grid: Local Windows Agent + Direct Browser Upload & Test Suite */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Local Windows Python Agent Panel */}
        <div className="rounded-md border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-[#0F294A]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Local Windows Folder Agent
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Direct localhost bridge (<span className="font-mono">{settings.local_agent_url}</span>) for scanning Windows drives safely.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium ${
                  agentOnline ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {agentOnline ? 'Agent Online' : 'Agent Offline'}
              </span>
              <button
                onClick={checkLocalAgent}
                className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                title="Re-check Local Python Agent Health"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="text-[11px] text-slate-500">{agentInfo}</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="W:\REKHA\17-11-2026\MPR"
                className="flex-1 rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0F294A] focus:outline-none"
              />
              <button
                disabled={!agentOnline || scanningLocal}
                onClick={handleScanLocalFolder}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <FolderSearch className="h-4 w-4" />
                {scanningLocal ? 'Scanning...' : 'Scan Windows Folder'}
              </button>
            </div>

            {!agentOnline && (
              <div className="space-y-2.5 rounded border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                <div>
                  <strong>Why is Local Python Agent offline?</strong>{' '}
                  The Python agent (<span className="font-mono">python_agent/agent_server.py</span>) runs on your Windows 10/11 PC, not in the cloud.
                  {typeof window !== 'undefined' && window.location.protocol === 'https:' ? (
                    <span>
                      {' '}Also, browsers block <span className="font-mono">https://</span> preview pages from reaching <span className="font-mono">http://127.0.0.1:8765</span> unless you run the downloaded bundle locally on <span className="font-mono">http://localhost:3000</span>.
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <a
                    href="/api/export/project-zip"
                    className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1E3A8A]"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Download Windows Agent & App (.zip)
                  </a>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Browse Windows Folder Directly Now
                  </button>
                </div>
              </div>
            )}

            {scannedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Discovered DOCX Files ({scannedFiles.length})
                    {ignoredFiles.length > 0 ? ` · ${ignoredFiles.length} temp ~$ ignored` : ''}
                  </span>
                  <button
                    disabled={syncingLocal}
                    onClick={() =>
                      handleExtractFromLocalFolder(
                        scannedFiles
                          .filter((f) => !existingHashes.has(f.file_hash))
                          .map((f) => f.file_path)
                      )
                    }
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {syncingLocal ? 'Extracting...' : 'Extract New Files Incrementally'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-1.5">Filename</th>
                        <th className="px-3 py-1.5 font-mono">Size</th>
                        <th className="px-3 py-1.5">Sync Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scannedFiles.map((f) => {
                        const synced = existingHashes.has(f.file_hash);
                        return (
                          <tr key={f.file_path}>
                            <td className="px-3 py-1.5 font-medium text-slate-800">
                              {f.filename}
                            </td>
                            <td className="px-3 py-1.5 font-mono tabular-nums text-slate-500">
                              {(f.file_size / 1024).toFixed(1)} KB
                            </td>
                            <td className="px-3 py-1.5">
                              {synced ? (
                                <span className="text-emerald-700">Already Synced</span>
                              ) : (
                                <button
                                  disabled={syncingLocal}
                                  onClick={() => handleExtractFromLocalFolder([f.file_path])}
                                  className="font-medium text-[#1E3A8A] hover:underline"
                                >
                                  Extract Now
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Browser DOCX Upload & Programmatic OOXML Test Suite */}
        <div className="rounded-md border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Upload Monthly DOCX & OOXML Verification
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Reads `document.xml`, headers, footers, tables, and floating text boxes (`w:txbxContent`).
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is supported in Chromium/Edge/Firefox for folder selection
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded border border-dashed p-4 text-center transition-colors ${
                dragOver
                  ? 'border-[#0F294A] bg-slate-100'
                  : 'border-slate-300 bg-slate-50'
              }`}
            >
              <div className="text-xs text-slate-600">
                Drag and drop <span className="font-mono font-medium">.docx</span> files here, or choose files / an entire Windows folder:
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Parsing OOXML...' : 'Select .DOCX Files'}
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Select Windows Folder (MPR)
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 text-xs font-medium text-slate-700">
                Programmatic Test DOCX Suite (Verification)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={uploading}
                  onClick={() => handleRunTestSuite(geminiConfigured && !settings.local_only_mode)}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Load & Verify Test MPR Suite
                </button>
                <a
                  href="/api/test-suite/download/NESAC_MPR_October_2026.docx"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Oct Test DOCX
                </a>
                <a
                  href="/api/test-suite/download/NESAC_MPR_November_2026.docx"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Nov Test DOCX
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Inventory & Processing Queue Table */}
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="text-sm font-semibold text-slate-900">
            MPR Document Repository ({documents.length} total ·{' '}
            <span className="font-mono text-emerald-700">
              {documents.filter((d) => d.status === 'processed').length} processed
            </span>{' '}
            ·{' '}
            <span className="font-mono text-amber-700">{pendingDocs.length} pending</span>)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                disabled={processingIds.length > 0}
                onClick={() => initiateProcessing(selectedIds)}
                className="inline-flex items-center gap-1.5 rounded bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
              >
                <Cpu className="h-3.5 w-3.5" />
                Process Selected ({selectedIds.length})
              </button>
            )}
            {pendingDocs.length > 0 && (
              <button
                disabled={processingIds.length > 0}
                onClick={() => initiateProcessing(pendingDocs.map((d) => d.id))}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
              >
                <Cpu className="h-3.5 w-3.5" />
                Process Pending Incrementally ({pendingDocs.length})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No MPR documents loaded yet. Scan a local Windows folder, upload `.docx` files, or run the Test Suite above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={
                        documents.length > 0 && selectedIds.length === documents.length
                      }
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? documents.map((d) => d.id) : [])
                      }
                    />
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Document Filename</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Source</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Status</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Paragraphs</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Text Boxes</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Tables</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Sections Detected</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {documents.map((d) => {
                  const isProc = processingIds.includes(d.id);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(d.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, d.id]
                                : prev.filter((x) => x !== d.id)
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <div>{d.filename}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {(d.file_size / 1024).toFixed(1)} KB · {d.file_hash.slice(0, 10)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                        {d.source_mode}
                      </td>
                      <td className="px-4 py-2.5">
                        {isProc ? (
                          <span className="font-medium text-blue-700">Processing...</span>
                        ) : d.status === 'processed' ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Processed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Pending AI Extraction
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {d.total_paragraphs}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {d.textbox_count}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {d.table_count}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        Sec IV: {d.section_iv_found ? 'Yes' : 'Missing'} · Sec V:{' '}
                        {d.section_v_found ? 'Yes' : 'Missing'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => setDiagnosticsDocId(d.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <FileSearch className="h-3 w-3" />
                            Diagnostics
                          </button>
                          <button
                            disabled={isProc}
                            onClick={() => initiateProcessing([d.id])}
                            className="rounded bg-[#0F294A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
                          >
                            {d.status === 'processed' ? 'Re-Extract' : 'Extract'}
                          </button>
                          <button
                            onClick={() => handleDelete(d.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DiagnosticsModal
        documentId={diagnosticsDocId}
        onClose={() => setDiagnosticsDocId(null)}
      />

      <TransmissionConsentModal
        open={consentOpen}
        items={consentItems}
        localOnlyMode={settings.local_only_mode}
        onCancel={() => setConsentOpen(false)}
        onConfirmGemini={() => executeProcessing(pendingProcessIds, 'gemini')}
        onRunLocalInstead={() => executeProcessing(pendingProcessIds, 'local')}
      />
    </div>
  );
}

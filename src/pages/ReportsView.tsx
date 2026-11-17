import { useEffect, useState } from 'react';
import { Archive, FileSpreadsheet, FileText, HardDriveDownload } from 'lucide-react';
import { api, localAgentClient } from '../services/api.ts';
import type { AppSettings, DashboardSummary } from '../types/mpr.ts';

interface Props {
  settings: AppSettings;
  summary: DashboardSummary | null;
}

export function ReportsView({ settings, summary }: Props) {
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [exportingLocal, setExportingLocal] = useState(false);

  useEffect(() => {
    localAgentClient
      .checkHealth(settings.local_agent_url)
      .then(() => setAgentOnline(true))
      .catch(() => setAgentOnline(false));
  }, [settings.local_agent_url]);

  const handleLocalAgentExport = async (format: 'xlsx' | 'docx') => {
    setExportingLocal(true);
    try {
      const res = await api.getRecords();
      await localAgentClient.exportViaLocalAgent(
        settings.local_agent_url,
        format,
        res.records,
        approvedOnly
      );
    } finally {
      setExportingLocal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Institutional Report Generation & Project Export
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Generate consolidated Word (.docx) reports and 8-sheet Excel (.xlsx) workbooks preserving original publication text and author order.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded bg-slate-100 p-1">
          <button
            onClick={() => setApprovedOnly(false)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              !approvedOnly
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Extracted Records ({summary?.totalExtractedEntries ?? 0})
          </button>
          <button
            onClick={() => setApprovedOnly(true)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              approvedOnly
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved Records Only ({summary?.approvedRecords ?? 0})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Excel Workbook Card */}
        <div className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
              <span>Consolidated Excel Workbook (.xlsx)</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Includes 8 structured worksheets:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>All Records</li>
              <li>Research Papers</li>
              <li>Book Chapters</li>
              <li>Conferences and Seminars</li>
              <li>Author-wise Output Summary</li>
              <li>Possible Duplicates</li>
              <li>Review Required</li>
              <li>Processing Summary</li>
            </ul>
          </div>

          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <a
              href={`/api/export/xlsx?approvedOnly=${approvedOnly}`}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel (.xlsx)
            </a>
            {agentOnline && (
              <button
                disabled={exportingLocal}
                onClick={() => handleLocalAgentExport('xlsx')}
                className="flex w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <HardDriveDownload className="h-4 w-4" />
                Export via Local Python Agent (openpyxl)
              </button>
            )}
          </div>
        </div>

        {/* Word Document Card */}
        <div className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-[#1E3A8A]" />
              <span>Institutional Word Report (.docx)</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Formatted publication-ready Word compilation containing:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>NESAC Institutional Title Page</li>
              <li>Compilation Summary Table</li>
              <li>Section I: Research Papers</li>
              <li>Section II: Book Chapters</li>
              <li>Section III: Conference Proceedings / Seminars</li>
              <li>Author-wise Publication Summary Table</li>
              <li>Source MPR Document References & Original Text</li>
            </ul>
          </div>

          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <a
              href={`/api/export/docx?approvedOnly=${approvedOnly}`}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
            >
              <FileText className="h-4 w-4" />
              Download Word Report (.docx)
            </a>
            {agentOnline && (
              <button
                disabled={exportingLocal}
                onClick={() => handleLocalAgentExport('docx')}
                className="flex w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <HardDriveDownload className="h-4 w-4" />
                Export via Local Python Agent (python-docx)
              </button>
            )}
          </div>
        </div>

        {/* Complete Project Source ZIP Card */}
        <div className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Archive className="h-5 w-5 text-slate-700" />
              <span>Complete Application Archive (.zip)</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Download the complete deployable source bundle for Windows 10/11 or local server deployment:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>React + TypeScript Frontend (`src/`)</li>
              <li>Node.js + SQLite + Gemini Backend (`server/`)</li>
              <li>Python Local Windows Agent (`python_agent/`)</li>
              <li>Windows Setup & Launch Scripts (`scripts/`)</li>
              <li>Programmatic Test DOCX Files (`test_data/`)</li>
              <li>`package.json`, `requirements.txt`, `README.md`</li>
            </ul>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <a
              href="/api/export/project-zip"
              className="flex w-full items-center justify-center gap-2 rounded border border-[#0F294A] bg-white px-4 py-2 text-xs font-semibold text-[#0F294A] hover:bg-slate-50"
            >
              <Archive className="h-4 w-4" />
              Download Complete Project ZIP
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

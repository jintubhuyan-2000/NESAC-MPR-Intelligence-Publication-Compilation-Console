import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, FlaskConical, FolderOpen, Upload } from 'lucide-react';
import type { DashboardSummary } from '../types/mpr.ts';

interface Props {
  summary: DashboardSummary | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
  onRunTestSuite: () => void;
  runningTest: boolean;
}

export function DashboardView({
  summary,
  loading,
  onNavigate,
  onRunTestSuite,
  runningTest,
}: Props) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-md border border-slate-200 bg-white p-5"
          />
        ))}
      </div>
    );
  }

  const s = summary ?? {
    totalDocuments: 0,
    documentsProcessed: 0,
    documentsPending: 0,
    totalExtractedEntries: 0,
    researchPapers: 0,
    bookChapters: 0,
    conferenceContributions: 0,
    reviewRequired: 0,
    pendingReviews: 0,
    approvedRecords: 0,
    rejectedRecords: 0,
    flaggedRecords: 0,
    possibleDuplicates: 0,
    confirmedDuplicates: 0,
    yearDistribution: [],
    monthlyDocuments: [],
  };

  const kpiCards = [
    {
      label: 'Total MPR Documents',
      value: s.totalDocuments,
      sub: `${s.documentsPending} pending extraction`,
      tab: 'documents',
    },
    {
      label: 'Documents Processed',
      value: s.documentsProcessed,
      sub:
        s.totalDocuments > 0
          ? `${Math.round((s.documentsProcessed / s.totalDocuments) * 100)}% completion`
          : 'No documents loaded',
      tab: 'documents',
    },
    {
      label: 'Total Extracted Entries',
      value: s.totalExtractedEntries,
      sub: `${s.approvedRecords} approved`,
      tab: 'approval',
    },
    {
      label: 'Research Papers',
      value: s.researchPapers,
      sub: 'Category A · Journals',
      tab: 'publications',
    },
    {
      label: 'Book Chapters',
      value: s.bookChapters,
      sub: 'Category B · Edited Books',
      tab: 'book-chapters',
    },
    {
      label: 'Conference Contributions',
      value: s.conferenceContributions,
      sub: 'Category C · Seminars & Symposia',
      tab: 'conferences',
    },
    {
      label: 'Pending Reviews',
      value: s.pendingReviews,
      sub: `${s.reviewRequired} Review Required · ${s.flaggedRecords} flagged`,
      tab: 'approval',
    },
    {
      label: 'Possible Duplicates',
      value: s.possibleDuplicates + s.confirmedDuplicates,
      sub: `${s.confirmedDuplicates} confirmed · ${s.possibleDuplicates} possible`,
      tab: 'duplicates',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Empty state / onboarding banner when database has zero documents */}
      {s.totalDocuments === 0 ? (
        <div className="flex flex-col justify-between gap-4 rounded-md border border-slate-200 bg-white p-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Compile Monthly Progress Reports for NESAC
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Scan your Windows MPR directory (<span className="font-mono text-slate-800">W:\REKHA\17-11-2026\MPR</span>) via
              the Local Python Agent, upload `.docx` files directly, or run the built-in OOXML
              verification suite (paragraphs, floating text boxes, tables, headers/footers, and cross-month duplicates).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('documents')}
              className="inline-flex items-center gap-2 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4" />
              Open Document Manager
            </button>
            <button
              disabled={runningTest}
              onClick={onRunTestSuite}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FlaskConical className="h-4 w-4" />
              {runningTest ? 'Running Test Suite...' : 'Load & Verify Test MPR Suite'}
            </button>
          </div>
        </div>
      ) : null}

      {/* 8 KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            onClick={() => onNavigate(card.tab)}
            className="group flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#0F294A]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">{card.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F294A]" />
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[#0F294A]">
              {card.value}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">{card.sub}</div>
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-md border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Monthly MPR Document Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Consolidated categories per processed monthly document
              </p>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
            >
              Export Reports
            </button>
          </div>

          {s.monthlyDocuments.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">
              Process MPR documents to view per-document category distribution.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.monthlyDocuments} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="filename" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="researchPapers" name="Research Papers" fill="#0F294A" />
                  <Bar dataKey="bookChapters" name="Book Chapters" fill="#2563EB" />
                  <Bar dataKey="conferences" name="Conferences" fill="#0EA5E9" />
                  <Bar dataKey="reviewRequired" name="Review Required" fill="#D97706" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Year-wise Output & Verification Queue
              </h3>
              <p className="text-xs text-slate-500">
                Publication years and review readiness
              </p>
            </div>
            <button
              onClick={() => onNavigate('approval')}
              className="text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
            >
              Review Queue
            </button>
          </div>

          {s.yearDistribution.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">
              No year-wise publication data extracted yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.yearDistribution} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="researchPapers" stackId="a" name="Research Papers" fill="#0F294A" />
                    <Bar dataKey="bookChapters" stackId="a" name="Book Chapters" fill="#2563EB" />
                    <Bar dataKey="conferences" stackId="a" name="Conferences" fill="#0EA5E9" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2 text-xs">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-600">Approved for Official Compilation</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-700">
                    {s.approvedRecords}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-600">Pending Human Verification</span>
                  <span className="font-mono font-semibold tabular-nums text-amber-700">
                    {s.pendingReviews}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-600">Flagged / Rejected</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-700">
                    {s.flaggedRecords} flagged · {s.rejectedRecords} rejected
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Operations Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <FolderOpen className="h-4 w-4 text-[#0F294A]" />
          <span>
            Default Windows MPR Directory:{' '}
            <span className="font-mono font-medium text-slate-900">
              W:\REKHA\17-11-2026\MPR
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={runningTest}
            onClick={onRunTestSuite}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {runningTest ? 'Running Test Suite...' : 'Run OOXML Test Suite'}
          </button>
          <button
            onClick={() => onNavigate('documents')}
            className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap shrink-0"
          >
            Manage & Process Documents
          </button>
        </div>
      </div>
    </div>
  );
}

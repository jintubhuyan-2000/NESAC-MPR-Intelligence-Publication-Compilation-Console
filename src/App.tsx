import { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  Copy,
  Cpu,
  FileBarChart,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Presentation,
  Settings as SettingsIcon,
  Users,
  X,
} from 'lucide-react';
import { AiExtractionView } from './pages/AiExtractionView.tsx';
import { AuthorsView } from './pages/AuthorsView.tsx';
import { CategoryRecordsView } from './pages/CategoryRecordsView.tsx';
import { DashboardView } from './pages/DashboardView.tsx';
import { DocumentManagerView } from './pages/DocumentManagerView.tsx';
import { DuplicatesView } from './pages/DuplicatesView.tsx';
import { HumanApprovalView } from './pages/HumanApprovalView.tsx';
import { ReportsView } from './pages/ReportsView.tsx';
import { SettingsView } from './pages/SettingsView.tsx';
import { api } from './services/api.ts';
import type { AppSettings, DashboardSummary } from './types/mpr.ts';

type NavKey =
  | 'dashboard'
  | 'documents'
  | 'ai-extraction'
  | 'publications'
  | 'book-chapters'
  | 'conferences'
  | 'authors'
  | 'duplicates'
  | 'approval'
  | 'reports'
  | 'settings';

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'documents', label: 'MPR Document Manager', icon: FolderKanban },
  { key: 'ai-extraction', label: 'AI Extraction', icon: Cpu },
  { key: 'publications', label: 'Publications', icon: FileBarChart },
  { key: 'book-chapters', label: 'Book Chapters', icon: BookOpen },
  { key: 'conferences', label: 'Conferences and Seminars', icon: Presentation },
  { key: 'authors', label: 'Author Intelligence', icon: Users },
  { key: 'duplicates', label: 'Duplicate Review', icon: Copy },
  { key: 'approval', label: 'Human Approval', icon: CheckSquare },
  { key: 'reports', label: 'Reports and Exports', icon: FileSpreadsheet },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [runningTest, setRunningTest] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    default_windows_folder: 'W:\\REKHA\\17-11-2026\\MPR',
    local_agent_url: 'http://127.0.0.1:8765',
    local_only_mode: false,
    require_transmission_consent: true,
    institution_name: 'North Eastern Space Applications Centre (NESAC)',
    report_title: 'Consolidated Monthly Progress Report — Publications & Conferences',
  });
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  const refreshSummary = async () => {
    setLoadingSummary(true);
    try {
      const [sum, setRes] = await Promise.all([api.getDashboard(), api.getSettings()]);
      setSummary(sum);
      setSettings(setRes.settings);
      setGeminiConfigured(setRes.geminiConfigured);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    refreshSummary();
  }, []);

  const handleRunTestSuite = async () => {
    setRunningTest(true);
    try {
      await api.runTestSuite(geminiConfigured && !settings.local_only_mode);
      await refreshSummary();
    } finally {
      setRunningTest(false);
    }
  };

  const activeItem = NAV_ITEMS.find((n) => n.key === activeNav) ?? NAV_ITEMS[0];

  const renderContent = () => {
    switch (activeNav) {
      case 'dashboard':
        return (
          <DashboardView
            summary={summary}
            loading={loadingSummary}
            onNavigate={(tab) => setActiveNav(tab as NavKey)}
            onRunTestSuite={handleRunTestSuite}
            runningTest={runningTest}
          />
        );
      case 'documents':
        return (
          <DocumentManagerView
            settings={settings}
            geminiConfigured={geminiConfigured}
            onDataChanged={refreshSummary}
          />
        );
      case 'ai-extraction':
        return (
          <AiExtractionView
            settings={settings}
            geminiConfigured={geminiConfigured}
            onDataChanged={refreshSummary}
          />
        );
      case 'publications':
        return (
          <CategoryRecordsView
            category="Research Papers"
            heading="Category A · Research Papers & Journal Articles"
            subtitle="Published peer-reviewed journal articles extracted and verified from monthly MPR documents."
            onDataChanged={refreshSummary}
          />
        );
      case 'book-chapters':
        return (
          <CategoryRecordsView
            category="Book Chapters"
            heading="Category B · Book Chapters in Edited Volumes"
            subtitle="Authored book chapters and monograph contributions with ISBN and editor metadata."
            onDataChanged={refreshSummary}
          />
        );
      case 'conferences':
        return (
          <CategoryRecordsView
            category="Conference Proceedings/Seminars"
            heading="Category C · Conference Proceedings, Seminars & Symposia"
            subtitle="Conference papers, oral/poster presentations, invited talks, workshops, and exhibitions."
            onDataChanged={refreshSummary}
          />
        );
      case 'authors':
        return <AuthorsView onDataChanged={refreshSummary} />;
      case 'duplicates':
        return <DuplicatesView onDataChanged={refreshSummary} />;
      case 'approval':
        return <HumanApprovalView onDataChanged={refreshSummary} />;
      case 'reports':
        return <ReportsView settings={settings} summary={summary} />;
      case 'settings':
        return (
          <SettingsView
            settings={settings}
            geminiConfigured={geminiConfigured}
            onSettingsUpdated={(s) => setSettings(s)}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Desktop Institutional Navy Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-[#0F294A] text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-sm font-bold tracking-tight text-white">
            NESAC MPR Intelligence
          </div>
          <div className="mt-1 text-[11px] text-slate-300">
            Publication Compilation Console
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.key;
            let countHint: number | null = null;
            if (summary) {
              if (item.key === 'documents') countHint = summary.totalDocuments;
              else if (item.key === 'publications') countHint = summary.researchPapers;
              else if (item.key === 'book-chapters') countHint = summary.bookChapters;
              else if (item.key === 'conferences') countHint = summary.conferenceContributions;
              else if (item.key === 'duplicates')
                countHint = summary.possibleDuplicates + summary.confirmedDuplicates;
              else if (item.key === 'approval') countHint = summary.pendingReviews;
            }

            return (
              <button
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {countHint !== null && countHint > 0 && (
                  <span className="ml-2 font-mono text-[11px] tabular-nums text-slate-300">
                    {countHint}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-300">
          <div>{settings.local_only_mode ? 'Local-Only Engine' : 'Gemini + Local Hybrid'}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
            {settings.default_windows_folder}
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex w-64 flex-col bg-[#0F294A] text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <span className="text-sm font-bold">NESAC MPR Intelligence</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveNav(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-xs font-medium ${
                      isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="font-semibold text-[#0F294A] whitespace-nowrap shrink-0">
                NESAC
              </span>
              <span className="text-slate-400">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{activeItem.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveNav('reports')}
              className="rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap shrink-0"
            >
              Export Reports
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">{renderContent()}</main>
      </div>
    </div>
  );
}

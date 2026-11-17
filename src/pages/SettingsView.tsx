import { useState } from 'react';
import { Save, Shield, Terminal } from 'lucide-react';
import { api } from '../services/api.ts';
import type { AppSettings } from '../types/mpr.ts';

interface Props {
  settings: AppSettings;
  geminiConfigured: boolean;
  onSettingsUpdated: (s: AppSettings) => void;
}

export function SettingsView({ settings, geminiConfigured, onSettingsUpdated }: Props) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await api.updateSettings(form);
      onSettingsUpdated(res.settings);
      setSavedMsg('Settings saved to SQLite configuration store.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Configuration Form */}
        <div className="space-y-5 rounded-md border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              System Configuration & Privacy Controls
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Configure Windows folder paths, localhost Python agent endpoint, and AI transmission policies.
            </p>
          </div>

          {savedMsg && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {savedMsg}
            </div>
          )}

          <div className="space-y-4 text-xs">
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Default Windows MPR Directory
              </label>
              <input
                type="text"
                value={form.default_windows_folder}
                onChange={(e) =>
                  setForm({ ...form, default_windows_folder: e.target.value })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Local Python Agent Endpoint (Localhost Bridge)
              </label>
              <input
                type="text"
                value={form.local_agent_url}
                onChange={(e) => setForm({ ...form, local_agent_url: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Institution Name (Used in DOCX & XLSX Headers)
              </label>
              <input
                type="text"
                value={form.institution_name}
                onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Consolidated Report Title
              </label>
              <input
                type="text"
                value={form.report_title}
                onChange={(e) => setForm({ ...form, report_title: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.local_only_mode}
                  onChange={(e) =>
                    setForm({ ...form, local_only_mode: e.target.checked })
                  }
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Local-Only Mode (Disable External Gemini AI Calls)
                  </div>
                  <div className="text-slate-500">
                    When enabled, all extraction and classification runs deterministically inside the local backend without transmitting any text externally.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.require_transmission_consent}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      require_transmission_consent: e.target.checked,
                    })
                  }
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Show Extracted Text Preview Before Gemini Transmission
                  </div>
                  <div className="text-slate-500">
                    Displays the exact minimal Section IV & V text entries before sending to the server-side Gemini API.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-slate-600">
                <Shield className="h-4 w-4 text-emerald-700" />
                <span>
                  Server-Side Gemini Key:{' '}
                  <strong>{geminiConfigured ? 'Configured in Environment' : 'Not Set in Secrets'}</strong>
                </span>
              </div>
              <button
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Local Python Agent Installation Guide */}
        <div className="space-y-4 rounded-md border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Terminal className="h-4 w-4 text-[#0F294A]" />
            <h2 className="text-sm font-semibold text-slate-900">
              Windows 10/11 Local Python Agent Guide
            </h2>
          </div>

          <div className="space-y-3 text-xs text-slate-600">
            <p>
              To access mapped Windows network drives such as{' '}
              <span className="font-mono font-semibold text-slate-900">
                W:\REKHA\17-11-2026\MPR
              </span>
              , run the companion Python agent locally on your Windows workstation:
            </p>

            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Download the complete project bundle from <strong>Reports and Exports</strong> and extract the ZIP archive on your Windows PC.
              </li>
              <li>
                Double-click <span className="font-mono font-medium text-slate-800">scripts\setup_windows.bat</span> to create a Python virtual environment and install <span className="font-mono">python-docx</span>, <span className="font-mono">lxml</span>, <span className="font-mono">pandas</span>, <span className="font-mono">openpyxl</span>, and <span className="font-mono">fastapi</span>.
              </li>
              <li>
                Double-click <span className="font-mono font-medium text-slate-800">scripts\start_local_agent.bat</span> to start the localhost bridge on <span className="font-mono">http://127.0.0.1:8765</span>.
              </li>
              <li>
                Return to <strong>MPR Document Manager</strong> and click <strong>Scan Windows Folder</strong>. Temporary <span className="font-mono">~$*.docx</span> Word lock files are ignored automatically.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Check, Eye, Flag, Search, XCircle } from 'lucide-react';
import { RecordInspectModal } from '../components/RecordInspectModal.tsx';
import { api } from '../services/api.ts';
import type { PublicationRecord, ReviewStatus } from '../types/mpr.ts';

interface Props {
  onDataChanged: () => void;
}

export function HumanApprovalView({ onDataChanged }: Props) {
  const [records, setRecords] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | ReviewStatus | 'review_required'>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [inspectRec, setInspectRec] = useState<PublicationRecord | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await api.getRecords({
        category: filterStatus === 'review_required' ? 'Review Required' : 'all',
        review_status:
          filterStatus === 'all' || filterStatus === 'review_required' ? 'all' : filterStatus,
        search,
      });
      setRecords(res.records);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [filterStatus, search]);

  const handleBulk = async (status: ReviewStatus) => {
    if (selectedIds.length === 0) return;
    await api.bulkReview(selectedIds, status, `Bulk ${status} via Human Approval workspace`);
    setSelectedIds([]);
    await loadRecords();
    onDataChanged();
  };

  const quickStatus = async (id: number, status: ReviewStatus) => {
    await api.updateRecord(id, { review_status: status });
    await loadRecords();
    onDataChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Human Verification & Approval Workspace
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Inspect original text, adjust metadata or categories, approve official records, and preserve a complete audit trail.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter records..."
              className="w-52 rounded border border-slate-300 py-1.5 pl-8 pr-3 text-xs focus:border-[#0F294A] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded bg-slate-100 p-1">
            {(
              [
                ['all', 'All'],
                ['pending', 'Pending'],
                ['review_required', 'Review Required'],
                ['flagged', 'Flagged'],
                ['approved', 'Approved'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  filterStatus === val
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-5 py-3 text-xs">
          <span className="font-semibold text-slate-800">
            {selectedIds.length} record(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulk('approved')}
              className="inline-flex items-center gap-1 rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800"
            >
              <Check className="h-3.5 w-3.5" />
              Approve Selected
            </button>
            <button
              onClick={() => handleBulk('flagged')}
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Flag className="h-3.5 w-3.5" />
              Flag Selected
            </button>
            <button
              onClick={() => handleBulk('rejected')}
              className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject Selected
            </button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading review queue...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No records match this review filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={records.length > 0 && selectedIds.length === records.length}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? records.map((r) => r.id) : [])
                      }
                    />
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Title & Original Text</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Category</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Source MPR</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">AI Conf.</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Review Status</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)
                          )
                        }
                      />
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.title || '(Untitled)'}</div>
                      <div className="mt-0.5 text-slate-700">{r.authors}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                        {r.original_text}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[#0F294A]">
                      {r.category}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div>{r.source_filename}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {r.source_section}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {Math.round(r.ai_confidence * 100)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium capitalize">
                      <span
                        className={
                          r.review_status === 'approved'
                            ? 'text-emerald-700'
                            : r.review_status === 'rejected'
                            ? 'text-red-700'
                            : r.review_status === 'flagged'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }
                      >
                        {r.review_status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => quickStatus(r.id, 'approved')}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                          title="Approve record"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setInspectRec(r)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3 w-3" />
                          Edit & Audit
                        </button>
                      </div>
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
          loadRecords();
          onDataChanged();
        }}
      />
    </div>
  );
}

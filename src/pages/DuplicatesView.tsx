import { useEffect, useState } from 'react';
import { CheckCircle2, CopyCheck, ShieldAlert } from 'lucide-react';
import { api } from '../services/api.ts';
import type { PublicationRecord } from '../types/mpr.ts';

interface DuplicateGroup {
  groupId: string;
  masterRecordId: number;
  status: string;
  items: PublicationRecord[];
}

interface Props {
  onDataChanged: () => void;
}

export function DuplicatesView({ onDataChanged }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDuplicates = async () => {
    setLoading(true);
    try {
      const res = await api.getDuplicates();
      setGroups(res.groups);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDuplicates();
  }, []);

  const handleSelectMaster = async (groupId: string, recordId: number) => {
    await api.selectMasterDuplicate(groupId, recordId);
    await loadDuplicates();
    onDataChanged();
  };

  const handleMarkUnique = async (recordId: number) => {
    await api.markDuplicateUnique(recordId);
    await loadDuplicates();
    onDataChanged();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Cross-Document Duplicate Detection & Side-by-Side Comparison
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Matches publications across monthly MPR documents using DOI, normalized title, author similarity, publication year, and fuzzy matching. Duplicate records are preserved with full source references—never automatically deleted.
        </p>
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
          Analyzing cross-document duplicates...
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-12 text-center">
          <CopyCheck className="mb-2 h-7 w-7 text-emerald-600" />
          <div className="text-sm font-semibold text-slate-900">
            No Duplicate Publications Detected
          </div>
          <p className="mt-1 text-xs text-slate-500">
            All currently extracted records appear unique across processed monthly MPR documents.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((grp) => (
            <div
              key={grp.groupId}
              className="overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2 text-xs">
                  <ShieldAlert
                    className={`h-4 w-4 ${
                      grp.status === 'confirmed_duplicate'
                        ? 'text-red-600'
                        : 'text-amber-600'
                    }`}
                  />
                  <span className="font-mono font-semibold text-slate-900">{grp.groupId}</span>
                  <span>·</span>
                  <span
                    className={`font-semibold ${
                      grp.status === 'confirmed_duplicate'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {grp.status === 'confirmed_duplicate'
                      ? 'Confirmed Duplicate'
                      : 'Possible Duplicate'}
                  </span>
                  <span>·</span>
                  <span className="text-slate-600">{grp.items.length} occurrences</span>
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  Master Record: #{grp.masterRecordId}
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
                {grp.items.map((item) => {
                  const isMaster = grp.masterRecordId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col justify-between p-5 text-xs ${
                        isMaster ? 'bg-slate-50/70' : 'bg-white'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-[#0F294A]">
                            Record #{item.id} · {item.source_filename}
                          </span>
                          {isMaster && (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Master Record
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-semibold text-slate-900">
                          {item.title || '(Untitled)'}
                        </div>

                        <div className="text-slate-700">
                          <strong>Authors:</strong> {item.authors || '—'}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                          <div>
                            <strong>Category:</strong> {item.category}
                          </div>
                          <div>
                            <strong>Year:</strong> {item.publication_year || '—'}
                          </div>
                          <div>
                            <strong>DOI:</strong>{' '}
                            <span className="font-mono">{item.doi || '—'}</span>
                          </div>
                          <div>
                            <strong>Match Score:</strong>{' '}
                            <span className="font-mono tabular-nums">
                              {Math.round(item.duplicate_score * 100)}%
                            </span>
                          </div>
                        </div>

                        <div className="rounded border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600">
                          <div className="font-semibold text-slate-700">Original Text:</div>
                          <div className="mt-0.5">{item.original_text}</div>
                        </div>

                        {item.duplicate_reason && (
                          <div className="text-[11px] text-slate-500">
                            <strong>Reason:</strong> {item.duplicate_reason}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                        <button
                          disabled={isMaster}
                          onClick={() => handleSelectMaster(grp.groupId, item.id)}
                          className={`rounded px-3 py-1.5 text-xs font-semibold ${
                            isMaster
                              ? 'bg-emerald-700 text-white opacity-90'
                              : 'bg-[#0F294A] text-white hover:bg-[#1E3A8A]'
                          }`}
                        >
                          {isMaster ? 'Selected as Master' : 'Set as Master Record'}
                        </button>

                        <button
                          onClick={() => handleMarkUnique(item.id)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Not a Duplicate (Mark Unique)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

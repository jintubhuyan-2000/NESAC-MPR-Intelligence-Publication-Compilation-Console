import { useEffect, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import { RecordInspectModal } from '../components/RecordInspectModal.tsx';
import { api } from '../services/api.ts';
import type { PublicationCategory, PublicationRecord } from '../types/mpr.ts';

interface Props {
  category: PublicationCategory;
  heading: string;
  subtitle: string;
  onDataChanged: () => void;
}

export function CategoryRecordsView({ category, heading, subtitle, onDataChanged }: Props) {
  const [records, setRecords] = useState<PublicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inspectRec, setInspectRec] = useState<PublicationRecord | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await api.getRecords({
        category,
        review_status: statusFilter,
        search,
      });
      setRecords(res.records);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [category, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{heading}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, author, DOI..."
              className="w-60 rounded border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0F294A] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 rounded bg-slate-100 p-1">
            {(['all', 'approved', 'pending', 'flagged'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading records...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No records found in {category} matching the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2.5">Title & Original Citation</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Authors</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">
                    {category === 'Book Chapters'
                      ? 'Book Title / ISBN'
                      : category === 'Conference Proceedings/Seminars'
                      ? 'Event / Location / Date'
                      : 'Journal / Vol / DOI'}
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Year</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Source MPR</th>
                  <th className="border-b border-slate-200 px-4 py-2.5">Status</th>
                  <th className="border-b border-slate-200 px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="max-w-md px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.title || '(Untitled)'}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                        {r.original_text}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-800">{r.authors || '—'}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-700">
                      {category === 'Book Chapters' ? (
                        <>
                          <div>{r.book_title || '—'}</div>
                          {r.isbn && (
                            <div className="font-mono text-[11px] text-slate-500">
                              ISBN: {r.isbn}
                            </div>
                          )}
                        </>
                      ) : category === 'Conference Proceedings/Seminars' ? (
                        <>
                          <div>{r.conference_name || '—'}</div>
                          <div className="text-[11px] text-slate-500">
                            {[r.presentation_type, r.event_location, r.event_date]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>{r.journal_name || '—'}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {[
                              r.volume ? `Vol. ${r.volume}` : '',
                              r.issue ? `No. ${r.issue}` : '',
                              r.page_numbers ? `pp. ${r.page_numbers}` : '',
                              r.doi ? `DOI: ${r.doi}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-slate-700">
                      {r.publication_year || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div>{r.source_filename}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {r.source_section}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div
                        className={`font-medium capitalize ${
                          r.review_status === 'approved'
                            ? 'text-emerald-700'
                            : r.review_status === 'rejected'
                            ? 'text-red-700'
                            : r.review_status === 'flagged'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {r.review_status}
                      </div>
                      {r.duplicate_status !== 'unique' && (
                        <div className="text-[11px] text-amber-700">
                          {r.duplicate_status.replace('_', ' ')}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => setInspectRec(r)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect / Edit
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
          loadRecords();
          onDataChanged();
        }}
      />
    </div>
  );
}

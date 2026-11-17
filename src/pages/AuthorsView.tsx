import { useEffect, useState } from 'react';
import { Edit3, Save, Search, Users, X } from 'lucide-react';
import { RecordInspectModal } from '../components/RecordInspectModal.tsx';
import { api } from '../services/api.ts';
import type { AuthorProfile, PublicationRecord } from '../types/mpr.ts';

interface Props {
  onDataChanged: () => void;
}

export function AuthorsView({ onDataChanged }: Props) {
  const [authors, setAuthors] = useState<AuthorProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedAuthor, setSelectedAuthor] = useState<AuthorProfile | null>(null);
  const [authorRecords, setAuthorRecords] = useState<PublicationRecord[]>([]);
  const [editingAuthor, setEditingAuthor] = useState<AuthorProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [inspectRec, setInspectRec] = useState<PublicationRecord | null>(null);
  const [error, setError] = useState('');

  const loadAuthors = async (q = search) => {
    setLoading(true);
    try {
      const res = await api.getAuthors(q);
      setAuthors(res.authors);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuthors(search);
  }, [search]);

  const handleSelectAuthor = async (author: AuthorProfile) => {
    setSelectedAuthor(author);
    const res = await api.getAuthorRecords(author.id);
    setAuthorRecords(res.records);
  };

  const openEdit = (author: AuthorProfile) => {
    setEditingAuthor(author);
    setEditName(author.name);
    setEditDivision(author.division);
    setEditNotes(author.notes);
    setError('');
  };

  const saveEdit = async () => {
    if (!editingAuthor) return;
    setError('');
    try {
      await api.updateAuthor(editingAuthor.id, {
        name: editName,
        division: editDivision,
        notes: editNotes,
      });
      setEditingAuthor(null);
      await loadAuthors();
      if (selectedAuthor?.id === editingAuthor.id) {
        setSelectedAuthor(null);
        setAuthorRecords([]);
      }
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update author.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Author-wise Scientist Publication Intelligence
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Preserves original author spellings and initials. Similar names are never automatically merged.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scientist name or division..."
            className="w-64 rounded border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0F294A] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Author Directory Table */}
        <div className="rounded-md border border-slate-200 bg-white lg:col-span-7">
          <div className="border-b border-slate-200 px-5 py-3 text-xs font-semibold text-slate-800">
            Scientist Directory ({authors.length})
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading authors...</div>
          ) : authors.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No author entries indexed yet. Process MPR documents to populate the author database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-2.5">Scientist Name</th>
                    <th className="border-b border-slate-200 px-4 py-2.5 text-right">Papers</th>
                    <th className="border-b border-slate-200 px-4 py-2.5 text-right">Chapters</th>
                    <th className="border-b border-slate-200 px-4 py-2.5 text-right">Conferences</th>
                    <th className="border-b border-slate-200 px-4 py-2.5 text-right">Total</th>
                    <th className="border-b border-slate-200 px-4 py-2.5">Years</th>
                    <th className="border-b border-slate-200 px-4 py-2.5 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {authors.map((a) => {
                    const isSelected = selectedAuthor?.id === a.id;
                    const yearsStr = Object.entries(a.year_breakdown)
                      .map(([yr, cnt]) => `${yr} (${cnt})`)
                      .join(', ');
                    return (
                      <tr
                        key={a.id}
                        onClick={() => handleSelectAuthor(a)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-[#0F294A]">{a.name}</div>
                          {a.division && (
                            <div className="text-[11px] text-slate-500">{a.division}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {a.research_papers}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {a.book_chapters}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {a.conference_contributions}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                          {a.total_records}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                          {yearsStr}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(a);
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                            title="Correct author spelling / division"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Scientist Publications Panel */}
        <div className="rounded-md border border-slate-200 bg-white p-5 lg:col-span-5">
          {!selectedAuthor ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-slate-500">
              <Users className="mb-2 h-6 w-6 text-slate-300" />
              Select a scientist from the table to inspect all associated publications, book chapters, and conference contributions.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{selectedAuthor.name}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAuthor.total_records} total record(s) ·{' '}
                    {selectedAuthor.research_papers} papers · {selectedAuthor.book_chapters}{' '}
                    chapters · {selectedAuthor.conference_contributions} conferences
                  </p>
                </div>
                <button
                  onClick={() => openEdit(selectedAuthor)}
                  className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Correct Name
                </button>
              </div>

              <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {authorRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-[#0F294A]">{rec.category}</span>
                      <span className="font-mono">
                        {rec.publication_year || '—'} · {rec.source_filename}
                      </span>
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {rec.title || '(Untitled)'}
                    </div>
                    <div className="mt-1 text-slate-600">Authors: {rec.authors}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] capitalize text-slate-500">
                        Status: {rec.review_status}
                      </span>
                      <button
                        onClick={() => setInspectRec(rec)}
                        className="font-medium text-[#1E3A8A] hover:underline"
                      >
                        Inspect Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Author Correction Modal */}
      {editingAuthor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#0F294A] px-5 py-3.5 text-white">
              <h3 className="text-sm font-semibold">Manual Author Spelling Correction</h3>
              <button onClick={() => setEditingAuthor(null)} className="text-slate-300 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5 text-xs">
              {error && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="mb-1 block font-medium text-slate-700">
                  Author Name (Exact Spelling & Initials)
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Entering an existing exact author name will explicitly merge this author&apos;s records into that name with an audit log entry.
                </p>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">NESAC Division / Group</label>
                <input
                  type="text"
                  value={editDivision}
                  onChange={(e) => setEditDivision(e.target.value)}
                  placeholder="e.g., Remote Sensing & GIS"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                onClick={() => setEditingAuthor(null)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F294A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
              >
                <Save className="h-3.5 w-3.5" />
                Save Author Correction
              </button>
            </div>
          </div>
        </div>
      )}

      <RecordInspectModal
        record={inspectRec}
        onClose={() => setInspectRec(null)}
        onSaved={() => {
          loadAuthors();
          if (selectedAuthor) handleSelectAuthor(selectedAuthor);
          onDataChanged();
        }}
      />
    </div>
  );
}

import { useState } from 'react';
import { Search, ListFilter } from 'lucide-react';
import { auditApi } from '@/admin/server';
import { useAsync, usePaged } from '@/admin/lib';
import { Button, Input, Select, Badge, statusTone, PageHeader, Card, Loading, EmptyState, Paginator, fmtDateTime } from '@/admin/ui';
import type { AuditEntryRow } from '@/admin/types';

interface GroupRow {
  action: string;
  count: number;
}

export function AuditPage() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const { data: groups, reload: reloadGroups } = useAsync<GroupRow[]>(() => auditApi.group(), []);
  const { data, loading, error, page, setPage, reload } = usePaged<AuditEntryRow>((p, ps, extra) =>
    auditApi.list({
      action: String(extra.action ?? '') || undefined,
      success: String(extra.outcome ?? '') || undefined,
      search: String(extra.search ?? '') || undefined,
      page: p,
      pageSize: ps,
    }),
    { pageSize: 25 },
  );

  function apply() {
    reload({ action, search, outcome });
  }

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every admin action, who did it, and whether it succeeded">
        <Button variant="outline" size="sm" onClick={() => { setAction(''); setSearch(''); setOutcome(''); reload({}); reloadGroups(); }}>
          Reset filters
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resource / ID…" className="pl-8 w-56" />
        </form>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56">
          <option value="">All actions</option>
          {groups?.map((g) => <option key={g.action} value={g.action}>{g.action} ({g.count})</option>)}
        </Select>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-36">
          <option value="">Any result</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </Select>
        <Button variant="outline" size="sm" onClick={apply}><ListFilter className="h-3.5 w-3.5" /> Apply</Button>
      </div>

      <Card className="overflow-hidden">
        {loading && <Loading />}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState title="No audit entries matched" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-3 py-3 font-medium">Admin</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                    <th className="px-3 py-3 font-medium">Resource</th>
                    <th className="px-3 py-3 font-medium">Result</th>
                    <th className="px-5 py-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-stone-500">{fmtDateTime(row.timestamp)}</td>
                      <td className="px-3 py-2.5 text-stone-700">{row.adminUser?.email ?? <span className="text-stone-400">—</span>}</td>
                      <td className="px-3 py-2.5">
                        <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-800">{row.action}</code>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-stone-600">
                        {row.resourceType && <span className="text-stone-400">{row.resourceType}:</span>}{' '}
                        <span className="font-mono">{row.resourceId ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5"><Badge tone={row.success ? 'green' : 'red'}>{row.success ? 'ok' : 'fail'}</Badge></td>
                      <td className="px-5 py-2.5 font-mono text-xs text-stone-500">{row.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Paginator page={page} pages={data.pagination.pages} total={data.pagination.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
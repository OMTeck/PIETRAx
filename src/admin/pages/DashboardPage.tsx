import { useMemo } from 'react';
import { Layers, Boxes, FolderKanban, MessageSquare, FileText, CalendarClock, Users, Activity, TrendingUp } from 'lucide-react';
import { overviewApi } from '@/admin/server';
import { useAsync } from '@/admin/lib';
import { Card, Loading, PageHeader, Spinner } from '@/admin/ui';
import type { OverviewData } from '@/admin/types';

function Stat({ icon: Icon, label, value, accent }: { icon: typeof Layers; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded ${accent ?? 'bg-stone-100 text-stone-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none text-stone-900">{value}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-stone-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ label, data, total }: { label: string; data: { date: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card title={label} actions={<span className="text-xs text-stone-500">7 days · {total}</span>}>
      <div className="flex h-28 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.date} className="group relative flex-1">
            <div
              className="w-full rounded-t bg-stone-900/80 transition-colors hover:bg-stone-900"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-[10px] text-ivory opacity-0 transition-opacity group-hover:opacity-100">
              {d.count}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-stone-400">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { data, loading, error, reload } = useAsync<OverviewData>(() => overviewApi.get(), []);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) {
    return (
      <PageHeader title="Dashboard">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={reload} className="text-sm font-medium text-stone-700 underline underline-offset-2">
          Retry
        </button>
      </PageHeader>
    );
  }
  if (!data) return <Loading />;

  const s = data.summary;
  const totalMaterials = s.publishedMaterials + s.draftedMaterials + s.archivedMaterials;

  const quotesTotal = useMemo(() => data.trends.quotes.reduce((a, b) => a + b.count, 0), [data]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="The showroom at a glance" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Stat icon={Layers} label={`Materials · ${s.draftedMaterials} draft`} value={totalMaterials} accent="bg-stone-100 text-stone-700" />
        <Stat icon={Boxes} label="Collections" value={s.collections} />
        <Stat icon={FolderKanban} label="Projects" value={s.projects} />
        <Stat icon={Users} label="Active staff" value={s.activeUsers} />
        <Stat icon={FileText} label="New quotes (7d)" value={s.newQuotes7d} accent="bg-amber-50 text-amber-700" />
        <Stat icon={MessageSquare} label="New messages (7d)" value={s.newMessages7d} accent="bg-sky-50 text-sky-700" />
        <Stat icon={CalendarClock} label="Pending bookings" value={s.pendingBookings} accent="bg-violet-50 text-violet-700" />
        <Stat icon={Activity} label="Active sessions (24h)" value={s.activeSessions24h} accent="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <TrendChart label="Quote requests" data={data.trends.quotes} total={quotesTotal} />
        <TrendChart label="Contact messages" data={data.trends.messages} total={s.newMessages7d} />
        <TrendChart label="Showroom bookings" data={data.trends.bookings} total={s.pendingBookings} />
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-stone-500">
        <TrendingUp className="h-4 w-4" />
        {s.openQuotes} open quote{ s.openQuotes === 1 ? '' : 's'} need attention.
      </div>
    </div>
  );
}
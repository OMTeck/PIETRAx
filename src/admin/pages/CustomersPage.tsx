import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { customersApi } from '@/admin/server';
import { usePaged } from '@/admin/lib';
import { Button, Input, Select, Badge, statusTone, PageHeader, Card, Loading, EmptyState, Paginator, Modal, Textarea, Field, useToast, fmtDateTime } from '@/admin/ui';
import type { QuoteRequestRow, ContactMessageRow, ShowroomBookingRow, QuoteStatus, MessageStatus, BookingStatus } from '@/admin/types';

type Tab = 'quotes' | 'messages' | 'bookings';

const QUOTE_STATUSES: QuoteStatus[] = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'];
const MESSAGE_STATUSES: MessageStatus[] = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'];
const BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

export function CustomersPage() {
  const [tab, setTab] = useState<Tab>('quotes');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { toast } = useToast();
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const quoteList = usePaged<QuoteRequestRow>(
    (p, ps, extra) => customersApi.quotes({ search: String(extra.search ?? '') || undefined, status: String(extra.status ?? '') || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );
  const messageList = usePaged<ContactMessageRow>(
    (p, ps, extra) => customersApi.messages({ search: String(extra.search ?? '') || undefined, status: String(extra.status ?? '') || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );
  const bookingList = usePaged<ShowroomBookingRow>(
    (p, ps, extra) => customersApi.bookings({ search: String(extra.search ?? '') || undefined, status: String(extra.status ?? '') || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );

  const state = tab === 'quotes' ? quoteList : tab === 'messages' ? messageList : bookingList;

  function applyFilters() {
    if (tab === 'quotes') quoteList.reload({ search, status });
    else if (tab === 'messages') messageList.reload({ search, status });
    else bookingList.reload({ search, status });
  }

  const typed =
    tab === 'quotes'
      ? (state.data?.items ?? []) as unknown as QuoteRequestRow[]
      : tab === 'messages'
        ? (state.data?.items ?? []) as unknown as ContactMessageRow[]
        : (state.data?.items ?? []) as unknown as ShowroomBookingRow[];

  return (
    <div>
      <PageHeader title="Customers" subtitle="Leads, inquiries and showroom bookings" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
          {(['quotes', 'messages', 'bookings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatus(''); }}
              className={
                tab === t
                  ? 'rounded-md bg-stone-900 px-4 py-1.5 text-xs font-medium text-ivory'
                  : 'rounded-md px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100'
              }
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <form className="relative" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8" />
        </form>
        {tab === 'quotes' && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={applyFilters}>Apply</Button>
      </div>

      <Card className="overflow-hidden">
        {state.loading && <Loading />}
        {state.error && <p className="px-5 py-6 text-sm text-red-700">{state.error}</p>}
        {!state.loading && !state.error && state.data && (
          <>
            {typed.length === 0 ? (
              <EmptyState title="Nothing here yet" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    {tab === 'quotes' && <>
                      <th className="px-5 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 font-medium">Contact</th>
                      <th className="px-3 py-3 font-medium">Subject / type</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Received</th>
                    </>}
                    {tab === 'messages' && <>
                      <th className="px-5 py-3 font-medium">From</th>
                      <th className="px-3 py-3 font-medium">Contact</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Received</th>
                    </>}
                    {tab === 'bookings' && <>
                      <th className="px-5 py-3 font-medium">Visitor</th>
                      <th className="px-3 py-3 font-medium">Contact</th>
                      <th className="px-3 py-3 font-medium">Requested date</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Received</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {typed.map((row) => {
                    if (tab === 'quotes') {
                      const q = row as QuoteRequestRow;
                      return (
                        <tr key={q.id} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50" onClick={() => setQuoteId(q.id)}>
                          <td className="px-5 py-3 font-medium text-stone-900">{q.customerName}</td>
                          <td className="px-3 py-3 text-stone-600">
                            {q.phone ?? '—'}
                            {q.email && <span className="block text-xs">{q.email}</span>}
                          </td>
                          <td className="px-3 py-3 text-stone-600">{q.projectType ?? 'General'}</td>
                          <td className="px-3 py-3"><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                          <td className="px-5 py-3 text-right text-xs text-stone-500">{fmtDateTime(q.createdAt)}</td>
                        </tr>
                      );
                    }
                    if (tab === 'messages') {
                      const m = row as ContactMessageRow;
                      return (
                        <tr key={m.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                          <td className="px-5 py-3 font-medium text-stone-900">{m.name}</td>
                          <td className="px-3 py-3 text-stone-600">
                            {m.phone ?? '—'}
                            {m.email && <span className="block text-xs">{m.email}</span>}
                          </td>
                          <td className="px-3 py-3">
                            <Select
                              value={m.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                try {
                                  await customersApi.updateMessage(m.id, { status: e.target.value as MessageStatus });
                                  toast('Status updated.', 'success');
                                  messageList.reload();
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Failed to update.', 'error');
                                }
                              }}
                              className="w-32"
                            >
                              {MESSAGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          </td>
                          <td className="px-5 py-3 text-right text-xs text-stone-500">{fmtDateTime(m.createdAt)}</td>
                        </tr>
                      );
                    }
                    const b = row as ShowroomBookingRow;
                    return (
                      <tr key={b.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                        <td className="px-5 py-3 font-medium text-stone-900">{b.name}</td>
                        <td className="px-3 py-3 text-stone-600">
                          {b.phone ?? '—'}
                          {b.email && <span className="block text-xs">{b.email}</span>}
                        </td>
                        <td className="px-3 py-3 text-stone-600">{b.requestDate ? fmtDateTime(b.requestDate) : '—'}</td>
                        <td className="px-3 py-3">
                          <Select
                            value={b.status}
                            onChange={async (e) => {
                              try {
                                await customersApi.updateBooking(b.id, { status: e.target.value as BookingStatus });
                                toast('Status updated.', 'success');
                                bookingList.reload();
                              } catch (err) {
                                toast(err instanceof Error ? err.message : 'Failed to update.', 'error');
                              }
                            }}
                            className="w-36"
                          >
                            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-stone-500">{fmtDateTime(b.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Paginator page={state.page} pages={state.data.pagination.pages} total={state.data.pagination.total} onPage={state.setPage} />
          </>
        )}
      </Card>

      {quoteId && <QuoteDetailModal quoteId={quoteId} onClose={() => setQuoteId(null)} onChanged={() => quoteList.reload()} />}
    </div>
  );
}

function QuoteDetailModal({ quoteId, onClose, onChanged }: { quoteId: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<QuoteRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('NEW');

  useEffect(() => {
    customersApi
      .getQuote(quoteId)
      .then((q) => {
        setData(q);
        setNotes(q.internalNotes ?? '');
        setStatus(q.status);
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Failed to load.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Quote request"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            onClick={async () => {
              try {
                await customersApi.updateQuote(quoteId, { status, internalNotes: notes });
                toast('Quote updated.', 'success');
                onChanged();
                onClose();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed to update.', 'error');
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {loading ? (
        <Loading label="Loading…" />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Name</div><div className="text-sm text-stone-900">{data.customerName}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Status</div>
              <Select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className="w-36">
                {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Phone</div><div className="text-sm">{data.phone ?? '—'}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Email</div><div className="text-sm">{data.email ?? '—'}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Project type</div><div className="text-sm">{data.projectType ?? '—'}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-stone-500">Received</div><div className="text-sm">{fmtDateTime(data.createdAt)}</div></div>
          </div>
          {data.visualizerImage && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-stone-500">Visualizer snapshot</div>
              <img src={data.visualizerImage} alt="" className="max-h-48 rounded object-contain" />
            </div>
          )}
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-stone-500">Message</div>
            <p className="whitespace-pre-wrap rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">{data.message ?? '—'}</p>
          </div>
          <div>
            <Field label="Internal notes">
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only visible to staff…" />
            </Field>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
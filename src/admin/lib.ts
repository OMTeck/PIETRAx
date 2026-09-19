import { useCallback, useEffect, useState } from 'react';
import type { Pagination } from '@/lib/api';

type PageList<T> = { items: T[]; pagination: Pagination };

export function localizedName<T extends { lang: 'AR' | 'EN' }>(rows: T[] | undefined | null, field: keyof T, lang: 'AR' | 'EN'): string {
  const row = (rows ?? []).find((r) => r.lang === lang) ?? rows?.[0];
  const v = row?.[field];
  return String(v ?? '—');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function hexToRgba(hex: string, alpha = 1): string {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- Data-fetching hook ----------------------------------------------------

interface PagedState<T> {
  data: PageList<T> | null;
  loading: boolean;
  error: string;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  reload: (extra?: Record<string, unknown>) => void;
}

export function usePaged<T>(
  loader: (page: number, pageSize: number, extra: Record<string, unknown>) => Promise<PageList<T>>,
  opts: { pageSize?: number; extra?: Record<string, unknown> } = {},
): PagedState<T> {
  const [data, setData] = useState<PageList<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(opts.pageSize ?? 10);
  const [reloadKey, setReloadKey] = useState(0);
  const [extra, setExtra] = useState<Record<string, unknown>>(opts.extra ?? {});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loader(page, pageSize, extra)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, reloadKey, JSON.stringify(extra)]);

  const setPageSize = useCallback((s: number) => {
    setPageSizeState(s);
    setPage(1);
  }, []);

  const reload = useCallback((nextExtra?: Record<string, unknown>) => {
    if (nextExtra) setExtra(nextExtra);
    setPage(1);
    setReloadKey((k) => k + 1);
  }, []);

  return { data, loading, error, page, pageSize, setPage, setPageSize, reload };
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; loading: boolean; error: string; reload: () => void; setData: (d: T | null) => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fn()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}
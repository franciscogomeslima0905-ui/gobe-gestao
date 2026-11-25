import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type AnyRow = Record<string, unknown>;

export async function fetchAllRows(table: string): Promise<AnyRow[]> {
  const size = 1000;
  let from = 0;
  const all: AnyRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    all.push(...((data ?? []) as AnyRow[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return all;
}

export function upsertById<T extends { id: string }>(list: T[], rows: T[]): T[] {
  const map = new Map(list.map((r) => [r.id, r]));
  rows.forEach((r) => map.set(r.id, r));
  return Array.from(map.values());
}

/**
 * Carrega uma tabela inteira e mantém sincronizada em tempo real.
 * `norm` deve ser uma função estável (definida fora do componente).
 */
export function useSyncedTable<T extends { id: string }>(table: string, norm: (r: AnyRow) => T, enabled: boolean) {
  const [rows, setRows] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllRows(table);
      setRows(data.map(norm));
      setError(null);
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Erro ao carregar';
      setError(msg);
    } finally {
      setLoaded(true);
    }
  }, [table, norm]);

  const upsert = useCallback((list: AnyRow[]) => setRows((l) => upsertById(l, list.map(norm))), [norm]);
  const remove = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setRows((l) => l.filter((r) => !set.has(r.id)));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const channel = supabase.channel(`gobe-${table}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as AnyRow)?.id as string | undefined;
        if (id) remove([id]);
      } else upsert([payload.new as AnyRow]);
    });
    channel.subscribe();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, table, load, upsert, remove]);

  return { rows, loaded, error, load, upsert, remove };
}

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { AppSettings } from '../lib/types';
import { useSyncedTable, type AnyRow } from '../lib/useSyncedTable';
import { useAuth } from './AuthContext';

interface Row {
  id: string;
  value: Record<string, unknown>;
}
const norm = (r: AnyRow): Row => ({ id: String(r.id), value: (r.value as Record<string, unknown>) ?? {} });

export const DEFAULT_SETTINGS: AppSettings = {
  pix: { type: 'telefone', key: '', name: 'GB GOBE', city: 'TRAMANDAI' },
  capacity: 0,
};

interface SettingsValue {
  settings: AppSettings;
  available: boolean;
  save: (patch: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session, authorized } = useAuth();
  const t = useSyncedTable('app_settings', norm, !!session && authorized === true);

  const settings = useMemo<AppSettings>(() => {
    const get = (id: string) => t.rows.find((r) => r.id === id)?.value;
    const pix = get('pix') as AppSettings['pix'] | undefined;
    const cap = get('capacity') as { value?: number } | undefined;
    return {
      pix: { ...DEFAULT_SETTINGS.pix, ...(pix ?? {}) },
      capacity: Number(cap?.value) || 0,
    };
  }, [t.rows]);

  const save = useCallback<SettingsValue['save']>(
    async (patch) => {
      const rows: { id: string; value: unknown }[] = [];
      if (patch.pix) rows.push({ id: 'pix', value: patch.pix });
      if (patch.capacity !== undefined) rows.push({ id: 'capacity', value: { value: patch.capacity } });
      if (!rows.length) return;
      const { data, error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'id' }).select();
      if (error) throw error;
      t.upsert((data ?? []) as AnyRow[]);
    },
    [t],
  );

  return <SettingsContext.Provider value={{ settings, available: !t.error, save }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings fora do SettingsProvider');
  return ctx;
};

import { createClient } from '@supabase/supabase-js';

/**
 * Projeto Supabase da GB GOBÊ.
 * A chave "publishable" é pública por natureza (pode ficar no site):
 * quem protege os dados são as regras de segurança (RLS) do banco.
 * Variáveis de ambiente VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, se existirem, têm prioridade.
 */
const DEFAULT_URL = 'https://vdsdamcucnpzrknfsaxn.supabase.co';
const DEFAULT_KEY = 'sb_publishable_V5ThmjExYvuNF9JiW1iidA_3_lNuVsf';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

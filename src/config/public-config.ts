/**
 * Public, non-secret runtime configuration (CB7-FR3/FR4). Only build-time
 * VITE_* values land here — never service-role or admin keys. The Supabase
 * anon key is a public client key and is safe to ship; row-level security on
 * the backend is what protects the data.
 */
import type { DomainEnv } from '../domain/types';
import type { GameTransport } from '../transport/game-transport';
import { FakeTransport } from '../transport/fake-transport';
import { BrowserTransport } from '../transport/browser-transport';

export type TransportKind = 'memory' | 'broadcast' | 'supabase';

export interface PublicConfig {
  readonly transport: TransportKind;
  readonly base: string;
  readonly supabase?: { readonly url: string; readonly anonKey: string };
}

function readSupabase(): PublicConfig['supabase'] {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : undefined;
}

const supabase = readSupabase();

export const publicConfig: PublicConfig = {
  // Default to cross-tab BrowserTransport so the app is "online" with zero infra.
  transport: (import.meta.env.VITE_TRANSPORT as TransportKind | undefined) ?? 'broadcast',
  base: import.meta.env.BASE_URL,
  ...(supabase ? { supabase } : {}),
};

/**
 * Build the configured transport. Supabase (client SDK) is loaded lazily so it
 * is absent from the default bundle unless actually selected.
 */
export async function createTransport(env: DomainEnv): Promise<GameTransport> {
  switch (publicConfig.transport) {
    case 'memory':
      return new FakeTransport(env);
    case 'supabase': {
      if (publicConfig.supabase === undefined) {
        throw new Error('VITE_TRANSPORT=supabase but VITE_SUPABASE_URL/ANON_KEY are not set');
      }
      const [{ createClient }, { SupabaseTransport }] = await Promise.all([
        import('@supabase/supabase-js'),
        import('../transport/supabase-transport'),
      ]);
      const client = createClient(publicConfig.supabase.url, publicConfig.supabase.anonKey);
      return new SupabaseTransport(env, client);
    }
    case 'broadcast':
    default:
      return BrowserTransport.create(env);
  }
}

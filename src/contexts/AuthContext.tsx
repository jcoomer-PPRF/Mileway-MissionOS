import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { createPrivateQueryClient, discardPrivateQueries } from '@/lib/queryClient';
import { DataErrorBoundary } from '@/components/common/DataErrorBoundary';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/db';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** True when the last session belonged to a deactivated account (we signed it out). */
  deactivated: boolean;
  role: UserRole | null;
  isOwner: boolean; // full access incl. settings + user management
  canEditAll: boolean; // owner or manager — edit any operational record
  canWrite: boolean; // owner, manager, or contributor — create records
  canReadFinancials: boolean; // owner, manager, accountant, or auditor
  isAuditor: boolean;
  isAccountant: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deactivated, setDeactivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState(createPrivateQueryClient);
  const clientRef = useRef(client);
  const reload = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    let identity: string | null | undefined;
    let authorizationScope: string | undefined;
    let version = 0;
    let pending: AbortController | undefined;
    async function acceptSession(newSession: Session | null) {
      if (!active) return;
      const ticket = ++version;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      if (identity !== newSession?.user.id) {
        identity = newSession?.user.id ?? null;
        authorizationScope = undefined;
        discardPrivateQueries(clientRef.current);
        clientRef.current = createPrivateQueryClient();
        setClient(clientRef.current);
      }
      setSession(newSession);
      setProfile(null);
      setError(null);
      setLoading(true);
      if (!newSession) {
        setLoading(false);
        return;
      }
      try {
        const result = await supabase
          .from('profiles')
          .select('*')
          .eq('id', newSession.user.id)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (!active || ticket !== version) return;
        if (result.error || !result.data) throw new Error('Your account could not be verified.');
        if (!result.data.is_active) {
          setDeactivated(true);
          discardPrivateQueries(clientRef.current);
          await supabase.auth.signOut();
          return;
        }
        const nextScope = `${newSession.user.id}:${result.data.role}:${result.data.is_active}`;
        if (authorizationScope && authorizationScope !== nextScope) {
          discardPrivateQueries(clientRef.current);
          clientRef.current = createPrivateQueryClient();
          setClient(clientRef.current);
        }
        authorizationScope = nextScope;
        setProfile(result.data as Profile);
      } catch {
        if (active && ticket === version)
          setError('Your account could not be verified. Please retry.');
      } finally {
        if (active && ticket === version) setLoading(false);
      }
    }
    reload.current = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (active) {
          setError('Unable to read your session.');
          setLoading(false);
        }
        return;
      }
      await acceptSession(data.session);
    };
    void reload.current().catch(() => {
      if (active) {
        setError('Unable to read your session.');
        setLoading(false);
      }
    });
    // Do not perform awaited SDK work inside the auth notification lock.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      queueMicrotask(() => {
        void acceptSession(newSession);
      });
    });

    return () => {
      active = false;
      pending?.abort();
      discardPrivateQueries(clientRef.current);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      error,
      deactivated,
      role: profile?.role ?? null,
      isOwner: profile?.role === 'owner',
      canEditAll: profile?.role === 'owner' || profile?.role === 'manager',
      canWrite:
        profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'contributor',
      canReadFinancials:
        profile?.role === 'owner' ||
        profile?.role === 'manager' ||
        profile?.role === 'accountant' ||
        profile?.role === 'auditor',
      isAuditor: profile?.role === 'auditor',
      isAccountant: profile?.role === 'accountant',
      async signInWithEmail(email, password) {
        setDeactivated(false);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signUpWithEmail(email, password, fullName) {
        setDeactivated(false);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        return {
          error: error?.message ?? null,
          needsConfirmation: !error && !data.session,
        };
      },
      async signInWithGoogle() {
        setDeactivated(false);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        discardPrivateQueries(clientRef.current);
        setProfile(null);
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          await reload.current();
          throw signOutError;
        }
      },
      async refreshProfile() {
        await reload.current();
      },
    }),
    [session, profile, loading, deactivated, error],
  );

  return (
    <AuthContext.Provider value={value}>
      <QueryClientProvider client={client}>
        <DataErrorBoundary key={session?.user.id ?? 'signed-out'}>{children}</DataErrorBoundary>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

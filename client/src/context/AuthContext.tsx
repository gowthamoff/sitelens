import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_BASE } from '../config/constants';
import { getToken, setToken, clearToken, installAuthFetch } from '../lib/auth';

export type User = { id: string; email: string; role: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-logout on any 401 from the API
    installAuthFetch(() => { clearToken(); setUser(null); });

    const token = getToken();
    if (!token) { setLoading(false); return; }

    // Validate the stored token and hydrate the user
    fetch(`${API_BASE}/api/auth/me`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('invalid'))))
      .then((d) => setUser(d.user))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function authRequest(path: 'login' | 'register', email: string, password: string) {
    const r = await fetch(`${API_BASE}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Authentication failed');
    setToken(d.token);
    setUser(d.user);
  }

  const value: AuthContextValue = {
    user,
    loading,
    login: (email, password) => authRequest('login', email, password),
    register: (email, password) => authRequest('register', email, password),
    logout: () => { clearToken(); setUser(null); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

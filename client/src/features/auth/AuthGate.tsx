import { useState, type ReactNode, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * Gates the whole app behind login. While validating the stored token → spinner.
 * No user → login / sign-up screen. Authenticated → renders children.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Centered>
        <div style={{ color: 'var(--text-dim, #8b949e)', fontSize: 14 }}>Loading…</div>
      </Centered>
    );
  }
  if (!user) return <AuthScreen />;
  return <>{children}</>;
}

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form
        onSubmit={onSubmit}
        style={{
          width: 340, maxWidth: '90vw', background: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)', borderRadius: 16,
          padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <img src="/logo.png" alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          <div style={{ fontWeight: 800, fontSize: 20, color: '#f0f6fc', letterSpacing: '-0.5px' }}>SiteLens</div>
        </div>
        <div style={{ color: 'var(--text-dim, #8b949e)', fontSize: 13, marginBottom: 4 }}>
          {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
        </div>

        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" style={inputStyle} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <input type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            style={inputStyle} placeholder="At least 8 characters" />
        </Field>

        {error && (
          <div style={{ color: 'var(--danger, #ff7b72)', fontSize: 13, lineHeight: 1.4 }}>{error}</div>
        )}

        <button type="submit" disabled={busy} style={{
          marginTop: 4, padding: '10px 14px', borderRadius: 10, border: 'none',
          background: busy ? '#2d4a6b' : 'var(--accent, #4f9cf9)', color: '#fff',
          fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer',
        }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-dim, #8b949e)' }}>
          {mode === 'login' ? "No account?" : 'Already have an account?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent, #4f9cf9)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </form>
    </Centered>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  background: 'var(--surface2, #21262d)', border: '1px solid var(--border, #30363d)',
  color: 'var(--text, #e6edf3)', fontSize: 14, outline: 'none',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim, #8b949e)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0d1117',
    }}>
      {children}
    </div>
  );
}

'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:4000';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      localStorage.setItem('auth:token', data.token);
      localStorage.setItem('auth:user', JSON.stringify(data.user));
      location.href = '/';
    } catch (e: any) {
      setError(e?.message ?? 'Login failed');
    }
  }

  return (
    <div className="card vstack">
      <h2 style={{ marginTop: 0 }}>Login</h2>
      <div className="vstack">
        <label>Email</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="vstack">
        <label>Password</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <div className="muted">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onLogin}>Login</button>
      </div>
    </div>
  );
}


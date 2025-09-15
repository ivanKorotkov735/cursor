'use client';

import { useEffect, useState } from 'react';

type User = { id: string; email: string; name?: string | null };

export default function AuthBar() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth:user');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  function logout() {
    localStorage.removeItem('auth:token');
    localStorage.removeItem('auth:user');
    setUser(null);
    // soft refresh
    location.href = '/';
  }

  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
      <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}>Art Platform</a>
      {user ? (
        <div className="row" style={{ gap: 12 }}>
          <span className="muted">{user.email}</span>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      ) : (
        <div className="row" style={{ gap: 12 }}>
          <a href="/login">Login</a>
          <a href="/register">Register</a>
        </div>
      )}
    </div>
  );
}


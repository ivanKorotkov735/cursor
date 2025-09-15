'use client';

import { useEffect, useMemo, useState } from 'react';

type Verification = {
  model_version: string;
  score_human: number;
  verdict: 'pass' | 'review' | 'block';
  explanations?: string[];
};

type Artwork = {
  id: string;
  title?: string;
  description?: string;
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
  createdAt: string;
  verification?: Verification;
  priceCents?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export default function Home() {
  const [items, setItems] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageBase = useMemo(() => `${API_BASE}/files/`, []);

  async function load() {
    const res = await fetch(`${API_BASE}/api/artworks`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load artworks');
    const data = await res.json();
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function onSubmit(form: FormData) {
    setLoading(true);
    setError(null);
    try {
      const hdrs: Record<string, string> = {};
      try {
        const token = localStorage.getItem('auth:token');
        if (token) hdrs['Authorization'] = `Bearer ${token}`;
      } catch {}
      const res = await fetch(`${API_BASE}/api/artworks`, {
        method: 'POST',
        body: form,
        headers: hdrs,
      });
      if (!res.ok) throw new Error('Upload failed');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Upload error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vstack" style={{ gap: 24 }}>
      <header className="vstack" style={{ gap: 8 }}>
        <h1 style={{ margin: 0 }}>Art Platform</h1>
        <p className="muted">Upload your artwork. AI will verify authenticity.</p>
      </header>

      <UploadCard onSubmit={onSubmit} loading={loading} />

      {error && <div className="card" style={{ borderColor: '#b91c1c' }}>{error}</div>}

      <section className="vstack" style={{ gap: 12 }}>
        <h2 style={{ margin: 0 }}>Recent artworks</h2>
        <div className="grid">
          {items.map((a) => (
            <article className="card" key={a.id}>
              <div className="vstack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{a.title ?? 'Untitled'}</strong>
                  <span className="muted" title={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <a href={`/art/${a.id}`} style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid #1f2937' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={a.title ?? 'artwork'} src={imageBase + encodeURIComponent(a.filename)} style={{ width: '100%', display: 'block', background: '#0f1115' }} />
                </a>
                {a.description && <p className="muted" style={{ margin: 0 }}>{a.description}</p>}
                {typeof a.priceCents === 'number' && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">${(a.priceCents / 100).toFixed(2)}</span>
                    <a className="btn" href={`/art/${a.id}`}>View</a>
                  </div>
                )}
                {a.verification && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Model: {a.verification.model_version}</span>
                    <span>
                      <Badge verdict={a.verification.verdict} />
                      <span className="muted" style={{ marginLeft: 8 }}>P(human): {(a.verification.score_human * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Badge({ verdict }: { verdict: 'pass' | 'review' | 'block' }) {
  const color = verdict === 'pass' ? '#16a34a' : verdict === 'review' ? '#f59e0b' : '#dc2626';
  return (
    <span style={{ background: color, color: 'white', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
      {verdict}
    </span>
  );
}

function UploadCard({ onSubmit, loading }: { onSubmit: (f: FormData) => void; loading: boolean }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState('5.00');

  return (
    <section className="card vstack">
      <h2 style={{ marginTop: 0 }}>Upload</h2>
      <div className="vstack">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My masterpiece" />
      </div>
      <div className="vstack">
        <label>Description</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="About the artwork" />
      </div>
      <div className="vstack">
        <label>Price (USD)</label>
        <input className="input" type="number" min="1" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="vstack">
        <label>Image</label>
        <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" disabled={!file || loading} onClick={() => {
          if (!file) return;
          const fd = new FormData();
          fd.append('title', title);
          fd.append('description', description);
          const cents = Math.max(100, Math.round(parseFloat(price || '5') * 100));
          fd.append('priceCents', String(cents));
          fd.append('image', file);
          onSubmit(fd);
        }}>{loading ? 'Uploading…' : 'Upload'}</button>
      </div>
    </section>
  );
}


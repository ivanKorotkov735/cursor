import Link from 'next/link';

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

async function getArtwork(id: string): Promise<Artwork | null> {
  const res = await fetch(`${API_BASE}/api/artworks/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.artwork as Artwork;
}

export default async function ArtworkPage({ params }: { params: { id: string } }) {
  const item = await getArtwork(params.id);
  if (!item) {
    return (
      <div className="vstack">
        <p>Not found.</p>
        <Link href="/">Back</Link>
      </div>
    );
  }

  const imageUrl = `${API_BASE}/files/${encodeURIComponent(item.filename)}`;

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <Link href="/">← Back</Link>
      <h1 style={{ margin: 0 }}>{item.title ?? 'Untitled'}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={item.title ?? 'artwork'} src={imageUrl} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #1f2937' }} />
      {item.description && <p className="muted">{item.description}</p>}
      {typeof item.priceCents === 'number' && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Price: ${(item.priceCents / 100).toFixed(2)} USD</strong>
          <BuyButton artworkId={item.id} />
        </div>
      )}
      {item.verification && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Model: {item.verification.model_version}</span>
          <span className="muted">P(human): {(item.verification.score_human * 100).toFixed(1)}%</span>
          <span className="muted">Verdict: {item.verification.verdict}</span>
        </div>
      )}
    </div>
  );
}

function BuyButton({ artworkId }: { artworkId: string }) {
  async function buy() {
    const res = await fetch(`${API_BASE}/api/checkout/${artworkId}`, { method: 'POST' });
    const data = await res.json();
    if (data?.url) {
      location.href = data.url;
    } else if (data?.simulated) {
      alert('Payment simulated: order created.');
    } else {
      alert('Checkout failed');
    }
  }
  return (
    <button className="btn" onClick={buy}>Buy</button>
  );
}


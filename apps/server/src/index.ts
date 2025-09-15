import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

type VerificationResult = {
  model_version: string;
  score_human: number; // 0..1
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
  verification?: VerificationResult;
};

import { prisma } from './db';
import { authMiddleware, loginUser, registerUser, LoginSchema, RegisterSchema } from './auth';
import { isS3Enabled, uploadToS3, getFileSignedUrl } from './s3';
import Stripe from 'stripe';

const app = express();
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

const STORAGE_DIR = process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage/artworks');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// serve stored images statically or redirect to S3 signed URL
if (isS3Enabled()) {
  app.get('/files/:filename', async (req: Request, res: Response) => {
    const key = req.params.filename;
    const url = await getFileSignedUrl(key);
    if (!url) return res.status(404).end();
    res.redirect(url);
  });
} else {
  app.use('/files', express.static(STORAGE_DIR));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${timestamp}_${safeOriginal}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// In-memory was removed; database is the source of truth

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const parsed = RegisterSchema.parse(req.body);
    const user = await registerUser(parsed);
    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const { token, user } = await loginUser(parsed);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    res.status(401).json({ error: e?.message ?? 'Login failed' });
  }
});

app.get('/api/artworks', async (_req: Request, res: Response) => {
  const items = await prisma.artwork.findMany({
    orderBy: { createdAt: 'desc' },
    include: { verification: true },
  });
  const mapped = items.map((a) => ({
    id: a.id,
    title: a.title ?? undefined,
    description: a.description ?? undefined,
    filename: a.filename,
    filepath: a.filepath,
    mimetype: a.mimetype,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
    priceCents: a.priceCents,
    verification: a.verification
      ? {
          model_version: a.verification.modelVersion,
          score_human: a.verification.scoreHuman,
          verdict: a.verification.verdict as 'pass' | 'review' | 'block',
          explanations: a.verification.explanations
            ? a.verification.explanations.split('\n')
            : undefined,
        }
      : undefined,
  }));
  res.json({ items: mapped });
});

app.post('/api/artworks', upload.single('image'), async (req: Request & { userId?: string }, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file field "image"' });
    }

    const { title, description, priceCents } = req.body as { title?: string; description?: string; priceCents?: string };
    const filepath = path.join(STORAGE_DIR, req.file.filename);

    const created = await prisma.artwork.create({
      data: {
        title: title || null,
        description: description || null,
        filename: req.file.filename,
        filepath,
        mimetype: req.file.mimetype,
        size: req.file.size,
        priceCents: Number.isFinite(Number(priceCents)) ? Math.max(100, Math.floor(Number(priceCents))) : 500,
        userId: req.userId ?? null,
      },
    });

    // Call AI verification service
    let verification: VerificationResult | undefined;
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filepath), req.file.filename);

      const aiBase = process.env.AI_URL || 'http://127.0.0.1:8000';
      const aiResponse = await axios.post<VerificationResult>(
        `${aiBase.replace(/\/$/, '')}/verify`,
        formData,
        { headers: formData.getHeaders(), timeout: 15000 }
      );
      verification = aiResponse.data;
    } catch (err) {
      verification = {
        model_version: 'unavailable',
        score_human: 0.5,
        verdict: 'review',
        explanations: ['AI service not reachable']
      };
    }

    // If S3 enabled, upload file to S3 after DB create
    if (isS3Enabled()) {
      try {
        const buf = fs.readFileSync(filepath);
        await uploadToS3(req.file.filename, buf, req.file.mimetype);
      } catch (e) {
        // ignore for MVP; keep local fallback
      }
    }

    if (verification) {
      await prisma.verification.create({
        data: {
          artworkId: created.id,
          modelVersion: verification.model_version,
          scoreHuman: verification.score_human,
          verdict: verification.verdict,
          explanations: verification.explanations?.join('\n') ?? null,
        },
      });
    }

    const out: Artwork = {
      id: created.id,
      title: created.title ?? undefined,
      description: created.description ?? undefined,
      filename: created.filename,
      filepath: created.filepath,
      mimetype: created.mimetype,
      size: created.size,
      createdAt: created.createdAt.toISOString(),
      verification: verification
        ? {
            model_version: verification.model_version,
            score_human: verification.score_human,
            verdict: verification.verdict,
            explanations: verification.explanations,
          }
        : undefined,
    };

    res.status(201).json({ artwork: out });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/artworks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const a = await prisma.artwork.findUnique({ where: { id }, include: { verification: true } });
  if (!a) return res.status(404).json({ error: 'Not found' });
  const item: Artwork = {
    id: a.id,
    title: a.title ?? undefined,
    description: a.description ?? undefined,
    filename: a.filename,
    filepath: a.filepath,
    mimetype: a.mimetype,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
    // @ts-ignore extend type for price on web
    priceCents: (a as any).priceCents,
    verification: a.verification
      ? {
          model_version: a.verification.modelVersion,
          score_human: a.verification.scoreHuman,
          verdict: a.verification.verdict as 'pass' | 'review' | 'block',
          explanations: a.verification.explanations
            ? a.verification.explanations.split('\n')
            : undefined,
        }
      : undefined,
  };
  res.json({ artwork: item });
});

app.post('/api/checkout/:artworkId', async (req: Request & { userId?: string }, res: Response) => {
  const { artworkId } = req.params;
  const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
  if (!artwork) return res.status(404).json({ error: 'Artwork not found' });

  const amount = artwork.priceCents;
  const buyerId = req.userId ?? null;

  // If Stripe keys are not configured, simulate checkout success
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    const order = await prisma.order.create({
      data: {
        artworkId: artwork.id,
        buyerId,
        amountCents: amount,
        status: 'succeeded',
        currency: 'usd',
        stripeSession: null,
      },
    });
    return res.json({ ok: true, simulated: true, orderId: order.id });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });
  const domain = process.env.PUBLIC_WEB_BASE || 'http://127.0.0.1:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: artwork.title || 'Artwork' },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${domain}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${domain}/cancel`,
    metadata: { artworkId: artwork.id, buyerId: buyerId || '' },
  });

  await prisma.order.create({
    data: {
      artworkId: artwork.id,
      buyerId,
      amountCents: amount,
      status: 'pending',
      currency: 'usd',
      stripeSession: session.id,
    },
  });

  res.json({ url: session.url });
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }) as any, async (req: Request, res: Response) => {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret || !signingSecret) return res.status(200).json({ skipped: true });
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

  const sig = req.headers['stripe-signature'] as string;
  let event;
  try {
    event = stripe.webhooks.constructEvent((req as any).body, sig, signingSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const sessionId = session.id as string;
    await prisma.order.updateMany({ where: { stripeSession: sessionId }, data: { status: 'succeeded' } });
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});


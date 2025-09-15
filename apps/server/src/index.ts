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

const app = express();
app.use(cors());
app.use(express.json());

const STORAGE_DIR = '/workspace/storage/artworks';
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// serve stored images statically
app.use('/files', express.static(STORAGE_DIR));

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

const artworks: Artwork[] = [];

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/artworks', (_req: Request, res: Response) => {
  res.json({ items: artworks });
});

app.post('/api/artworks', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file field "image"' });
    }

    const { title, description } = req.body as { title?: string; description?: string };
    const filepath = path.join(STORAGE_DIR, req.file.filename);

    const artwork: Artwork = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      title,
      description,
      filename: req.file.filename,
      filepath,
      mimetype: req.file.mimetype,
      size: req.file.size,
      createdAt: new Date().toISOString(),
    };

    // Call AI verification service
    let verification: VerificationResult | undefined;
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filepath), req.file.filename);

      const aiResponse = await axios.post<VerificationResult>(
        'http://127.0.0.1:8000/verify',
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

    artwork.verification = verification;
    artworks.unshift(artwork);

    res.status(201).json({ artwork });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});


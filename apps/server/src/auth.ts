import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function registerUser(input: z.infer<typeof RegisterSchema>) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new Error('Email already in use');
  const hash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name ?? null, password: hash },
  });
  return user;
}

export async function loginUser(input: z.infer<typeof LoginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new Error('Invalid credentials');
  const ok = await bcrypt.compare(input.password, user.password);
  if (!ok) throw new Error('Invalid credentials');
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user };
}

export function authMiddleware(req: Request & { userId?: string }, _res: Response, next: NextFunction) {
  const hdr = req.headers['authorization'];
  if (!hdr || !hdr.startsWith('Bearer ')) return next();
  const token = hdr.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
    if (payload?.sub) req.userId = payload.sub;
  } catch {
    // ignore invalid token
  }
  next();
}


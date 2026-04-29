import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
const prisma = new PrismaClient();
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const authSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

const auth = (roles = []) => (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    if (roles.length && !roles.includes(data.role)) return res.status(403).json({ error: 'Sem permissão' });
    req.user = data;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

app.post('/api/auth/register-admin', async (req, res) => {
  const { email, password } = authSchema.parse(req.body);
  const name = req.body.name || 'Administrador';
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(400).json({ error: 'Email já cadastrado' });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash, role: 'ADMIN' } });
  res.status(201).json({ id: user.id });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = authSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, commission: user.commission } });
});

app.get('/api/products', auth(), async (_, res) => res.json(await prisma.product.findMany({ orderBy: { createdAt: 'desc' } })));
app.post('/api/products', auth(['ADMIN']), async (req, res) => {
  const schema = z.object({ name: z.string().min(2), costPrice: z.number().positive(), salePrice: z.number().positive(), stock: z.number().int().nonnegative() });
  const data = schema.parse(req.body);
  res.status(201).json(await prisma.product.create({ data }));
});
app.put('/api/products/:id', auth(['ADMIN']), async (req, res) => res.json(await prisma.product.update({ where: { id: req.params.id }, data: req.body })));
app.delete('/api/products/:id', auth(['ADMIN']), async (req, res) => { await prisma.product.delete({ where: { id: req.params.id } }); res.status(204).send(); });

app.post('/api/sellers', auth(['ADMIN']), async (req, res) => {
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), commission: z.number().min(0).max(100) });
  const data = schema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash, commission: data.commission, role: 'SELLER' } });
  res.status(201).json(user);
});
app.get('/api/sellers', auth(['ADMIN']), async (_, res) => res.json(await prisma.user.findMany({ where: { role: 'SELLER' } })));

app.post('/api/consignments', auth(['ADMIN']), async (req, res) => {
  const schema = z.object({ sellerId: z.string(), items: z.array(z.object({ productId: z.string(), quantitySent: z.number().int().positive() })).min(1) });
  const data = schema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    for (const it of data.items) {
      const p = await tx.product.findUnique({ where: { id: it.productId } });
      if (!p || p.stock < it.quantitySent) throw new Error('Estoque insuficiente');
      await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.quantitySent } } });
    }
    return tx.consignment.create({ data: { sellerId: data.sellerId, items: { create: data.items } }, include: { items: true } });
  });
  res.status(201).json(result);
});

app.get('/api/consignments', auth(), async (req, res) => {
  const where = req.user.role === 'SELLER' ? { sellerId: req.user.id } : {};
  const list = await prisma.consignment.findMany({ where, include: { items: { include: { product: true } }, seller: true, settlement: true }, orderBy: { createdAt: 'desc' } });
  res.json(list);
});

app.post('/api/settlements/:consignmentId', auth(), async (req, res) => {
  const schema = z.object({ items: z.array(z.object({ itemId: z.string(), quantitySold: z.number().int().nonnegative(), quantityReturn: z.number().int().nonnegative() })) });
  const data = schema.parse(req.body);
  const consignment = await prisma.consignment.findUnique({ where: { id: req.params.consignmentId }, include: { items: { include: { product: true } }, seller: true } });
  if (!consignment) return res.status(404).json({ error: 'Consignação não encontrada' });
  if (req.user.role === 'SELLER' && consignment.sellerId !== req.user.id) return res.status(403).json({ error: 'Sem acesso' });

  const summary = await prisma.$transaction(async tx => {
    let totalSold = 0;
    for (const i of data.items) {
      const item = consignment.items.find(x => x.id === i.itemId);
      if (!item) continue;
      if (i.quantitySold + i.quantityReturn > item.quantitySent) throw new Error('Quantidade inválida');
      totalSold += Number(item.product.salePrice) * i.quantitySold;
      await tx.consignmentItem.update({ where: { id: i.itemId }, data: { quantitySold: i.quantitySold, quantityReturn: i.quantityReturn } });
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: i.quantityReturn } } });
    }
    const commissionPct = Number(consignment.seller.commission || 0) / 100;
    const commissionAmt = totalSold * commissionPct;
    const adminReceivable = totalSold - commissionAmt;
    return tx.settlement.create({ data: { consignmentId: consignment.id, sellerId: consignment.sellerId, totalSold, commissionAmt, adminReceivable } });
  });
  res.status(201).json(summary);
});

app.get('/api/dashboard', auth(['ADMIN']), async (req, res) => {
  const monthStart = new Date(req.query.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const monthEnd = new Date(req.query.end || new Date());
  const settlements = await prisma.settlement.findMany({ where: { settledAt: { gte: monthStart, lte: monthEnd } }, include: { seller: true } });
  const totalSold = settlements.reduce((a, s) => a + Number(s.totalSold), 0);
  const lucro = settlements.reduce((a, s) => a + Number(s.adminReceivable), 0);
  res.json({ totalSold, lucro, ranking: settlements.reduce((acc, s) => ({ ...acc, [s.seller.name]: (acc[s.seller.name] || 0) + Number(s.totalSold) }), {}) });
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
  res.status(400).json({ error: err.message || 'Erro interno' });
});

app.listen(process.env.PORT || 4000, () => console.log('API running'));

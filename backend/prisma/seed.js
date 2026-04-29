import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
const run = async () => {
  const pass = await bcrypt.hash('123456', 12);
  await prisma.user.upsert({ where: { email: 'admin@local.com' }, update: {}, create: { name: 'Admin', email: 'admin@local.com', passwordHash: pass, role: 'ADMIN' } });
  await prisma.product.createMany({ data: [
    { name: 'Blusa Floral', costPrice: 40, salePrice: 89.9, stock: 30 },
    { name: 'Calça Jeans', costPrice: 60, salePrice: 129.9, stock: 20 }
  ], skipDuplicates: true });
};
run().finally(() => prisma.$disconnect());

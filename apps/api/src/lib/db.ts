import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const log = config.isTest ? [] : config.env === 'development' ? ['warn', 'error'] : ['error'];

export const prisma = new PrismaClient({ log: log as ('warn' | 'error')[] });

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

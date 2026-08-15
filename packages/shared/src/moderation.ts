import { z } from 'zod';
import type { PaginationMeta } from './common.js';
import { paginationQuery } from './common.js';
import { reportStatus, reportTarget } from './enums.js';
import type { ReportStatus, ReportTarget } from './enums.js';
import type { AuthorDto } from './forum.js';

export const createReportBody = z.object({
  targetType: reportTarget,
  targetId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, 'Scrie pe scurt ce e în neregulă').max(255),
});
export type CreateReportBody = z.infer<typeof createReportBody>;

export const reportListQuery = paginationQuery.extend({
  status: reportStatus.default('open'),
});
export type ReportListQuery = z.infer<typeof reportListQuery>;

export const resolveReportBody = z.object({
  status: z.enum(['resolved', 'dismissed']),
  // coerce would read the string "false" as true and delete content nobody asked to delete
  deleteTarget: z.boolean().default(false),
});
export type ResolveReportBody = z.infer<typeof resolveReportBody>;

/** the polymorphic target resolved in code so the queue reads without extra calls */
export type ReportTargetDto = {
  title: string;
  excerpt: string | null;
  link: string | null;
  isDeleted: boolean;
} | null;

export type ReportDto = {
  id: number;
  targetType: ReportTarget;
  targetId: number;
  reason: string | null;
  status: ReportStatus;
  reporter: AuthorDto;
  handledBy: AuthorDto;
  handledAt: string | null;
  createdAt: string;
  target: ReportTargetDto;
};

export type ReportCountsDto = Record<ReportStatus, number>;

/** the counts travel with the queue so the badge needs no second call */
export type ReportListMeta = PaginationMeta & { counts: ReportCountsDto };

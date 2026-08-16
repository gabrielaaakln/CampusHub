import { z } from 'zod';
import { isoDate, isoDateTime, paginationQuery } from './common.js';
import { deadlineType } from './enums.js';
import type { DeadlineType } from './enums.js';
import type { AuthorDto } from './forum.js';

export const deadlineListQuery = paginationQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export type DeadlineListQuery = z.infer<typeof deadlineListQuery>;

export const createDeadlineBody = z.object({
  title: z.string().trim().min(3, 'Titlul are cel puțin 3 caractere').max(200),
  type: deadlineType.default('tema'),
  dueAt: isoDateTime,
  subjectId: z.coerce.number().int().positive().nullish(),
  description: z.string().trim().max(2_000).optional(),
  /** absent means the group of the person who writes it */
  groupId: z.coerce.number().int().positive().nullish(),
});
export type CreateDeadlineBody = z.infer<typeof createDeadlineBody>;

export const updateDeadlineBody = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  type: deadlineType.optional(),
  dueAt: isoDateTime.optional(),
  subjectId: z.coerce.number().int().positive().nullish(),
  description: z.string().trim().max(2_000).nullish(),
});
export type UpdateDeadlineBody = z.infer<typeof updateDeadlineBody>;

export type DeadlineDto = {
  id: number;
  title: string;
  type: DeadlineType;
  dueAt: string;
  description: string | null;
  subject: { id: number; name: string; shortName: string | null } | null;
  group: { id: number; name: string } | null;
  author: AuthorDto;
  isMine: boolean;
  createdAt: string;
};

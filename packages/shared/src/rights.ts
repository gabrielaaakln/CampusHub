import { z } from 'zod';
import type { PaginationMeta } from './common.js';
import { paginationQuery } from './common.js';

export const rightsListQuery = paginationQuery.extend({
  q: z.string().trim().min(2).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
});
export type RightsListQuery = z.infer<typeof rightsListQuery>;

export type RightsArticleDto = {
  id: number;
  category: string;
  title: string;
  summary: string;
  officialUrl: string | null;
  updatedAt: string;
};

/** the categories travel with the list so the filter needs no second call */
export type RightsListMeta = PaginationMeta & { categories: string[] };

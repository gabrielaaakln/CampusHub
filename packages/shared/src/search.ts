import { z } from 'zod';

export const searchTypes = ['post', 'listing', 'rights'] as const;
export const searchType = z.enum(searchTypes);
export type SearchType = z.infer<typeof searchType>;

export const searchQuery = z.object({
  q: z.string().trim().min(2, 'Scrie cel puțin două caractere').max(120),
  type: searchType.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export type SearchHitDto = {
  type: SearchType;
  id: number;
  title: string;
  excerpt: string | null;
  meta: string | null;
  link: string;
};

export type SearchCountsDto = Record<SearchType, number>;

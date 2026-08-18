import { z } from 'zod';
import { isoDate, isoDateTime, paginationQuery } from './common.js';
import type { AuthorDto } from './forum.js';

export const eventListQuery = paginationQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export type EventListQuery = z.infer<typeof eventListQuery>;

export const createEventBody = z
  .object({
    title: z.string().trim().min(5, 'Titlul are cel puțin 5 caractere').max(200),
    description: z.string().trim().max(5_000).optional(),
    location: z.string().trim().max(200).optional(),
    roomId: z.coerce.number().int().positive().nullish(),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullish(),
    externalUrl: z.url().max(255).optional(),
  })
  .refine((e) => !e.endsAt || e.endsAt > e.startsAt, {
    message: 'Evenimentul se termină înainte să înceapă',
    path: ['endsAt'],
  });
export type CreateEventBody = z.infer<typeof createEventBody>;

export type EventDto = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  room: { id: number; number: string; building: string } | null;
  startsAt: string;
  endsAt: string | null;
  externalUrl: string | null;
  author: AuthorDto;
  attendeeCount: number;
  isAttending: boolean;
  createdAt: string;
};

import { z } from 'zod';
import { paginationQuery } from './common.js';
import { listingKind, listingStatus, requestStatus } from './enums.js';
import type { ListingKind, ListingStatus, RequestStatus } from './enums.js';

export const listingListQuery = paginationQuery.extend({
  kind: listingKind.optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(120).optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export type ListingListQuery = z.infer<typeof listingListQuery>;

export const createListingBody = z.object({
  kind: listingKind,
  subjectId: z.coerce.number().int().positive().nullish(),
  title: z.string().trim().min(5, 'Titlul are cel puțin 5 caractere').max(200),
  description: z.string().trim().max(5_000).optional(),
  price: z.coerce.number().min(0).max(999_999).nullish(),
  priceUnit: z.string().trim().max(20).optional(),
});
export type CreateListingBody = z.infer<typeof createListingBody>;

export const updateListingBody = z.object({
  status: listingStatus.optional(),
  price: z.coerce.number().min(0).max(999_999).nullish(),
  description: z.string().trim().max(5_000).optional(),
});
export type UpdateListingBody = z.infer<typeof updateListingBody>;

export const createRequestBody = z.object({
  message: z.string().trim().max(1_000).optional(),
});
export type CreateRequestBody = z.infer<typeof createRequestBody>;

export const updateRequestBody = z.object({ status: requestStatus });
export type UpdateRequestBody = z.infer<typeof updateRequestBody>;

export type ListingDto = {
  id: number;
  kind: ListingKind;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  priceUnit: string | null;
  status: ListingStatus;
  subject: { id: number; name: string } | null;
  author: { id: number; displayName: string; groupName: string | null } | null;
  isMine: boolean;
  requestCount: number;
  myRequestStatus: RequestStatus | null;
  createdAt: string;
};

export type ListingRequestDto = {
  id: number;
  listingId: number;
  listingTitle: string;
  message: string | null;
  status: RequestStatus;
  requester: { id: number; displayName: string; groupName: string | null } | null;
  createdAt: string;
};

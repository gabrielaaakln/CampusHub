import type { Prisma } from '@prisma/client';
import type { ListingDto, ListingListQuery, ListingRequestDto } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
// the contact goes through listing_requests so the mail address is never exposed
import { authorSelect, toAuthor } from '../../lib/author.js';
import { notFound } from '../../lib/errors.js';

const listingInclude = {
  author: { select: authorSelect },
  subject: { select: { id: true, name: true } },
  _count: { select: { requests: true } },
} satisfies Prisma.ListingInclude;

type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

export async function listListings(
  facultyId: number,
  query: ListingListQuery,
  viewerId: number | null,
) {
  const where: Prisma.ListingWhereInput = {
    facultyId,
    isDeleted: false,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
    ...(query.mine === 'true' && viewerId ? { authorId: viewerId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: listingInclude,
    }),
    prisma.listing.count({ where }),
  ]);

  const mine = await myRequests(
    viewerId,
    rows.map((r) => r.id),
  );

  return {
    data: rows.map((row) => toListingDto(row, viewerId, mine.get(row.id) ?? null)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
    },
  };
}

export async function listingById(
  facultyId: number,
  id: number,
  viewerId: number | null,
): Promise<ListingDto> {
  const row = await prisma.listing.findFirst({
    where: { id, facultyId, isDeleted: false },
    include: listingInclude,
  });
  if (!row) throw notFound('Anunțul nu există');

  const mine = await myRequests(viewerId, [row.id]);
  return toListingDto(row, viewerId, mine.get(row.id) ?? null);
}

async function myRequests(viewerId: number | null, listingIds: number[]) {
  if (!viewerId || listingIds.length === 0) return new Map<number, ListingDto['myRequestStatus']>();
  const rows = await prisma.listingRequest.findMany({
    where: { requesterId: viewerId, listingId: { in: listingIds } },
    select: { listingId: true, status: true },
  });
  return new Map(rows.map((row) => [row.listingId, row.status]));
}

/** requests on my listings plus the ones i sent so one screen answers both */
export async function requestsFor(userId: number): Promise<{
  received: ListingRequestDto[];
  sent: ListingRequestDto[];
}> {
  const [received, sent] = await Promise.all([
    prisma.listingRequest.findMany({
      where: { listing: { authorId: userId, isDeleted: false } },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true } },
        requester: { select: authorSelect },
      },
    }),
    prisma.listingRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true } },
        requester: { select: authorSelect },
      },
    }),
  ]);

  const toDto = (row: (typeof received)[number]): ListingRequestDto => ({
    id: row.id,
    listingId: row.listing.id,
    listingTitle: row.listing.title,
    message: row.message,
    status: row.status,
    requester: toAuthor(row.requester),
    createdAt: row.createdAt.toISOString(),
  });

  return { received: received.map(toDto), sent: sent.map(toDto) };
}

function toListingDto(
  row: ListingRow,
  viewerId: number | null,
  myRequestStatus: ListingDto['myRequestStatus'],
): ListingDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    // prisma reads decimal as its own type and json would carry an object
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    priceUnit: row.priceUnit,
    status: row.status,
    subject: row.subject,
    author: toAuthor(row.author),
    isMine: viewerId !== null && row.authorId === viewerId,
    requestCount: row._count.requests,
    myRequestStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

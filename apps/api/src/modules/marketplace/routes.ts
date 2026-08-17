import { Router } from 'express';
import {
  createListingBody,
  createRequestBody,
  idParam,
  listingListQuery,
  updateListingBody,
  updateRequestBody,
} from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { listListings, listingById, requestsFor } from './service.js';

export const marketplaceRouter: Router = Router();

const listSchemas = { query: listingListQuery };

marketplaceRouter.get('/listings', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  res.json(await listListings(config.facultyId, query, req.user?.id ?? null));
});

const createSchemas = { body: createListingBody };

marketplaceRouter.post('/listings', requireAuth, writeLimiter, validate(createSchemas), async (req, res) => {
  const { body } = valid<typeof createSchemas>(req);

  const created = await prisma.listing.create({
    data: {
      facultyId: config.facultyId,
      authorId: req.user!.id,
      kind: body.kind,
      subjectId: body.subjectId ?? null,
      title: body.title,
      description: body.description ?? null,
      price: body.price ?? null,
      priceUnit: body.priceUnit ?? null,
    },
    select: { id: true },
  });

  res.status(201).json({ data: await listingById(config.facultyId, created.id, req.user!.id) });
});

// declared before /listings/:id so requests is not read as an id
marketplaceRouter.get('/listings/requests', requireAuth, async (req, res) => {
  res.json({ data: await requestsFor(req.user!.id) });
});

marketplaceRouter.get('/listings/:id', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  res.json({ data: await listingById(config.facultyId, params.id, req.user?.id ?? null) });
});

const patchSchemas = { params: idParam, body: updateListingBody };

marketplaceRouter.patch('/listings/:id', requireAuth, validate(patchSchemas), async (req, res) => {
  const { params, body } = valid<typeof patchSchemas>(req);
  const listing = await mineOrFail(params.id, req.user!.id, req.user!.role);

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.price === undefined ? {} : { price: body.price }),
      ...(body.description === undefined ? {} : { description: body.description }),
    },
  });

  res.json({ data: await listingById(config.facultyId, listing.id, req.user!.id) });
});

marketplaceRouter.delete('/listings/:id', requireAuth, validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  const listing = await mineOrFail(params.id, req.user!.id, req.user!.role);
  await prisma.listing.update({ where: { id: listing.id }, data: { isDeleted: true } });
  res.status(204).end();
});

const requestSchemas = { params: idParam, body: createRequestBody };

marketplaceRouter.post(
  '/listings/:id/requests',
  requireAuth,
  writeLimiter,
  validate(requestSchemas),
  async (req, res) => {
    const { params, body } = valid<typeof requestSchemas>(req);
    const listing = await listingById(config.facultyId, params.id, req.user!.id);

    if (listing.isMine) throw badRequest('Nu poți cere contactul propriului anunț');
    if (listing.status === 'inchis') throw conflict('Anunțul e închis');
    if (listing.myRequestStatus) throw conflict('Ai trimis deja o cerere pentru acest anunț');

    const created = await prisma.listingRequest.create({
      data: { listingId: listing.id, requesterId: req.user!.id, message: body.message ?? null },
      select: { id: true },
    });

    // the owner finds out without the application exposing any mail address
    const owner = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { authorId: true },
    });
    await prisma.notification.create({
      data: {
        userId: owner.authorId,
        type: 'listing_request',
        title: 'Cerere nouă la un anunț',
        body: `${req.user!.displayName} e interesat de „${listing.title}”.`,
        link: `/anunturi/${listing.id}`,
      },
    });

    res.status(201).json({ data: { id: created.id, status: 'pending' } });
  },
);

const requestPatchSchemas = { params: idParam, body: updateRequestBody };

marketplaceRouter.patch(
  '/requests/:id',
  requireAuth,
  validate(requestPatchSchemas),
  async (req, res) => {
    const { params, body } = valid<typeof requestPatchSchemas>(req);
    const request = await prisma.listingRequest.findFirst({
      where: { id: params.id, listing: { facultyId: config.facultyId } },
      include: { listing: { select: { id: true, title: true, authorId: true } } },
    });
    if (!request) throw notFound('Cererea nu există');
    if (request.listing.authorId !== req.user!.id) throw forbidden();

    await prisma.listingRequest.update({ where: { id: request.id }, data: { status: body.status } });

    await prisma.notification.create({
      data: {
        userId: request.requesterId,
        type: 'listing_request_answered',
        title: 'Ai un răspuns la cererea ta',
        body: `„${request.listing.title}”: ${STATUS_TEXT[body.status]}`,
        link: `/anunturi/${request.listing.id}`,
      },
    });

    res.json({ data: { id: request.id, status: body.status } });
  },
);

const STATUS_TEXT: Record<string, string> = {
  pending: 'în așteptare',
  accepted: 'cerere acceptată',
  declined: 'cerere refuzată',
  completed: 'tranzacție încheiată',
};

async function mineOrFail(id: number, userId: number, role: string) {
  const listing = await prisma.listing.findFirst({
    where: { id, facultyId: config.facultyId, isDeleted: false },
    select: { id: true, authorId: true },
  });
  if (!listing) throw notFound('Anunțul nu există');
  if (listing.authorId !== userId && role === 'student') throw forbidden();
  return listing;
}

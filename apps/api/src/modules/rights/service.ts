import type { Prisma } from '@prisma/client';
import type { RightsArticleDto, RightsListMeta, RightsListQuery } from '@campushub/shared';
import { prisma } from '../../lib/db.js';

type RightsRow = Prisma.RightsArticleGetPayload<object>;

// a null faculty means the article applies to the whole university
const scope = (facultyId: number): Prisma.RightsArticleWhereInput => ({
  OR: [{ facultyId }, { facultyId: null }],
});

/**
 * full text through raw sql prisma client cannot filter a tsvector column
 * ro_unaccent means a search without diacritics finds the same rows
 */
async function rankedIds(facultyId: number, q: string, category?: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id
      FROM rights_articles
     WHERE (faculty_id = ${facultyId} OR faculty_id IS NULL)
       AND (${category ?? null}::text IS NULL OR category = ${category ?? null})
       AND search_vector @@ websearch_to_tsquery('ro_unaccent', ${q})
     ORDER BY ts_rank(search_vector, websearch_to_tsquery('ro_unaccent', ${q})) DESC,
              "position" ASC, id ASC`;
  return rows.map((row) => row.id);
}

export async function listRights(
  facultyId: number,
  query: RightsListQuery,
): Promise<{ data: RightsArticleDto[]; meta: RightsListMeta }> {
  const skip = (query.page - 1) * query.limit;
  const categories = await listCategories(facultyId);

  let rows: RightsRow[];
  let total: number;

  if (query.q) {
    const ranked = await rankedIds(facultyId, query.q, query.category);
    total = ranked.length;
    const pageIds = ranked.slice(skip, skip + query.limit);
    const found = await prisma.rightsArticle.findMany({ where: { id: { in: pageIds } } });
    const byId = new Map(found.map((row) => [row.id, row]));
    // the database ordered by rank the in clause does not keep that order
    rows = pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  } else {
    const where: Prisma.RightsArticleWhereInput = {
      ...scope(facultyId),
      ...(query.category ? { category: query.category } : {}),
    };
    [rows, total] = await Promise.all([
      prisma.rightsArticle.findMany({
        where,
        orderBy: [{ category: 'asc' }, { position: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      prisma.rightsArticle.count({ where }),
    ]);
  }

  return {
    data: rows.map(toDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
      categories,
    },
  };
}

export async function listCategories(facultyId: number): Promise<string[]> {
  const rows = await prisma.rightsArticle.groupBy({
    by: ['category'],
    where: scope(facultyId),
    orderBy: { category: 'asc' },
  });
  return rows.map((row) => row.category);
}

function toDto(row: RightsRow): RightsArticleDto {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    summary: row.summary,
    officialUrl: row.officialUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

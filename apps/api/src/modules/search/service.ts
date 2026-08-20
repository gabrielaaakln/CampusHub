import type { SearchCountsDto, SearchHitDto, SearchQuery, SearchType } from '@campushub/shared';
import { prisma } from '../../lib/db.js';

const EXCERPT = 200;

type Row = { id: number; title: string; body: string | null; meta: string | null; rank: number };

const cut = (text: string | null): string | null =>
  text === null ? null : text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;

/**
 * one raw query per type prisma client cannot filter a tsvector column
 * the parameters go through the tagged template so nothing is concatenated by hand
 */
async function posts(facultyId: number, q: string, limit: number): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT p.id,
           p.title,
           p.content AS body,
           c.name AS meta,
           ts_rank(p.search_vector, websearch_to_tsquery('ro_unaccent', ${q})) AS rank
      FROM forum_posts p
      JOIN forum_categories c ON c.id = p.category_id
     WHERE c.faculty_id = ${facultyId}
       AND NOT p.is_deleted
       AND p.search_vector @@ websearch_to_tsquery('ro_unaccent', ${q})
     ORDER BY rank DESC, p.created_at DESC
     LIMIT ${limit}`;
}

async function listings(facultyId: number, q: string, limit: number): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT l.id,
           l.title,
           l.description AS body,
           l.kind::text AS meta,
           ts_rank(l.search_vector, websearch_to_tsquery('ro_unaccent', ${q})) AS rank
      FROM listings l
     WHERE l.faculty_id = ${facultyId}
       AND NOT l.is_deleted
       AND l.search_vector @@ websearch_to_tsquery('ro_unaccent', ${q})
     ORDER BY rank DESC, l.created_at DESC
     LIMIT ${limit}`;
}

async function rights(facultyId: number, q: string, limit: number): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT r.id,
           r.title,
           r.summary AS body,
           r.category AS meta,
           ts_rank(r.search_vector, websearch_to_tsquery('ro_unaccent', ${q})) AS rank
      FROM rights_articles r
     WHERE (r.faculty_id = ${facultyId} OR r.faculty_id IS NULL)
       AND r.search_vector @@ websearch_to_tsquery('ro_unaccent', ${q})
     ORDER BY rank DESC, r."position" ASC
     LIMIT ${limit}`;
}

const LINK: Record<SearchType, (id: number) => string> = {
  post: (id) => `/forum/${id}`,
  listing: (id) => `/anunturi/${id}`,
  rights: () => '/drepturi',
};

export async function search(
  facultyId: number,
  query: SearchQuery,
): Promise<{ data: SearchHitDto[]; meta: { q: string; counts: SearchCountsDto } }> {
  const wanted: SearchType[] = query.type ? [query.type] : ['post', 'listing', 'rights'];
  const runners: Record<SearchType, (f: number, q: string, l: number) => Promise<Row[]>> = {
    post: posts,
    listing: listings,
    rights,
  };

  const found = await Promise.all(
    wanted.map(async (type) => ({
      type,
      rows: await runners[type](facultyId, query.q, query.limit),
    })),
  );

  const counts: SearchCountsDto = { post: 0, listing: 0, rights: 0 };
  const hits: (SearchHitDto & { rank: number })[] = [];

  for (const { type, rows } of found) {
    counts[type] = rows.length;
    for (const row of rows) {
      hits.push({
        type,
        id: row.id,
        title: row.title,
        excerpt: cut(row.body),
        meta: row.meta,
        link: LINK[type](row.id),
        rank: Number(row.rank),
      });
    }
  }

  // one ranked list across the three sources the type is a label not a section
  hits.sort((a, b) => b.rank - a.rank);
  return {
    data: hits.map(({ rank: _rank, ...hit }) => hit),
    meta: { q: query.q, counts },
  };
}

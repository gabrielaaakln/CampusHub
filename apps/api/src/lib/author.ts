import type { Prisma } from '@prisma/client';
import type { AuthorDto } from '@campushub/shared';

export const authorSelect = {
  id: true,
  displayName: true,
  anonymizedAt: true,
  group: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type AuthorRow = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

/** the mail address never leaves the server not even to a moderator */
export function toAuthor(user: AuthorRow | null): AuthorDto {
  if (!user) return null;
  if (user.anonymizedAt) return { id: user.id, displayName: 'Utilizator șters', groupName: null };
  return { id: user.id, displayName: user.displayName, groupName: user.group?.name ?? null };
}

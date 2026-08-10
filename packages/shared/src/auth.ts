import { z } from 'zod';
import { userRole } from './enums.js';

export const PASSWORD_MIN_LENGTH = 10;

export const registerBody = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.email().max(200),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  groupId: z.number().int().positive().optional(),
  subgroup: z.number().int().min(1).max(4).optional(),
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

export const updateProfileBody = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  groupId: z.number().int().positive().nullable().optional(),
  subgroup: z.number().int().min(1).max(4).nullable().optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

export const sessionUser = z.object({
  id: z.number().int(),
  displayName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: userRole,
  facultyId: z.number().int().nullable(),
  groupId: z.number().int().nullable(),
  groupName: z.string().nullable(),
  subgroup: z.number().int().nullable(),
  avatarUrl: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUser>;

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/** accepts the domain itself and any subdomain of it */
export function isAllowedEmailDomain(email: string, allowed: readonly string[]): boolean {
  const domain = emailDomain(email);
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

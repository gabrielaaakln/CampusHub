import { z } from 'zod';

// values mirror the postgres enums one to one

export const dayOfWeek = z.enum([
  'luni',
  'marti',
  'miercuri',
  'joi',
  'vineri',
  'sambata',
  'duminica',
]);
export type DayOfWeek = z.infer<typeof dayOfWeek>;

// monday is 1 in luxon and the enum is ordered the same way
export const DAY_BY_ISO_WEEKDAY: readonly DayOfWeek[] = dayOfWeek.options;

export const classType = z.enum(['curs', 'seminar', 'laborator', 'proiect']);
export type ClassType = z.infer<typeof classType>;

export const weekParity = z.enum(['par', 'impar', 'ambele']);
export type WeekParity = z.infer<typeof weekParity>;

export const scheduleSource = z.enum(['manual', 'import', 'scraper']);
export type ScheduleSource = z.infer<typeof scheduleSource>;

export const scheduleChangeKind = z.enum(['added', 'changed', 'removed']);
export type ScheduleChangeKind = z.infer<typeof scheduleChangeKind>;

export const scrapeStatus = z.enum(['success', 'partial', 'failed']);
export type ScrapeStatus = z.infer<typeof scrapeStatus>;

export const roomType = z.enum(['curs', 'seminar', 'laborator', 'birou', 'altele']);
export type RoomType = z.infer<typeof roomType>;

export const userRole = z.enum(['student', 'moderator', 'admin']);
export type UserRole = z.infer<typeof userRole>;

export const authProvider = z.enum(['local', 'sso', 'mock']);
export type AuthProvider = z.infer<typeof authProvider>;

export const breakKind = z.enum(['vacanta', 'sesiune', 'practica', 'zi_libera']);
export type BreakKind = z.infer<typeof breakKind>;

export const deadlineType = z.enum(['tema', 'examen', 'proiect', 'altele']);
export type DeadlineType = z.infer<typeof deadlineType>;

export const listingKind = z.enum(['produs', 'serviciu']);
export type ListingKind = z.infer<typeof listingKind>;

export const listingStatus = z.enum(['activ', 'rezervat', 'inchis']);
export type ListingStatus = z.infer<typeof listingStatus>;

export const requestStatus = z.enum(['pending', 'accepted', 'declined', 'completed']);
export type RequestStatus = z.infer<typeof requestStatus>;

export const reportTarget = z.enum(['post', 'comment', 'listing', 'user']);
export type ReportTarget = z.infer<typeof reportTarget>;

export const reportStatus = z.enum(['open', 'resolved', 'dismissed']);
export type ReportStatus = z.infer<typeof reportStatus>;

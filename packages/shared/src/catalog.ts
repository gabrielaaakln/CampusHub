import { z } from 'zod';

export const groupListQuery = z.object({
  studyYear: z.coerce.number().int().min(1).max(6).optional(),
  q: z.string().trim().min(1).max(50).optional(),
});
export type GroupListQuery = z.infer<typeof groupListQuery>;

export type StudyGroupDto = {
  id: number;
  name: string;
  studyYear: number;
  subgroups: number;
};

export type SubjectDto = {
  id: number;
  name: string;
  shortName: string | null;
  studyYear: number | null;
};

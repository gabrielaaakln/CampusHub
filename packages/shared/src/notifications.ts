import { z } from 'zod';
import { paginationQuery } from './common.js';

export const notificationQuery = paginationQuery.extend({
  unread: z.enum(['true', 'false']).optional(),
});
export type NotificationQuery = z.infer<typeof notificationQuery>;

export type NotificationDto = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationListDto = {
  unread: number;
};

import { query, queryOne } from "@/server/db/pool";
import type {
  NotificationChannelValue,
  NotificationKindValue,
} from "@/server/db/types";

/**
 * Notifications (Phase 10) — one-way, consultant → customer.
 *
 * There is no reply path anywhere in this module, deliberately. The user settled the
 * scope on 2026-08-22: notifications, not conversations. If a `replyTo` ever appears
 * here it means that decision was reversed without anyone writing it down.
 *
 * DEFAULTS LIVE IN CODE, NOT IN ROWS.
 *
 * `notification_preferences` records only DEVIATIONS from the defaults below. A missing
 * row means "use the default", which is why adding a new notification kind does not
 * require backfilling a preference row for every existing user before anything can be
 * sent. The alternative — a row per user per kind — turns every new kind into a
 * migration and a backfill, and silently drops notifications for anyone the backfill
 * missed.
 */

export interface Notification {
  id: string;
  kind: NotificationKindValue;
  title: string;
  body: string | null;
  link: string | null;
  senderName: string | null;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationRow {
  id: string;
  kind: NotificationKindValue;
  title: string;
  body: string | null;
  link: string | null;
  sender_name: string | null;
  read_at: Date | null;
  created_at: Date;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    senderName: row.sender_name,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const SELECT_NOTIFICATION = `
  SELECT n.id, n.kind, n.title, n.body, n.link,
         s.full_name AS sender_name,
         n.read_at, n.created_at
    FROM notifications n
    LEFT JOIN users s ON s.id = n.sender_id
`;

/**
 * Default channels per kind.
 *
 * IN_APP for everything: it costs nothing, cannot fail to deliver, and is the record the
 * customer can always go back to. Push is added only for the time-sensitive kinds —
 * a reminder is useless the next morning, whereas a report can wait until they look.
 *
 * Nothing defaults to EMAIL. Email is for things a person must act on outside the app,
 * and this product has exactly one of those today: the OTP, which does not travel
 * through this table.
 */
export const DEFAULT_CHANNELS: Record<NotificationKindValue, NotificationChannelValue[]> = {
  YOGA_REMINDER: ["IN_APP", "PUSH"],
  DIET_REMINDER: ["IN_APP", "PUSH"],
  ACTIVITY_REMINDER: ["IN_APP", "PUSH"],
  MISSED_ACTIVITY: ["IN_APP"],
  PLAN_UPDATED: ["IN_APP", "PUSH"],
  CONSULTANT_MESSAGE: ["IN_APP", "PUSH"],
  REPORT_READY: ["IN_APP"],
  APPOINTMENT_REMINDER: ["IN_APP", "PUSH"],
  WEEKLY_PROGRESS: ["IN_APP"],

  /*
   * IN_APP only, and that is a real limitation rather than a preference.
   *
   * The recipient of this one cannot sign in yet — they are INVITED and have to activate
   * first — so an in-app notification is waiting for them rather than reaching them. What
   * would actually reach them is email, and outbound transactional mail beyond the OTP
   * path does not exist yet. `notifyAccessApproved` says so at the call site rather than
   * letting the absence look like a decision.
   */
  ACCESS_APPROVED: ["IN_APP"],
};

export interface CreateNotificationInput {
  organizationId: string;
  recipientId: string;
  /** The consultant who sent it, or null for system-generated. */
  senderId?: string | null;
  kind: NotificationKindValue;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Create a notification for one recipient.
 *
 * The caller is responsible for having established that it may write to this recipient —
 * this is a repository, and the authorization question ("is this customer assigned to
 * me?") belongs where the actor is known. The composite foreign key still guarantees the
 * recipient is in the stated organisation.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification> {
  const channels = await resolveChannels(
    input.organizationId,
    input.recipientId,
    input.kind,
  );

  const row = await queryOne<NotificationRow>(
    `WITH inserted AS (
       INSERT INTO notifications
         (organization_id, recipient_id, sender_id, kind, title, body, link, channels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::notification_channel[])
       RETURNING *
     )
     SELECT i.id, i.kind, i.title, i.body, i.link,
            s.full_name AS sender_name, i.read_at, i.created_at
       FROM inserted i
       LEFT JOIN users s ON s.id = i.sender_id`,
    [
      input.organizationId,
      input.recipientId,
      input.senderId ?? null,
      input.kind,
      input.title.trim(),
      input.body ?? null,
      input.link ?? null,
      channels,
    ],
  );

  return toNotification(row!);
}

/**
 * Which channels this recipient wants for this kind.
 *
 * IN_APP is forced on regardless of preference. A customer who has muted push and email
 * must still have the notification waiting in the app — otherwise "your plan changed"
 * simply never reaches them, and they discover it by finding a different practice
 * tomorrow. Muting a channel is not the same as opting out of being told.
 */
export async function resolveChannels(
  organizationId: string,
  userId: string,
  kind: NotificationKindValue,
): Promise<NotificationChannelValue[]> {
  const row = await queryOne<{ channels: NotificationChannelValue[] }>(
    `SELECT channels FROM notification_preferences
      WHERE organization_id = $1 AND user_id = $2 AND kind = $3`,
    [organizationId, userId, kind],
  );

  const chosen = row?.channels ?? DEFAULT_CHANNELS[kind];
  return chosen.includes("IN_APP") ? chosen : ["IN_APP", ...chosen];
}

export async function listNotifications(
  organizationId: string,
  recipientId: string,
  limit = 30,
): Promise<Notification[]> {
  const rows = await query<NotificationRow>(
    `${SELECT_NOTIFICATION}
      WHERE n.organization_id = $1 AND n.recipient_id = $2
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [organizationId, recipientId, limit],
  );
  return rows.map(toNotification);
}

export async function countUnread(
  organizationId: string,
  recipientId: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM notifications
      WHERE organization_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [organizationId, recipientId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Mark one notification read.
 *
 * Scoped by recipient, so a caller cannot mark somebody else's notification read by
 * guessing an id. Harmless-looking, but it would let an attacker confirm a notification
 * exists — and hide it from the person it was for.
 */
export async function markRead(
  organizationId: string,
  recipientId: string,
  notificationId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
      WHERE id = $3 AND organization_id = $1 AND recipient_id = $2
      RETURNING id`,
    [organizationId, recipientId, notificationId],
  );
  return rows.length > 0;
}

export async function markAllRead(
  organizationId: string,
  recipientId: string,
): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE notifications SET read_at = now()
      WHERE organization_id = $1 AND recipient_id = $2 AND read_at IS NULL
      RETURNING id`,
    [organizationId, recipientId],
  );
  return rows.length;
}

export async function setPreference(
  organizationId: string,
  userId: string,
  kind: NotificationKindValue,
  channels: NotificationChannelValue[],
): Promise<void> {
  // IN_APP is stored as chosen even if omitted, so the row is an honest record of what
  // will actually happen rather than of what was clicked.
  const stored = channels.includes("IN_APP") ? channels : ["IN_APP", ...channels];

  await query(
    `INSERT INTO notification_preferences (organization_id, user_id, kind, channels)
     VALUES ($1, $2, $3, $4::notification_channel[])
     ON CONFLICT (organization_id, user_id, kind)
     DO UPDATE SET channels = EXCLUDED.channels`,
    [organizationId, userId, kind, stored],
  );
}

/** Mark delivery attempted. Failure is recorded, not thrown — see the cron drain. */
export async function recordDelivery(
  notificationId: string,
  error?: string | null,
): Promise<void> {
  await query(
    `UPDATE notifications
        SET delivered_at = CASE WHEN $2::text IS NULL THEN now() ELSE delivered_at END,
            delivery_error = $2
      WHERE id = $1`,
    [notificationId, error ?? null],
  );
}

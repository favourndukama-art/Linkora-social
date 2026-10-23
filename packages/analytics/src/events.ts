import type { Pool } from "pg";

export const ANALYTICS_EVENT_NAMES = [
  "profile_created",
  "post_created",
  "post_liked",
  "post_tipped",
  "user_followed",
  "user_unfollowed",
  "search_performed",
  "notification_sent",
  "governance_proposal_created",
  "governance_vote_cast",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export interface AnalyticsEventInput {
  userAddress: string;
  eventName: AnalyticsEventName;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
  sessionId?: string;
}

const eventNameSet: ReadonlySet<string> = new Set(ANALYTICS_EVENT_NAMES);

function validateEvent(event: AnalyticsEventInput): void {
  if (!event || typeof event !== "object") throw new TypeError("Analytics event is required");
  if (typeof event.userAddress !== "string" || event.userAddress.trim().length === 0) {
    throw new TypeError("Analytics event userAddress is required");
  }
  if (!eventNameSet.has(event.eventName)) throw new TypeError("Analytics eventName is not supported");
  if (event.properties !== undefined && (event.properties === null || typeof event.properties !== "object" || Array.isArray(event.properties))) {
    throw new TypeError("Analytics event properties must be an object");
  }
  if (event.occurredAt !== undefined && Number.isNaN(event.occurredAt.getTime())) {
    throw new TypeError("Analytics event occurredAt must be a valid date");
  }
}

/** Persist a validated analytics event using parameterized SQL. */
export async function trackEvent(pool: Pool, event: AnalyticsEventInput): Promise<void> {
  validateEvent(event);
  await pool.query(
    `INSERT INTO analytics_events (user_address, event_type, payload, occurred_at, session_id)
     VALUES ($1, $2, $3::jsonb, COALESCE($4, NOW()), $5)`,
    [
      event.userAddress.trim(),
      event.eventName,
      JSON.stringify(event.properties ?? {}),
      event.occurredAt ?? null,
      event.sessionId ?? null,
    ]
  );
}

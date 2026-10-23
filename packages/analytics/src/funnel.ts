export const ANALYTICS_FUNNELS = {
  onboarding: ["profile_created", "post_created", "user_followed"],
  creator_launch: ["profile_created", "post_created", "post_tipped"],
  first_tip: ["post_created", "post_tipped"],
} as const;

export type FunnelName = keyof typeof ANALYTICS_FUNNELS;

export interface FunnelStepResult {
  event: string;
  users: number;
  conversionRate: number;
}

export interface FunnelResult {
  name: FunnelName;
  starts: number;
  completions: number;
  completionRate: number;
  steps: FunnelStepResult[];
}

export interface AnalyticsQueryPool {
  query(text: string, values: string[]): Promise<{ rows: Array<Record<string, number | string>> }>;
}

export class UnknownFunnelError extends Error {
  constructor(name: string) {
    super(`Unknown analytics funnel: ${name}`);
    this.name = "UnknownFunnelError";
  }
}

/** Aggregate a funnel from raw analytics events, preserving event order per user. */
export async function getFunnelMetrics(pool: AnalyticsQueryPool, name: string): Promise<FunnelResult> {
  if (!Object.hasOwn(ANALYTICS_FUNNELS, name)) throw new UnknownFunnelError(name);
  const funnelName = name as FunnelName;
  const events: readonly string[] = ANALYTICS_FUNNELS[funnelName];
  const ctes = events.map((_, index) => {
    const previous = index === 0 ? "" : `JOIN funnel_step_${index - 1} previous USING (user_address)`;
    const afterPrevious = index === 0 ? "" : "AND e.occurred_at >= previous.completed_at";
    return `funnel_step_${index} AS (
      SELECT e.user_address, MIN(e.occurred_at) AS completed_at
      FROM analytics_events e
      ${previous}
      WHERE e.event_type = $${index + 1} ${afterPrevious}
      GROUP BY e.user_address
    )`;
  });
  const counts = events.map((_, index) =>
    `(SELECT COUNT(*)::int FROM funnel_step_${index}) AS step_${index}`,
  );
  const result = await pool.query<Record<string, number | string>>(
    `WITH ${ctes.join(",\n")} SELECT ${counts.join(", ")}`,
    [...events],
  );
  const row = result.rows[0] ?? {};
  const starts = Number(row.step_0 ?? 0);
  const steps = events.map((event, index) => {
    const users = Number(row[`step_${index}`] ?? 0);
    return {
      event,
      users,
      conversionRate: starts > 0 ? Math.round((users / starts) * 10_000) / 100 : 0,
    };
  });
  const completions = steps.at(-1)?.users ?? 0;

  return {
    name: funnelName,
    starts,
    completions,
    completionRate: starts > 0 ? Math.round((completions / starts) * 10_000) / 100 : 0,
    steps,
  };
}

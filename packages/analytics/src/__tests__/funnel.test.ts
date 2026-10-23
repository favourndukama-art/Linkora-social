import { getFunnelMetrics, UnknownFunnelError, type AnalyticsQueryPool } from "../funnel";

describe("analytics funnels", () => {
  it("returns ordered step counts and conversion percentages", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ step_0: 100, step_1: 40, step_2: 25 }] });
    const result = await getFunnelMetrics({ query } as unknown as AnalyticsQueryPool, "onboarding");

    expect(result).toEqual({
      name: "onboarding",
      starts: 100,
      completions: 25,
      completionRate: 25,
      steps: [
        { event: "profile_created", users: 100, conversionRate: 100 },
        { event: "post_created", users: 40, conversionRate: 40 },
        { event: "user_followed", users: 25, conversionRate: 25 },
      ],
    });
    expect(query.mock.calls[0]?.[0]).toContain("e.occurred_at >= previous.completed_at");
    expect(query.mock.calls[0]?.[1]).toEqual(["profile_created", "post_created", "user_followed"]);
  });

  it("returns zero conversion when the funnel has no starts", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ step_0: 0, step_1: 0 }] });
    const result = await getFunnelMetrics({ query } as unknown as AnalyticsQueryPool, "first_tip");
    expect(result.completionRate).toBe(0);
    expect(result.steps.every((step) => step.conversionRate === 0)).toBe(true);
  });

  it("rejects unknown funnel names", async () => {
    await expect(getFunnelMetrics({ query: jest.fn() } as unknown as AnalyticsQueryPool, "unknown"))
      .rejects.toBeInstanceOf(UnknownFunnelError);
  });
});

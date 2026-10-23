import type { Pool } from "pg";
import { ANALYTICS_EVENT_NAMES, trackEvent } from "../events";

describe("trackEvent", () => {
  const query = jest.fn().mockResolvedValue({ rowCount: 1 });
  const pool = { query } as unknown as Pool;

  beforeEach(() => query.mockClear());

  it("writes all event fields to PostgreSQL", async () => {
    const occurredAt = new Date("2026-01-02T03:04:05.000Z");
    await trackEvent(pool, {
      userAddress: " GABC ",
      eventName: "post_created",
      properties: { postId: "post-1" },
      occurredAt,
      sessionId: "session-1",
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO analytics_events"),
      ["GABC", "post_created", JSON.stringify({ postId: "post-1" }), occurredAt, "session-1"]
    );
  });

  it("rejects missing required event fields before writing", async () => {
    await expect(trackEvent(pool, { userAddress: "", eventName: "post_created" })).rejects.toThrow(
      "userAddress is required"
    );
    await expect(
      trackEvent(pool, { userAddress: "GABC", eventName: "not_an_event" as never })
    ).rejects.toThrow("eventName is not supported");
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts every declared analytics event name", async () => {
    for (const eventName of ANALYTICS_EVENT_NAMES) {
      await trackEvent(pool, { userAddress: "GABC", eventName });
    }
    expect(query).toHaveBeenCalledTimes(ANALYTICS_EVENT_NAMES.length);
  });

  it("surfaces database write failures", async () => {
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(trackEvent(pool, { userAddress: "GABC", eventName: "post_created" })).rejects.toThrow(
      "database unavailable"
    );
  });
});

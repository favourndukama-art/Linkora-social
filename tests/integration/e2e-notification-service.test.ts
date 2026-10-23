/**
 * E2E coverage for the notification service API. Run against the Docker
 * Compose environment with `bash tests/integration/run_e2e.sh`.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { TEST_CONFIG } from "./setup";

const notificationUrl = TEST_CONFIG.notificationUrl;

async function setPreferences(userAddress: string, channels: { push: boolean; email: boolean; inApp: boolean }) {
  const response = await fetch(`${notificationUrl}/preferences/${encodeURIComponent(userAddress)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(channels),
  });
  expect(response.status).toBe(200);
}

async function notify(recipient: string, testFailPush = false) {
  return fetch(`${notificationUrl}/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient,
      type: "follow",
      title: "New follower",
      body: "Someone followed you.",
      testFailPush,
    }),
  });
}

describe("Notification service E2E", () => {
  it("POST /notify dispatches push and in-app channels", async () => {
    const recipient = Keypair.random().publicKey();
    await setPreferences(recipient, { push: true, email: false, inApp: true });

    const response = await notify(recipient);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "push", success: true }),
      expect.objectContaining({ channel: "in-app", success: true }),
    ]));
  });

  it("dispatches in-app only when push is disabled", async () => {
    const recipient = Keypair.random().publicKey();
    await setPreferences(recipient, { push: false, email: false, inApp: true });

    const response = await notify(recipient);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.results.map((result: { channel: string }) => result.channel)).toEqual(["in-app"]);
  });

  it("continues in-app delivery when push fails", async () => {
    const recipient = Keypair.random().publicKey();
    await setPreferences(recipient, { push: true, email: false, inApp: true });

    const response = await notify(recipient, true);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "push", success: false, attempts: 3 }),
      expect.objectContaining({ channel: "in-app", success: true }),
    ]));
  });
});

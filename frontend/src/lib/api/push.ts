import type { PushPreferences, PushStatus } from "@task-flow/shared/domain/push-contracts";

import { api } from "./client";

export const pushStatus = (): Promise<PushStatus> => api.get("/api/push/status");
export const savePushSubscription = (subscription: PushSubscriptionJSON): Promise<void> =>
  api.post("/api/push/subscriptions", subscription);
export const removePushSubscription = (endpoint: string): Promise<void> =>
  api.post("/api/push/unsubscribe", { endpoint });
export const updatePushPreferences = (patch: Partial<PushPreferences>): Promise<PushPreferences> =>
  api.patch("/api/push/preferences", patch);
export const sendTestPush = (): Promise<void> => api.post("/api/push/test");

import { z } from "zod";

export const pushSubscriptionInput = z.object({
  endpoint: z
    .string()
    .url()
    .max(4000)
    .refine((value) => {
      const hostname = new URL(value).hostname.toLowerCase();
      return (
        hostname === "fcm.googleapis.com" ||
        hostname === "updates.push.services.mozilla.com" ||
        hostname === "push.services.mozilla.com" ||
        hostname === "web.push.apple.com" ||
        hostname.endsWith(".push.apple.com") ||
        hostname.endsWith(".notify.windows.com")
      );
    }, "Endpoint de push não reconhecido."),
  keys: z.object({
    p256dh: z.string().min(20).max(1000),
    auth: z.string().min(8).max(500),
  }),
});

export const pushPreferenceInput = z
  .object({
    enabled: z.boolean(),
    taskAssigned: z.boolean(),
    taskUpdates: z.boolean(),
    taskComments: z.boolean(),
    taskDueSoon: z.boolean(),
    meetings: z.boolean(),
    githubPullRequests: z.boolean(),
    githubActions: z.boolean(),
  })
  .partial();

export type PushPreferences = Required<z.infer<typeof pushPreferenceInput>>;

export type PushStatus = {
  configured: boolean;
  publicKey?: string;
  subscriptionCount: number;
  preferences: PushPreferences;
};

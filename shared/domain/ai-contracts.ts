import { z } from "zod";

const shortText = z.string().trim().min(1).max(4_000);

export const runbookAiRequest = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  prompt: shortText,
  current: z
    .object({
      title: z.string().max(120),
      description: z.string().max(2_000),
      category: z.string().max(60),
      environment: z.string().max(60),
      tags: z.array(z.string().max(30)).max(20),
      steps: z
        .array(
          z.object({
            title: z.string().max(120),
            command: z.string().max(20_000),
            explanation: z.string().max(2_000),
            expectedResult: z.string().max(2_000),
            risk: z.enum(["safe", "caution", "dangerous"]),
          }),
        )
        .max(50),
      variables: z
        .array(
          z.object({
            key: z.string().max(60),
            defaultValue: z.string().max(500),
            description: z.string().max(500),
          }),
        )
        .max(30),
    })
    .optional(),
});
export type RunbookAiRequest = z.infer<typeof runbookAiRequest>;

export const runbookAiDraft = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2_000),
  category: z.string().min(1).max(60),
  environment: z.string().min(1).max(60),
  tags: z.array(z.string().min(1).max(30)).max(20),
  variables: z
    .array(
      z.object({
        key: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/)
          .max(60),
        defaultValue: z.string().max(500),
        description: z.string().max(500),
      }),
    )
    .max(30),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        command: z.string().min(1).max(20_000),
        explanation: z.string().max(2_000),
        expectedResult: z.string().max(2_000),
        risk: z.enum(["safe", "caution", "dangerous"]),
      }),
    )
    .min(1)
    .max(50),
});
export type RunbookAiDraft = z.infer<typeof runbookAiDraft>;

export const taskAiRequest = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  mode: z.enum(["improve", "rewrite", "breakdown"]),
  prompt: z.string().max(4_000).optional(),
  current: z.object({
    title: z.string().max(120),
    description: z.string().max(2_000),
    priority: z.enum(["low", "medium", "high"]),
  }),
});
export type TaskAiRequest = z.infer<typeof taskAiRequest>;

export const taskAiDraft = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2_000),
  priority: z.enum(["low", "medium", "high"]),
  estimateMinutes: z.number().int().min(0).max(525_600).nullable(),
  subtasks: z.array(z.string().trim().min(1).max(120)).max(30),
});
export type TaskAiDraft = z.infer<typeof taskAiDraft>;

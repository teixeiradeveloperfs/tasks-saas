import { z } from "zod";

export const taskStatus = z.enum(["todo", "in_progress", "done"]);
export const taskPriority = z.enum(["low", "medium", "high"]);
const text = z.string().trim().min(1);
const value = z.union([z.string(), z.number(), z.null()]);

// Ids não são validados como UUID de propósito. Enquanto a criação de workspace não
// foi migrada, a interface ainda gera ids locais que não têm esse formato, e uma
// rejeição no validador daria um erro opaco onde o banco daria um erro claro de
// chave estrangeira. Quem decide se o id existe é o banco.
const id = z.string().min(1);

const taskFields = {
  title: z.string().trim().min(1, "O título é obrigatório.").max(200),
  description: z.string().max(5000).optional(),
  status: taskStatus,
  priority: taskPriority,
  assigneeId: id.optional(),
  assigneeIds: z.array(id).max(50).optional(),
  sprintId: id.optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  estimateMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 365)
    .optional(),
  labels: z.array(z.string()).max(50).optional(),
};

export const createTaskInput = z.object({
  workspaceId: id,
  projectId: id.optional(),
  boardColumnId: id.optional(),
  subtaskTitles: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  ...taskFields,
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const updateTaskInput = z.object(taskFields).partial();
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const moveTaskInput = z.object({
  status: taskStatus,
  position: z.number().int().nonnegative().optional(),
});
export const moveTaskToColumnInput = z.object({
  boardColumnId: id,
  position: z.number().int().nonnegative().optional(),
});
export type MoveTaskToColumnInput = z.infer<typeof moveTaskToColumnInput>;
export type MoveTaskInput = z.infer<typeof moveTaskInput>;

export const addCommentInput = z.object({ text: text.max(5000) });
export type AddCommentInput = z.infer<typeof addCommentInput>;

export const subtaskTitleInput = z.object({ title: text.max(120) });
export type SubtaskTitleInput = z.infer<typeof subtaskTitleInput>;

export const addTimeEntryInput = z.object({
  minutes: z
    .number()
    .int()
    .positive()
    .max(60 * 24 * 365),
  note: z.string().max(1000).optional(),
});
export type AddTimeEntryInput = z.infer<typeof addTimeEntryInput>;

export const setEstimateInput = z.object({
  minutes: z
    .number()
    .int()
    .nonnegative()
    .max(60 * 24 * 365)
    .nullable(),
});
export type SetEstimateInput = z.infer<typeof setEstimateInput>;

export const setFieldValueInput = z.object({ value });
export type SetFieldValueInput = z.infer<typeof setFieldValueInput>;

export const addBlockerInput = z.object({ blockerId: id });
export type AddBlockerInput = z.infer<typeof addBlockerInput>;

export const attachmentInput = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  data: z.string().min(1),
});
export type AttachmentInput = z.infer<typeof attachmentInput>;

export const linkPullRequestInput = z.object({
  url: z
    .string()
    .url()
    .max(500)
    .refine((value) => new URL(value).hostname.toLowerCase() === "github.com", {
      message: "Use uma URL de pull request do github.com.",
    }),
});
export type LinkPullRequestInput = z.infer<typeof linkPullRequestInput>;

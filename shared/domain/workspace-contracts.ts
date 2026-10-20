import { z } from "zod";

const id = z.string().min(1);
const color = z.string().min(1).max(32);
const sprintStatus = z.enum(["planned", "active", "closed"]);
const customFieldType = z.enum(["text", "number", "select"]);
const date = z.string().datetime().optional();
const workspaceImageUrl = z
  .string()
  .max(500_000, "A imagem ficou grande demais.")
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/,
    "Use uma imagem JPG, PNG ou WebP válida.",
  );

export const workspaceInput = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório.").max(60),
  color,
  description: z.string().max(2000).optional(),
  imageUrl: workspaceImageUrl.optional(),
});
export type WorkspaceInput = z.infer<typeof workspaceInput>;
export const workspacePatch = workspaceInput
  .partial()
  .extend({ imageUrl: workspaceImageUrl.nullable().optional() });
export type WorkspacePatch = z.infer<typeof workspacePatch>;

export const projectInput = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
  description: z.string().max(1000).optional(),
  color,
});
export type ProjectInput = z.infer<typeof projectInput>;
export const projectPatch = projectInput.partial();
export type ProjectPatch = z.infer<typeof projectPatch>;

const runbookStep = z.object({
  title: z.string().trim().min(1, "O título da etapa é obrigatório.").max(120),
  command: z.string().trim().min(1, "O comando é obrigatório.").max(20_000),
  explanation: z.string().max(2_000).optional(),
  expectedResult: z.string().max(2_000).optional(),
  risk: z.enum(["safe", "caution", "dangerous"]).default("safe"),
});

const runbookVariable = z.object({
  key: z
    .string()
    .trim()
    .min(1, "O nome da variável é obrigatório.")
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use letras maiúsculas, números e sublinhado."),
  defaultValue: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
});

export const runbookInput = z.object({
  projectId: id.optional(),
  title: z.string().trim().min(1, "O título é obrigatório.").max(120),
  description: z.string().max(2_000).optional(),
  category: z.string().trim().min(1).max(60),
  environment: z.string().trim().min(1).max(60),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  steps: z.array(runbookStep).min(1, "Adicione pelo menos um comando.").max(50),
  variables: z.array(runbookVariable).max(30).default([]),
});
export type RunbookInput = z.infer<typeof runbookInput>;
export const runbookPatch = runbookInput.partial();
export type RunbookPatch = z.infer<typeof runbookPatch>;

export const boardColumnInput = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório.").max(60),
  status: z.enum(["todo", "in_progress", "done"]).default("in_progress"),
  color,
});
export type BoardColumnInput = z.infer<typeof boardColumnInput>;

export const labelInput = z.object({ name: z.string().trim().min(1).max(24), color });
export type LabelInput = z.infer<typeof labelInput>;
export const labelPatch = labelInput.partial();
export type LabelPatch = z.infer<typeof labelPatch>;

const sprintFields = {
  projectId: id.optional(),
  name: z.string().trim().min(1).max(60),
  goal: z.string().max(240).optional(),
  startDate: date,
  endDate: date,
  status: sprintStatus,
};
export const sprintInput = z.object(sprintFields).partial({ status: true });
export type SprintInput = z.infer<typeof sprintInput>;
export const sprintPatch = z.object(sprintFields).partial();
export type SprintPatch = z.infer<typeof sprintPatch>;

const customFieldFields = {
  name: z.string().trim().min(1).max(40),
  type: customFieldType,
  options: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
};
export const customFieldInput = z.object(customFieldFields);
export type CustomFieldInput = z.infer<typeof customFieldInput>;
export const customFieldPatch = z.object(customFieldFields).partial();
export type CustomFieldPatch = z.infer<typeof customFieldPatch>;

const docFields = z.object({
  projectId: id.optional(),
  title: z.string().trim().min(1).max(80),
  body: z.string().max(50000),
});
export const docCreateInput = docFields.pick({ title: true, projectId: true });
export type DocCreateInput = z.infer<typeof docCreateInput>;
export const docPatch = docFields.partial();
export type DocPatch = z.infer<typeof docPatch>;

export const whiteboardCreateInput = z.object({
  projectId: id.optional(),
  title: z.string().trim().min(1).max(80),
});
export type WhiteboardCreateInput = z.infer<typeof whiteboardCreateInput>;
// A cena é o JSON serializado pelo próprio Excalidraw (`serializeAsJSON`), tratado
// como texto opaco: o servidor criptografa e devolve sem interpretar. O teto de
// tamanho real é o bodyLimit da rota; o max aqui só barra abuso grosseiro no zod.
export const whiteboardPatch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  scene: z.string().max(8_000_000).optional(),
});
export type WhiteboardPatch = z.infer<typeof whiteboardPatch>;

const goalFields = {
  projectId: id.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  dueDate: date,
  taskIds: z.array(id).max(500).optional(),
  sprintIds: z.array(id).max(100).optional(),
};
export const goalInput = z.object(goalFields);
export type GoalInput = z.infer<typeof goalInput>;
export const goalPatch = z.object(goalFields).partial();
export type GoalPatch = z.infer<typeof goalPatch>;

const trigger = z.object({
  kind: z.literal("status_changed"),
  to: z.enum(["todo", "in_progress", "done"]),
});
const action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("assign"), memberId: id }),
  z.object({ kind: z.literal("set_priority"), priority: z.enum(["low", "medium", "high"]) }),
  z.object({ kind: z.literal("set_sprint"), sprintId: z.string() }),
  z.object({ kind: z.literal("add_label"), label: z.string().trim().min(1).max(24) }),
]);
export const automationInput = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  trigger,
  action,
});
export type AutomationInput = z.infer<typeof automationInput>;
export const automationPatch = z
  .object({ name: z.string().trim().min(1).max(120), enabled: z.boolean(), trigger, action })
  .partial();
export type AutomationPatch = z.infer<typeof automationPatch>;

export const memberPatch = z
  .object({
    role: z.string().trim().max(60),
    permission: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
    // Lista completa, não incremental: substitui os projetos do membro.
    projectIds: z.array(z.string().min(1)).max(200),
  })
  .partial();
export type MemberPatch = z.infer<typeof memberPatch>;

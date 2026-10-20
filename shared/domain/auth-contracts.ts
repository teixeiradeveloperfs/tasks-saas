import { z } from "zod";

export const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(12).max(200),
});
export type Credentials = z.infer<typeof credentials>;

export const signUpInput = credentials.extend({ name: z.string().trim().min(1).max(60) });
export type SignUpInput = z.infer<typeof signUpInput>;

export const inviteToken = z.string().min(20).max(200);

export const createInviteInput = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().email(),
  permission: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
  // Projetos que o convite libera. Vazio significa nenhum: quem entra passa a ver
  // apenas o que for concedido, e ADMIN enxerga tudo pelo próprio cargo.
  projectIds: z.array(z.string().min(1)).max(200).default([]),
});
export type CreateInviteInput = z.infer<typeof createInviteInput>;

export const acceptInviteInput = z.object({
  token: inviteToken,
  name: z.string().trim().min(1).max(60).optional(),
  role: z.string().trim().max(60).optional(),
  password: z.string().min(12).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

export const updateProfileInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  role: z.string().trim().max(60).optional(),
  bio: z.string().max(500).optional(),
  avatarColor: z.string().min(1).max(32).optional(),
  avatarUrl: z
    .string()
    .max(500_000, "A imagem ficou grande demais.")
    .regex(
      /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/,
      "Use uma imagem JPG, PNG ou WebP válida.",
    )
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

const integrationConfig = z.record(z.string(), z.string());

export const toggleIntegrationInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  config: integrationConfig.optional(),
});
export type ToggleIntegrationInput = z.infer<typeof toggleIntegrationInput>;

export const updateIntegrationConfigInput = z.object({ config: integrationConfig });
export type UpdateIntegrationConfigInput = z.infer<typeof updateIntegrationConfigInput>;

export type CurrentUser =
  | { authenticated: false }
  | {
      authenticated: true;
      userId: string;
      twoFactor: "setup_required" | "challenge_required" | "verified";
    };

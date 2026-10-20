import { z } from "zod";

export const twoFactorCodeInput = z.object({
  code: z.string().trim().min(6).max(32),
});

export type TwoFactorStatus = {
  enabled: boolean;
  recoveryCodesRemaining: number;
};

export type TwoFactorSetup = {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUri: string;
};

export type TwoFactorVerificationResult =
  { ok: true; recoveryCodes?: string[] } | { ok: false; message: string };

export const vaultCategory = z.enum(["credential", "token", "ssh_key", "environment", "note"]);

const vaultReferenceUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Use uma URL HTTP(S) válida.");

export const vaultEntryInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  username: z.string().trim().max(254).optional(),
  url: vaultReferenceUrl.optional(),
  category: vaultCategory,
  secret: z.string().min(1).max(100_000),
});

export const vaultEntryUpdateInput = vaultEntryInput
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos uma alteração.");

export type VaultEntryInput = z.infer<typeof vaultEntryInput>;
export type VaultEntryUpdateInput = z.infer<typeof vaultEntryUpdateInput>;

export type VaultEntrySummary = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  username?: string;
  url?: string;
  category: z.infer<typeof vaultCategory>;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type VaultEntryReveal = VaultEntrySummary & { secret: string };

export const shareWithUserInput = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
});

export type ShareWithUserInput = z.infer<typeof shareWithUserInput>;

export type ItemShare = {
  id: string;
  user: { id: string; name: string; email: string; avatarUrl?: string };
  sharedAt: string;
};

export type SharedRunbook = {
  shareId: string;
  sharedAt: string;
  sharedBy: string;
  workspace: { name: string };
  runbook: Omit<import("./models").Runbook, "workspaceId" | "projectId" | "favorite">;
};

export type SharedVaultEntry = Omit<VaultEntrySummary, "workspaceId"> & {
  shareId: string;
  sharedAt: string;
  sharedBy: string;
  workspaceName: string;
};

export type SharedVaultReveal = SharedVaultEntry & { secret: string };

export type SharedItems = {
  runbooks: SharedRunbook[];
  vaultEntries: SharedVaultEntry[];
};

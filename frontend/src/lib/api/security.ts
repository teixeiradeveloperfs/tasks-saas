import type {
  TwoFactorSetup,
  TwoFactorStatus,
  TwoFactorVerificationResult,
  ItemShare,
  SharedItems,
  SharedVaultReveal,
  VaultEntryInput,
  VaultEntryReveal,
  VaultEntrySummary,
  VaultEntryUpdateInput,
} from "@task-flow/shared/domain/security-contracts";

import { api } from "./client";

export const twoFactorStatus = (): Promise<TwoFactorStatus> => api.get("/api/auth/2fa/status");
export const startTwoFactorSetup = (): Promise<TwoFactorSetup> => api.post("/api/auth/2fa/setup");
export const enableTwoFactor = (code: string): Promise<TwoFactorVerificationResult> =>
  api.post("/api/auth/2fa/enable", { code });
export const verifyTwoFactor = (code: string): Promise<TwoFactorVerificationResult> =>
  api.post("/api/auth/2fa/verify", { code });
export const regenerateRecoveryCodes = (code: string): Promise<TwoFactorVerificationResult> =>
  api.post("/api/auth/2fa/recovery-codes", { code });

export const listVaultEntries = (workspaceId: string): Promise<VaultEntrySummary[]> =>
  api.get(`/api/workspaces/${workspaceId}/vault`);
export const createVaultEntry = (
  workspaceId: string,
  input: VaultEntryInput,
): Promise<VaultEntrySummary> => api.post(`/api/workspaces/${workspaceId}/vault`, input);
export const updateVaultEntry = (
  id: string,
  input: VaultEntryUpdateInput,
): Promise<VaultEntrySummary> => api.patch(`/api/vault/${id}`, input);
export const revealVaultEntry = (id: string): Promise<VaultEntryReveal> =>
  api.post(`/api/vault/${id}/reveal`);
export const deleteVaultEntry = (id: string): Promise<void> => api.delete(`/api/vault/${id}`);

export type ShareableKind = "runbook" | "vault";
export const listItemShares = (kind: ShareableKind, id: string): Promise<ItemShare[]> =>
  api.get(`/api/${kind}/${id}/shares`);
export const shareItem = (kind: ShareableKind, id: string, email: string): Promise<ItemShare> =>
  api.post(`/api/${kind}/${id}/shares`, { email });
export const revokeItemShare = (kind: ShareableKind, id: string, shareId: string): Promise<void> =>
  api.delete(`/api/${kind}/${id}/shares/${shareId}`);
export const listSharedItems = (): Promise<SharedItems> => api.get("/api/shared");
export const revealSharedVaultEntry = (id: string): Promise<SharedVaultReveal> =>
  api.post(`/api/shared/vault/${id}/reveal`);

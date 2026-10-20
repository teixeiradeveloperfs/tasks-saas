import type {
  Credentials,
  CurrentUser,
  SignUpInput,
} from "@task-flow/shared/domain/auth-contracts";

import { api } from "./client";

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      code: "sign_up_failed" | "invalid_credentials" | "account_locked";
      message: string;
    };

export const signUp = (a: { data: SignUpInput }): Promise<AuthResult> =>
  api.post("/api/auth/sign-up", a.data);

export const signIn = (a: { data: Credentials }): Promise<AuthResult> =>
  api.post("/api/auth/sign-in", a.data);

export const signOut = (): Promise<{ ok: true }> => api.post("/api/auth/sign-out");

export const me = (): Promise<CurrentUser> => api.get("/api/session/me");

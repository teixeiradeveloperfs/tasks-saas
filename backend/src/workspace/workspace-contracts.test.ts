import { describe, expect, it } from "vitest";

import { workspaceInput, workspacePatch } from "@task-flow/shared/domain/workspace-contracts";
import { updateProfileInput } from "@task-flow/shared/domain/auth-contracts";

describe("imagem do workspace", () => {
  const imageUrl = "data:image/jpeg;base64,YWJj";

  it("aceita uma imagem segura na criação e permite removê-la na edição", () => {
    expect(workspaceInput.parse({ name: "Produto", color: "#0086f2", imageUrl }).imageUrl).toBe(
      imageUrl,
    );
    expect(workspacePatch.parse({ imageUrl: null })).toEqual({ imageUrl: null });
  });

  it("recusa SVG e URLs externas", () => {
    expect(() => workspacePatch.parse({ imageUrl: "data:image/svg+xml;base64,YWJj" })).toThrow();
    expect(() => workspacePatch.parse({ imageUrl: "https://example.com/image.jpg" })).toThrow();
  });
});

describe("edição do perfil", () => {
  it("normaliza o e-mail e aceita adicionar ou remover foto", () => {
    expect(
      updateProfileInput.parse({
        email: "  Pessoa@Example.COM ",
        avatarUrl: "data:image/jpeg;base64,YWJj",
      }),
    ).toEqual({
      email: "pessoa@example.com",
      avatarUrl: "data:image/jpeg;base64,YWJj",
    });
    expect(updateProfileInput.parse({ avatarUrl: null })).toEqual({ avatarUrl: null });
  });
});

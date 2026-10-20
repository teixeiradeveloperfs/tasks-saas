import { describe, expect, it } from "vitest";
import { isNodeRuntime, assertNodeRuntime } from "@/config/runtime";

describe("isNodeRuntime", () => {
  it("reconhece o Node", () => {
    expect(isNodeRuntime("node")).toBe(true);
  });

  it("recusa runtime de edge, onde process.release não existe", () => {
    expect(isNodeRuntime(undefined)).toBe(false);
  });

  it("recusa qualquer outro runtime nomeado", () => {
    expect(isNodeRuntime("workerd")).toBe(false);
  });
});

describe("assertNodeRuntime", () => {
  it("não lança quando roda em Node", () => {
    expect(() => assertNodeRuntime("node")).not.toThrow();
  });

  it("lança citando o preset quando não é Node", () => {
    expect(() => assertNodeRuntime(undefined)).toThrow(/node-server/);
  });
});

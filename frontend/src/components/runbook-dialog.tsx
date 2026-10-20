import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateRunbookDraft } from "@/lib/api/ai";
import { useStore, type Runbook, type RunbookRisk } from "@/state/workspace-store";

type StepDraft = {
  title: string;
  command: string;
  explanation: string;
  expectedResult: string;
  risk: RunbookRisk;
};

type VariableDraft = { key: string; defaultValue: string; description: string };

const emptyStep = (): StepDraft => ({
  title: "",
  command: "",
  explanation: "",
  expectedResult: "",
  risk: "safe",
});

export function RunbookDialog({
  workspaceId,
  projectId,
  runbook,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  projectId?: string;
  runbook?: Runbook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createRunbook = useStore((state) => state.createRunbook);
  const updateRunbook = useStore((state) => state.updateRunbook);
  const deleteRunbook = useStore((state) => state.deleteRunbook);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Servidor");
  const [environment, setEnvironment] = useState("Ubuntu");
  const [tags, setTags] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [variables, setVariables] = useState<VariableDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTitle(runbook?.title ?? "");
    setDescription(runbook?.description ?? "");
    setCategory(runbook?.category ?? "Servidor");
    setEnvironment(runbook?.environment ?? "Ubuntu");
    setTags(runbook?.tags.join(", ") ?? "");
    setSteps(
      runbook?.steps.map((step) => ({
        title: step.title,
        command: step.command,
        explanation: step.explanation ?? "",
        expectedResult: step.expectedResult ?? "",
        risk: step.risk,
      })) ?? [emptyStep()],
    );
    setVariables(
      runbook?.variables.map((variable) => ({
        key: variable.key,
        defaultValue: variable.defaultValue ?? "",
        description: variable.description ?? "",
      })) ?? [],
    );
    setSaving(false);
    setGenerating(false);
    setAiPrompt("");
    setConfirmingDelete(false);
    setError(undefined);
  }, [open, runbook]);

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)),
    );

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const generateWithAi = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setError("Descreva o procedimento que a IA deve montar ou melhorar.");
      return;
    }
    setGenerating(true);
    setError(undefined);
    try {
      const draft = await generateRunbookDraft({
        workspaceId,
        projectId: runbook?.projectId ?? projectId,
        prompt,
        current: {
          title,
          description,
          category,
          environment,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          steps,
          variables,
        },
      });
      setTitle(draft.title);
      setDescription(draft.description);
      setCategory(draft.category);
      setEnvironment(draft.environment);
      setTags(draft.tags.join(", "));
      setSteps(draft.steps);
      setVariables(draft.variables);
      setAiPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o runbook.");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedVariables = variables
      .map((variable) => ({ ...variable, key: variable.key.trim().toUpperCase() }))
      .filter((variable) => variable.key);
    if (!title.trim() || !category.trim() || !environment.trim()) {
      setError("Preencha título, categoria e ambiente.");
      return;
    }
    if (steps.some((step) => !step.title.trim() || !step.command.trim())) {
      setError("Cada etapa precisa de título e comando.");
      return;
    }
    if (normalizedVariables.some((variable) => !/^[A-Z][A-Z0-9_]*$/.test(variable.key))) {
      setError("Variáveis devem usar letras maiúsculas, números e sublinhado.");
      return;
    }
    if (
      new Set(normalizedVariables.map((variable) => variable.key)).size !==
      normalizedVariables.length
    ) {
      setError("Não repita nomes de variáveis.");
      return;
    }
    setSaving(true);
    setError(undefined);
    const data = {
      projectId: runbook?.projectId ?? projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim(),
      environment: environment.trim(),
      tags: [
        ...new Set(
          tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ],
      steps: steps.map((step) => ({
        title: step.title.trim(),
        command: step.command.trim(),
        explanation: step.explanation.trim() || undefined,
        expectedResult: step.expectedResult.trim() || undefined,
        risk: step.risk,
      })),
      variables: normalizedVariables.map((variable) => ({
        key: variable.key,
        defaultValue: variable.defaultValue.trim() || undefined,
        description: variable.description.trim() || undefined,
      })),
    };
    const saved = runbook
      ? await updateRunbook(runbook.id, data)
      : await createRunbook(workspaceId, data);
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-y-auto p-0 sm:max-w-4xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6 sm:pr-14">
            <DialogTitle>{runbook ? "Editar runbook" : "Novo runbook"}</DialogTitle>
            <DialogDescription>
              Salve comandos reutilizáveis. Use variáveis como {"{{DOMAIN}}"} para evitar dados
              fixos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-4 py-5 sm:px-6">
            <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Não salve senhas, tokens ou chaves privadas. Use variáveis e preencha os valores
                somente no momento de copiar.
              </p>
            </div>
            <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">Montar com IA</h3>
                  <p className="text-xs text-muted-foreground">
                    Descreva o problema e receba etapas, comandos, variáveis e alertas de risco para
                    revisar antes de salvar.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value.slice(0, 4000))}
                  rows={2}
                  placeholder="Ex.: crie um procedimento para diagnosticar PostgreSQL em Ubuntu usando Docker"
                  aria-label="Instrução para a IA"
                />
                <Button
                  type="button"
                  className="sm:self-end"
                  disabled={generating}
                  onClick={generateWithAi}
                >
                  {generating ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {generating ? "Gerando…" : runbook ? "Melhorar" : "Gerar"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O conteúdo informado é processado pela OpenAI. Não envie senhas, tokens ou chaves.
              </p>
            </section>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="runbook-title">Título</Label>
                <Input
                  id="runbook-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                  placeholder="Ex.: Diagnosticar PostgreSQL na VPS"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runbook-category">Categoria</Label>
                <Input
                  id="runbook-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value.slice(0, 60))}
                  placeholder="Servidor, Banco, Deploy…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runbook-environment">Ambiente</Label>
                <Input
                  id="runbook-environment"
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value.slice(0, 60))}
                  placeholder="Ubuntu, Docker, PostgreSQL…"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="runbook-description">Descrição</Label>
                <Textarea
                  id="runbook-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
                  rows={2}
                  placeholder="Quando usar e qual problema este procedimento resolve."
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="runbook-tags">Tags separadas por vírgula</Label>
                <Input
                  id="runbook-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="logs, produção, postgres"
                />
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Variáveis</h3>
                  <p className="text-xs text-muted-foreground">
                    Substituídas antes de copiar. Ex.: DOMAIN, CONTAINER, DATABASE.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setVariables((current) => [
                      ...current,
                      { key: "", defaultValue: "", description: "" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Variável
                </Button>
              </div>
              {variables.map((variable, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                  <Input
                    value={variable.key}
                    onChange={(event) =>
                      setVariables((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, key: event.target.value.toUpperCase().slice(0, 60) }
                            : item,
                        ),
                      )
                    }
                    placeholder="DOMAIN"
                  />
                  <Input
                    value={variable.defaultValue}
                    onChange={(event) =>
                      setVariables((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, defaultValue: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Valor padrão"
                  />
                  <div className="flex min-w-0 gap-2">
                    <Input
                      className="min-w-0"
                      value={variable.description}
                      onChange={(event) =>
                        setVariables((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Descrição"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setVariables((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label="Remover variável"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Etapas e comandos</h3>
                  <p className="text-xs text-muted-foreground">
                    Organize o procedimento na ordem em que ele deve ser executado.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSteps((current) => [...current, emptyStep()])}
                >
                  <Plus className="h-3.5 w-3.5" /> Etapa
                </Button>
              </div>
              {steps.map((step, index) => (
                <div key={index} className="space-y-3 rounded-lg border bg-muted/15 p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <Input
                      className="min-w-0 flex-1"
                      value={step.title}
                      onChange={(event) =>
                        updateStep(index, { title: event.target.value.slice(0, 120) })
                      }
                      placeholder="Ex.: Acompanhar logs em tempo real"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      aria-label="Mover etapa para cima"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      aria-label="Mover etapa para baixo"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                      disabled={steps.length === 1}
                      aria-label="Remover etapa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <div className="space-y-2">
                      <Label>Comando</Label>
                      <Textarea
                        value={step.command}
                        onChange={(event) =>
                          updateStep(index, { command: event.target.value.slice(0, 20000) })
                        }
                        rows={3}
                        className="resize-y font-mono text-xs"
                        placeholder="sudo journalctl -u postgresql -f"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Risco</Label>
                      <Select
                        value={step.risk}
                        onValueChange={(value) => updateStep(index, { risk: value as RunbookRisk })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="safe">
                            <span className="inline-flex items-center gap-2">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Seguro
                            </span>
                          </SelectItem>
                          <SelectItem value="caution">
                            <span className="inline-flex items-center gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Atenção
                            </span>
                          </SelectItem>
                          <SelectItem value="dangerous">
                            <span className="inline-flex items-center gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Perigoso
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Textarea
                      value={step.explanation}
                      onChange={(event) =>
                        updateStep(index, { explanation: event.target.value.slice(0, 2000) })
                      }
                      rows={2}
                      placeholder="O que este comando faz?"
                    />
                    <Textarea
                      value={step.expectedResult}
                      onChange={(event) =>
                        updateStep(index, { expectedResult: event.target.value.slice(0, 2000) })
                      }
                      rows={2}
                      placeholder="Qual resultado esperar?"
                    />
                  </div>
                </div>
              ))}
            </section>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="border-t px-4 py-4 sm:justify-between sm:px-6">
            <div className="sm:w-auto">
              {runbook &&
                (confirmingDelete ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        if (await deleteRunbook(runbook.id)) onOpenChange(false);
                        else setSaving(false);
                      }}
                    >
                      Confirmar exclusão
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                ))}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : runbook ? "Salvar" : "Criar runbook"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

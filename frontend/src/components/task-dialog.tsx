import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CalendarIcon,
  Check,
  ClipboardList,
  Clock,
  Link2,
  GitPullRequest,
  ExternalLink,
  RefreshCw,
  LoaderCircle,
  MessageSquare,
  Download,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Tag,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { generateTaskDraft } from "@/lib/api/ai";
import {
  formatMinutes,
  priorityLabels,
  statusLabels,
  useProfile,
  useStore,
  type CustomFieldValue,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";
import {
  DatePickerButton as DatePickerControl,
  DependenciesEditor as DependenciesControl,
  FieldEditor as FieldControl,
  parseTimeInput,
} from "@/components/task-dialog/form-controls";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  task?: Task | null;
  defaultStatus?: TaskStatus;
  defaultBoardColumnId?: string;
  readOnly?: boolean;
}

const MAX_TITLE = 120;
const MAX_DESC = 2000;
const MAX_LABEL = 24;
const MAX_LABELS = 8;
const MAX_COMMENT = 500;
const MAX_SUBTASK = 120;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export function TaskDialog({
  open,
  onOpenChange,
  workspaceId,
  task,
  defaultStatus,
  defaultBoardColumnId,
  readOnly = false,
}: Props) {
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const addComment = useStore((s) => s.addComment);
  const deleteComment = useStore((s) => s.deleteComment);
  const createLabel = useStore((s) => s.createLabel);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const removeSubtask = useStore((s) => s.removeSubtask);
  const addTimeEntry = useStore((s) => s.addTimeEntry);
  const removeTimeEntry = useStore((s) => s.removeTimeEntry);
  const setEstimate = useStore((s) => s.setEstimate);
  const setFieldValue = useStore((s) => s.setFieldValue);
  const addBlocker = useStore((s) => s.addBlocker);
  const removeBlocker = useStore((s) => s.removeBlocker);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const linkPullRequest = useStore((s) => s.linkPullRequest);
  const refreshPullRequest = useStore((s) => s.refreshPullRequest);
  const removePullRequest = useStore((s) => s.removePullRequest);
  const allTasks = useStore((s) => s.tasks);
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const profileName = useProfile().name;
  const liveTask = useStore((s) => (task ? (s.tasks.find((t) => t.id === task.id) ?? null) : null));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const taskProjectId = task?.projectId ?? activeProjectId;

  const wsTasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.workspaceId === workspaceId && belongsToProject(t.projectId, taskProjectId),
      ),
    [allTasks, taskProjectId, workspaceId],
  );
  const workspaceLabels = useMemo(() => workspace?.labels ?? [], [workspace?.labels]);
  const workspaceMembers = workspace?.members ?? [];
  const workspaceSprints =
    workspace?.sprints.filter((sprint) => belongsToProject(sprint.projectId, taskProjectId)) ?? [];
  const workspaceFields = workspace?.customFields ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState<string>("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [labels, setLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [estimateDraft, setEstimateDraft] = useState<string>("");
  const [commentDraft, setCommentDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<string[]>([]);
  const [pullRequestDraft, setPullRequestDraft] = useState("");
  const [pullRequestBusy, setPullRequestBusy] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const formReadOnly = readOnly || Boolean(task && !editingTask);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? defaultStatus ?? "todo");
    setPriority(task?.priority ?? "medium");
    setAssigneeIds(task?.assigneeIds ?? (task?.assigneeId ? [task.assigneeId] : []));
    setSprintId(task?.sprintId ?? "");
    setDueDate(task?.dueDate ? new Date(task.dueDate) : undefined);
    setStartDate(task?.startDate ? new Date(task.startDate) : undefined);
    setLabels(task?.labels ?? []);
    setLabelDraft("");
    setSubtaskDraft("");
    setTimeDraft("");
    setTimeNote("");
    setEstimateDraft(task?.estimateMinutes ? String(task.estimateMinutes) : "");
    setCommentDraft("");
    setError(null);
    setUploading(false);
    setDeleting(false);
    setAiPrompt("");
    setGeneratingAi(false);
    setSuggestedSubtasks([]);
    setPullRequestDraft("");
    setEditingTask(!task);
  }, [open, task, defaultStatus]);

  const labelColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of workspaceLabels) m[l.name] = l.color;
    return m;
  }, [workspaceLabels]);

  const toggleLabel = (name: string) => {
    setError(null);
    if (labels.includes(name)) {
      setLabels(labels.filter((l) => l !== name));
      return;
    }
    if (labels.length >= MAX_LABELS) {
      setError(`Máximo de ${MAX_LABELS} etiquetas.`);
      return;
    }
    setLabels([...labels, name]);
  };

  const createAndSelect = async () => {
    const value = labelDraft.trim().slice(0, MAX_LABEL);
    if (!value) return;
    const existing = workspaceLabels.find((l) => l.name.toLowerCase() === value.toLowerCase());
    if (existing) {
      if (!labels.includes(existing.name)) toggleLabel(existing.name);
      setLabelDraft("");
      return;
    }
    const created = await createLabel(workspaceId, value, "#0086f2");
    if (created) {
      setLabels([...labels, created.name]);
      setLabelDraft("");
      setError(null);
    }
  };

  const assistTask = async (mode: "improve" | "rewrite" | "breakdown") => {
    if (!title.trim() && !aiPrompt.trim()) {
      setError("Escreva um título ou explique para a IA qual tarefa deseja criar.");
      return;
    }
    setGeneratingAi(true);
    setError(null);
    try {
      const draft = await generateTaskDraft({
        workspaceId,
        projectId: taskProjectId,
        mode,
        prompt: aiPrompt.trim() || undefined,
        current: { title, description, priority },
      });
      setTitle(draft.title.slice(0, MAX_TITLE));
      setDescription(draft.description.slice(0, MAX_DESC));
      setPriority(draft.priority);
      if (draft.estimateMinutes !== null) setEstimateDraft(String(draft.estimateMinutes));
      const existingTitles = new Set(
        (liveTask?.subtasks ?? []).map((subtask) => subtask.title.trim().toLowerCase()),
      );
      setSuggestedSubtasks(
        [...new Set(draft.subtasks.map((subtask) => subtask.trim()))].filter(
          (subtask) => !existingTitles.has(subtask.toLowerCase()),
        ),
      );
      setAiPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível melhorar a tarefa.");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formReadOnly) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("O título é obrigatório.");
      return;
    }
    const selectedMembers = workspaceMembers.filter((member) => assigneeIds.includes(member.id));
    const estimateMinutes = estimateDraft.trim()
      ? parseTimeInput(estimateDraft) || undefined
      : undefined;
    const payload = {
      title: trimmed,
      description: description.trim().slice(0, MAX_DESC) || undefined,
      status,
      priority,
      assigneeIds: selectedMembers.map((member) => member.id),
      assigneeId: selectedMembers[0]?.id,
      assignee: selectedMembers[0]?.name,
      sprintId: sprintId || undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      startDate: startDate ? startDate.toISOString() : undefined,
      labels,
      estimateMinutes,
    };

    if (task) {
      updateTask(task.id, payload);
      for (const subtask of suggestedSubtasks) addSubtask(task.id, subtask);
    } else {
      createTask({
        ...payload,
        workspaceId,
        boardColumnId: defaultBoardColumnId,
        subtaskTitles: suggestedSubtasks,
      });
    }
    onOpenChange(false);
  };

  const submitComment = () => {
    const text = commentDraft.trim().slice(0, MAX_COMMENT);
    if (!text || !liveTask) return;
    addComment(liveTask.id, profileName, text);
    setCommentDraft("");
  };

  const submitSubtask = () => {
    if (!liveTask) return;
    const val = subtaskDraft.trim().slice(0, MAX_SUBTASK);
    if (!val) return;
    addSubtask(liveTask.id, val);
    setSubtaskDraft("");
  };

  const submitTimeEntry = () => {
    if (!liveTask) return;
    const minutes = parseTimeInput(timeDraft);
    if (!minutes) {
      setError("Informe um tempo válido (ex.: 45m, 1h30, 90).");
      return;
    }
    addTimeEntry(liveTask.id, minutes, timeNote || undefined, profileName);
    setTimeDraft("");
    setTimeNote("");
    setError(null);
  };

  const persistEstimate = () => {
    if (!liveTask) return;
    if (estimateDraft.trim() === "") {
      setEstimate(liveTask.id, undefined);
      return;
    }
    const val = parseTimeInput(estimateDraft);
    setEstimate(liveTask.id, val || undefined);
  };

  const totalLogged = (liveTask?.timeEntries ?? []).reduce((s, e) => s + e.minutes, 0);
  const estimate = liveTask?.estimateMinutes ?? 0;
  const timeProgress = estimate ? Math.min(100, Math.round((totalLogged / estimate) * 100)) : 0;

  const doneSubs = (liveTask?.subtasks ?? []).filter((s) => s.done).length;
  const totalSubs = liveTask?.subtasks.length ?? 0;
  const subProgress = totalSubs ? Math.round((doneSubs / totalSubs) * 100) : 0;

  const comments = liveTask?.comments ?? [];
  const activity = liveTask?.activity ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] gap-0 overflow-y-auto p-0 sm:max-w-6xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6 sm:pr-14">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>
                  {task ? (editingTask ? "Editar tarefa" : "Detalhes da tarefa") : "Nova tarefa"}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {task
                    ? "Detalhes, subtarefas, tempo, campos e atividade."
                    : "Adicione uma tarefa ao workspace."}
                </DialogDescription>
              </div>
              {task && !readOnly && !editingTask && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingTask(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
            </div>
          </DialogHeader>

          {formReadOnly && task && (
            <section className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
              <div className="min-w-0 space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Título
                  </p>
                  <h2 className="mt-1 break-words text-xl font-semibold leading-snug text-foreground">
                    {title}
                  </h2>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Descrição
                  </p>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {description || (
                      <span className="text-muted-foreground">Nenhuma descrição informada.</span>
                    )}
                  </div>
                </div>
                {labels.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Etiquetas
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: labelColorMap[label] ?? "#64748b" }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <dl className="grid content-start grid-cols-2 gap-x-4 gap-y-5 rounded-xl border bg-muted/20 p-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-1 text-sm font-medium">{statusLabels[status]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Prioridade</dt>
                  <dd className="mt-1 text-sm font-medium">{priorityLabels[priority]}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Responsáveis</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {workspaceMembers
                      .filter((member) => assigneeIds.includes(member.id))
                      .map((member) => (
                        <span
                          key={member.id}
                          className="inline-flex min-w-0 items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs"
                        >
                          <UserAvatar
                            name={member.name}
                            color={member.color}
                            imageUrl={member.avatarUrl}
                            className="h-5 w-5 text-[9px]"
                          />
                          <span className="max-w-40 truncate">{member.name}</span>
                        </span>
                      ))}
                    {!assigneeIds.length && (
                      <span className="text-sm text-muted-foreground">Sem responsável</span>
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Sprint</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {workspaceSprints.find((sprint) => sprint.id === sprintId)?.name ??
                      "Sem sprint"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Início</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {startDate ? format(startDate, "d MMM yyyy", { locale: ptBR }) : "Não definido"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Prazo</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {dueDate ? format(dueDate, "d MMM yyyy", { locale: ptBR }) : "Não definido"}
                  </dd>
                </div>
              </dl>
            </section>
          )}
          <fieldset
            disabled={formReadOnly}
            className={cn("m-0 min-w-0 border-0 p-0", formReadOnly && task && "hidden")}
          >
            <div className="grid gap-5 px-4 py-4 sm:px-6 sm:py-5 md:grid-cols-[minmax(0,1fr)_240px] md:gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
              <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {!formReadOnly && (
                  <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 lg:col-span-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Assistente de IA</p>
                        <p className="text-xs text-muted-foreground">
                          Crie ou refine o título, a descrição, a prioridade e a estimativa.
                        </p>
                      </div>
                    </div>
                    <Textarea
                      value={aiPrompt}
                      onChange={(event) => setAiPrompt(event.target.value.slice(0, 4000))}
                      rows={2}
                      placeholder="Ex.: inclua critérios de aceite e considere autenticação Google"
                      aria-label="Instrução para a IA"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        disabled={generatingAi}
                        onClick={() => assistTask(title.trim() ? "improve" : "rewrite")}
                      >
                        {generatingAi ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {title.trim() ? "Melhorar" : "Criar com IA"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={generatingAi || !title.trim()}
                        onClick={() => assistTask("rewrite")}
                      >
                        Reescrever
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={generatingAi || !title.trim()}
                        onClick={() => assistTask("breakdown")}
                      >
                        Dividir em etapas
                      </Button>
                    </div>
                    {suggestedSubtasks.length > 0 && (
                      <div className="space-y-1.5 rounded-lg border bg-background/80 p-2.5">
                        <p className="text-xs font-medium">
                          {suggestedSubtasks.length} subtarefa
                          {suggestedSubtasks.length === 1
                            ? " será criada ao salvar"
                            : "s serão criadas ao salvar"}
                        </p>
                        <ul className="space-y-1">
                          {suggestedSubtasks.map((subtask, index) => (
                            <li
                              key={`${subtask}-${index}`}
                              className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs"
                            >
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="min-w-0 flex-1">{subtask}</span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 shrink-0"
                                onClick={() =>
                                  setSuggestedSubtasks((current) =>
                                    current.filter((_, itemIndex) => itemIndex !== index),
                                  )
                                }
                                aria-label={`Remover subtarefa ${subtask}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      O conteúdo informado é processado pela OpenAI. Não envie dados sensíveis.
                    </p>
                  </section>
                )}
                <div className="space-y-2">
                  <Label htmlFor="t-title">Título</Label>
                  <Input
                    id="t-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                    placeholder="O que precisa ser feito?"
                    autoFocus={!task}
                    maxLength={MAX_TITLE}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-desc">Descrição</Label>
                  <Textarea
                    id="t-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                    rows={3}
                    placeholder="Detalhes, contexto, links…"
                    maxLength={MAX_DESC}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" /> Etiquetas
                    </Label>
                    {!formReadOnly && (
                      <Link
                        to="/workspace/$workspaceId/labels"
                        params={{ workspaceId }}
                        onClick={() => onOpenChange(false)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Settings2 className="h-3 w-3" /> Gerenciar
                      </Link>
                    )}
                  </div>
                  {workspaceLabels.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      Nenhuma etiqueta neste workspace. Crie abaixo.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {workspaceLabels.map((l) => {
                        const selected = labels.includes(l.name);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => toggleLabel(l.name)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
                              selected
                                ? "border-transparent text-white"
                                : "border-border bg-background text-foreground hover:bg-accent",
                            )}
                            style={selected ? { backgroundColor: l.color } : undefined}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            {!selected && (
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: l.color }}
                              />
                            )}
                            {l.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value.slice(0, MAX_LABEL))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          createAndSelect();
                        }
                      }}
                      placeholder="Criar nova etiqueta…"
                      maxLength={MAX_LABEL}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={createAndSelect}
                      disabled={!labelDraft.trim()}
                      aria-label="Criar etiqueta"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {labels.some((l) => !labelColorMap[l]) && (
                    <div className="flex flex-wrap gap-1.5">
                      {labels
                        .filter((l) => !labelColorMap[l])
                        .map((l) => (
                          <span
                            key={l}
                            className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs"
                          >
                            {l}
                            <button
                              type="button"
                              onClick={() => setLabels(labels.filter((x) => x !== l))}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={`Remover ${l}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(statusLabels) as TaskStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabels[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(priorityLabels) as TaskPriority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {priorityLabels[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsáveis</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {workspaceMembers.length === 0 && (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        Sem membros disponíveis.
                      </p>
                    )}
                    {workspaceMembers.map((member) => {
                      const checked = assigneeIds.includes(member.id);
                      return (
                        <label
                          key={member.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 hover:bg-accent"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              setAssigneeIds((current) =>
                                value
                                  ? [...new Set([...current, member.id])]
                                  : current.filter((id) => id !== member.id),
                              )
                            }
                          />
                          <UserAvatar
                            name={member.name}
                            color={member.color}
                            imageUrl={member.avatarUrl}
                            className="h-5 w-5 text-[9px]"
                          />
                          <span className="truncate text-sm">{member.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Sprint
                    </Label>
                    {!formReadOnly && (
                      <Link
                        to="/workspace/$workspaceId/sprints"
                        params={{ workspaceId }}
                        onClick={() => onOpenChange(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Gerenciar
                      </Link>
                    )}
                  </div>
                  <Select
                    value={sprintId || "none"}
                    onValueChange={(v) => setSprintId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem sprint</SelectItem>
                      {workspaceSprints.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id}>
                          {sp.name}
                          {sp.status === "active" ? " · ativo" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Início</Label>
                    <DatePickerControl value={startDate} onChange={setStartDate} label="Início" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Prazo</Label>
                    <DatePickerControl value={dueDate} onChange={setDueDate} label="Prazo" />
                  </div>
                </div>
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="px-4 pb-2 text-xs text-destructive sm:px-6" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="border-t px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
            <div className="order-2 sm:order-none sm:w-auto">
              {task && !formReadOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setError(null);
                    const deleted = await deleteTask(task.id);
                    if (deleted) {
                      onOpenChange(false);
                    } else {
                      setError("Não foi possível excluir a tarefa. Tente novamente.");
                      setDeleting(false);
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {deleting ? "Excluindo…" : "Excluir"}
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {formReadOnly ? "Fechar" : "Cancelar"}
              </Button>
              {!formReadOnly && (
                <Button type="submit" disabled={deleting}>
                  {task ? "Salvar alterações" : "Criar tarefa"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>

        {liveTask && (
          <div className="border-t bg-muted/20">
            <Tabs defaultValue="subtasks" className="w-full">
              <TabsList className="mx-4 mt-4 flex w-[calc(100%-2rem)] justify-start overflow-x-auto sm:mx-6 sm:w-[calc(100%-3rem)]">
                <TabsTrigger value="subtasks" className="shrink-0 gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> Subtarefas
                  {totalSubs > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {doneSubs}/{totalSubs}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="deps" className="shrink-0 gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> Deps
                  {liveTask.blockedBy.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {liveTask.blockedBy.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="github" className="shrink-0 gap-1.5">
                  <GitPullRequest className="h-3.5 w-3.5" /> GitHub
                  {liveTask.pullRequests.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {liveTask.pullRequests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="time" className="shrink-0 gap-1.5">
                  <Timer className="h-3.5 w-3.5" /> Tempo
                </TabsTrigger>
                <TabsTrigger value="fields" className="shrink-0 gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" /> Campos
                </TabsTrigger>
                <TabsTrigger value="comments" className="shrink-0 gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Comentários
                  {comments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{comments.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="attachments" className="shrink-0 gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" /> Anexos
                  {liveTask.attachments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {liveTask.attachments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity" className="shrink-0 gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> Atividade
                </TabsTrigger>
              </TabsList>

              <TabsContent value="subtasks" className="px-4 py-4 sm:px-6">
                {totalSubs > 0 && (
                  <div className="mb-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>
                        {doneSubs}/{totalSubs} ({subProgress}%)
                      </span>
                    </div>
                    <Progress value={subProgress} className="h-1.5" />
                  </div>
                )}
                <div className="space-y-1.5">
                  {liveTask.subtasks.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
                    >
                      <Checkbox
                        checked={s.done}
                        disabled={formReadOnly}
                        onCheckedChange={() => toggleSubtask(liveTask.id, s.id)}
                      />
                      <span
                        className={cn(
                          "flex-1 text-sm",
                          s.done && "text-muted-foreground line-through",
                        )}
                      >
                        {s.title}
                      </span>
                      {!formReadOnly && (
                        <button
                          type="button"
                          onClick={() => removeSubtask(liveTask.id, s.id)}
                          className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                          aria-label="Remover subtarefa"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {totalSubs === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma subtarefa ainda.</p>
                  )}
                </div>
                {!formReadOnly && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={subtaskDraft}
                      onChange={(e) => setSubtaskDraft(e.target.value.slice(0, MAX_SUBTASK))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitSubtask();
                        }
                      }}
                      placeholder="Adicionar subtarefa…"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={submitSubtask}
                      disabled={!subtaskDraft.trim()}
                      aria-label="Adicionar subtarefa"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="deps" className="px-4 py-4 sm:px-6">
                <DependenciesControl
                  blockedBy={liveTask.blockedBy}
                  candidates={wsTasks.filter((t) => t.id !== liveTask.id)}
                  onAdd={(id) => addBlocker(liveTask.id, id)}
                  onRemove={(id) => removeBlocker(liveTask.id, id)}
                  disabled={formReadOnly}
                />
              </TabsContent>

              <TabsContent value="github" className="px-4 py-4 sm:px-6">
                <div className="space-y-3">
                  {liveTask.pullRequests.map((pullRequest) => {
                    const pullLabel = pullRequest.merged
                      ? "Mergeada"
                      : pullRequest.state === "open"
                        ? pullRequest.draft
                          ? "Rascunho"
                          : "Aberta"
                        : "Fechada";
                    const ciLabel =
                      pullRequest.ciStatus === "success"
                        ? "Actions passou"
                        : pullRequest.ciStatus === "failure"
                          ? "Actions falhou"
                          : pullRequest.ciStatus === "pending"
                            ? "Actions executando"
                            : pullRequest.ciStatus === "cancelled"
                              ? "Actions cancelado"
                              : "Sem execução";
                    return (
                      <div
                        key={pullRequest.id}
                        className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center"
                      >
                        <GitPullRequest className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <a
                            href={pullRequest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                          >
                            <span className="truncate">{pullRequest.title}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pullRequest.repositoryFullName}#{pullRequest.number} · {pullLabel} ·{" "}
                            {ciLabel}
                          </p>
                        </div>
                        {!formReadOnly && (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={pullRequestBusy}
                              onClick={async () => {
                                setPullRequestBusy(true);
                                setError(null);
                                try {
                                  await refreshPullRequest(liveTask.id, pullRequest.id);
                                } catch (cause) {
                                  setError(
                                    cause instanceof Error
                                      ? cause.message
                                      : "Não foi possível atualizar a PR.",
                                  );
                                } finally {
                                  setPullRequestBusy(false);
                                }
                              }}
                              aria-label="Atualizar pull request"
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${pullRequestBusy ? "animate-spin" : ""}`}
                              />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={pullRequestBusy}
                              onClick={async () => {
                                setPullRequestBusy(true);
                                setError(null);
                                try {
                                  await removePullRequest(liveTask.id, pullRequest.id);
                                } catch (cause) {
                                  setError(
                                    cause instanceof Error
                                      ? cause.message
                                      : "Não foi possível remover o vínculo da PR.",
                                  );
                                } finally {
                                  setPullRequestBusy(false);
                                }
                              }}
                              aria-label="Remover vínculo da pull request"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {liveTask.pullRequests.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma pull request vinculada a esta tarefa.
                    </p>
                  )}
                  {!formReadOnly && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={pullRequestDraft}
                        onChange={(event) => setPullRequestDraft(event.target.value.slice(0, 500))}
                        placeholder="https://github.com/empresa/repositorio/pull/123"
                      />
                      <Button
                        type="button"
                        disabled={!pullRequestDraft.trim() || pullRequestBusy}
                        onClick={async () => {
                          setPullRequestBusy(true);
                          setError(null);
                          try {
                            await linkPullRequest(liveTask.id, pullRequestDraft.trim());
                            setPullRequestDraft("");
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "Não foi possível vincular a PR.",
                            );
                          } finally {
                            setPullRequestBusy(false);
                          }
                        }}
                      >
                        {pullRequestBusy ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                        Vincular PR
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="time" className="px-4 py-4 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estimativa</Label>
                    <Input
                      disabled={formReadOnly}
                      value={estimateDraft}
                      onChange={(e) => setEstimateDraft(e.target.value.slice(0, 12))}
                      onBlur={persistEstimate}
                      placeholder="ex.: 3h, 90m, 2h30"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {estimate ? formatMinutes(estimate) : "Sem estimativa"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total registrado</Label>
                    <div className="rounded-md border bg-background px-3 py-2 text-sm">
                      {formatMinutes(totalLogged)}
                    </div>
                    {estimate > 0 && <Progress value={timeProgress} className="h-1.5" />}
                  </div>
                </div>

                {!formReadOnly && (
                  <div className="mt-4 space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Registrar tempo
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={timeDraft}
                        onChange={(e) => setTimeDraft(e.target.value.slice(0, 12))}
                        placeholder="1h30, 45m…"
                        className="sm:w-32"
                      />
                      <Input
                        value={timeNote}
                        onChange={(e) => setTimeNote(e.target.value.slice(0, 120))}
                        placeholder="Nota (opcional)"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={submitTimeEntry}
                        disabled={!timeDraft.trim()}
                      >
                        Registrar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-1.5">
                  {liveTask.timeEntries.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum tempo registrado.</p>
                  )}
                  {liveTask.timeEntries
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div
                        key={e.id}
                        className="group flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {formatMinutes(e.minutes)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{e.note || "Sem nota"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {e.author} ·{" "}
                            {format(new Date(e.createdAt), "d MMM, HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        {!formReadOnly && (
                          <button
                            type="button"
                            onClick={() => removeTimeEntry(liveTask.id, e.id)}
                            className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                            aria-label="Remover"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="fields" className="px-4 py-4 sm:px-6">
                {workspaceFields.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhum campo personalizado.{" "}
                    <Link
                      to="/workspace/$workspaceId/fields"
                      params={{ workspaceId }}
                      onClick={() => onOpenChange(false)}
                      className="text-foreground underline"
                    >
                      Criar campo
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    {workspaceFields.map((f) => (
                      <FieldControl
                        key={f.id}
                        field={f}
                        value={liveTask.customFields[f.id] ?? null}
                        onChange={(v) => setFieldValue(liveTask.id, f.id, v)}
                        disabled={formReadOnly}
                      />
                    ))}
                    <Link
                      to="/workspace/$workspaceId/fields"
                      params={{ workspaceId }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Settings2 className="h-3 w-3" /> Gerenciar campos
                    </Link>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="comments" className="px-4 py-4 sm:px-6">
                <div className="space-y-3">
                  {comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="group flex gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {c.author.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 rounded-md border bg-background p-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{c.author}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(c.createdAt), "d MMM, HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {!formReadOnly && (
                            <button
                              type="button"
                              onClick={() => deleteComment(liveTask.id, c.id)}
                              className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                              aria-label="Excluir"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {!formReadOnly && (
                  <div className="mt-3 flex gap-2">
                    <Textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value.slice(0, MAX_COMMENT))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          submitComment();
                        }
                      }}
                      placeholder="Comente… (Ctrl+Enter para enviar)"
                      rows={2}
                      className="resize-none"
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={submitComment}
                      disabled={!commentDraft.trim()}
                      aria-label="Enviar"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="attachments" className="px-4 py-4 sm:px-6">
                <div className="space-y-2">
                  {liveTask.attachments.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum arquivo anexado.</p>
                  )}
                  {liveTask.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group flex items-center gap-3 rounded-md border bg-background p-2.5"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{attachment.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB · {attachment.uploader}
                        </p>
                      </div>
                      <Button asChild variant="ghost" size="icon">
                        <a href={`/api/attachments/${attachment.id}`} aria-label="Baixar anexo">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeAttachment(liveTask.id, attachment.id)}
                        disabled={formReadOnly}
                        aria-label="Remover anexo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {!formReadOnly && (
                  <Label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent">
                    <Paperclip className="h-3.5 w-3.5" />
                    {uploading ? "Enviando…" : "Anexar arquivo (até 10 MB)"}
                    <input
                      type="file"
                      className="sr-only"
                      disabled={uploading}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        if (file.size > MAX_ATTACHMENT_SIZE) {
                          setError("O arquivo deve ter no máximo 10 MB.");
                          return;
                        }
                        setUploading(true);
                        setError(null);
                        try {
                          await addAttachment(liveTask.id, {
                            name: file.name,
                            mimeType: file.type || "application/octet-stream",
                            size: file.size,
                            data: await fileToBase64(file),
                          });
                        } catch {
                          setError("Não foi possível enviar o arquivo.");
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </Label>
                )}
              </TabsContent>

              <TabsContent value="activity" className="px-4 py-4 sm:px-6">
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem atividade ainda.</p>
                ) : (
                  <ol className="relative space-y-3 border-l pl-4">
                    {activity
                      .slice()
                      .reverse()
                      .map((a) => (
                        <li key={a.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                          <p className="text-sm">
                            <span className="font-medium">{a.author}</span>{" "}
                            <span className="text-muted-foreground">{a.text}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(a.createdAt), "d MMM, HH:mm", { locale: ptBR })}
                          </p>
                        </li>
                      ))}
                  </ol>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

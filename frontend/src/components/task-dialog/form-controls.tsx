import { AlertTriangle, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CustomFieldValue, Task } from "@/state/workspace-store";

export function DatePickerButton({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left text-xs font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(value, "d MMM yyyy", { locale: ptBR }) : `Sem ${label.toLowerCase()}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus />
        {value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange(undefined)}
            >
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FieldEditor({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: { id: string; name: string; type: "text" | "number" | "select"; options?: string[] };
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr] sm:items-center sm:gap-3">
      <Label className="text-xs text-muted-foreground">{field.name}</Label>
      {field.type === "text" && (
        <Input
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value.slice(0, 200))}
          placeholder="—"
        />
      )}
      {field.type === "number" && (
        <Input
          disabled={disabled}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) => {
            const number = event.target.value === "" ? null : Number(event.target.value);
            onChange(number === null || Number.isNaN(number) ? null : number);
          }}
          placeholder="—"
        />
      )}
      {field.type === "select" && (
        <Select
          disabled={disabled}
          value={typeof value === "string" && value ? value : "__none"}
          onValueChange={(selected) => onChange(selected === "__none" ? null : selected)}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function parseTimeInput(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  let minutes = 0;
  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/);
  const remaining = value.match(/(\d+)\s*m/);
  if (hours) minutes += Math.round(parseFloat(hours[1]) * 60);
  if (remaining) minutes += parseInt(remaining[1], 10);
  if (hours && !remaining) {
    const tail = value.split("h")[1]?.trim();
    if (tail && /^\d+$/.test(tail)) minutes += parseInt(tail, 10);
  }
  return minutes > 0 ? minutes : null;
}

export function DependenciesEditor({
  blockedBy,
  candidates,
  onAdd,
  onRemove,
  disabled = false,
}: {
  taskId?: string;
  blockedBy: string[];
  candidates: Task[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const byId = Object.fromEntries(candidates.map((task) => [task.id, task]));
  const available = candidates.filter((task) => !blockedBy.includes(task.id));
  const unresolved = blockedBy
    .map((id) => byId[id])
    .filter((task): task is Task => !!task && task.status !== "done");
  return (
    <div className="space-y-3">
      {unresolved.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Bloqueada por {unresolved.length}{" "}
            {unresolved.length === 1 ? "tarefa não concluída" : "tarefas não concluídas"}.
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Bloqueada por</Label>
        {blockedBy.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma dependência.</p>
        )}
        {blockedBy.map((id) => {
          const task = byId[id];
          return (
            <div
              key={id}
              className="group flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  !task
                    ? "bg-muted-foreground"
                    : task.status === "done"
                      ? "bg-status-done"
                      : task.status === "in_progress"
                        ? "bg-status-progress"
                        : "bg-status-todo",
                )}
              />
              <span className="flex-1 truncate text-sm">{task?.title ?? "Tarefa removida"}</span>
              {task && (
                <span className="text-[10px] text-muted-foreground">
                  {task.status === "done"
                    ? "concluída"
                    : task.status === "in_progress"
                      ? "em progresso"
                      : "a fazer"}
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                  aria-label="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="space-y-1.5">
          <Label className="text-xs">Adicionar bloqueio</Label>
          <Select value="" onValueChange={(id) => id && onAdd(id)}>
            <SelectTrigger>
              <SelectValue
                placeholder={available.length ? "Selecione uma tarefa…" : "Sem tarefas disponíveis"}
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

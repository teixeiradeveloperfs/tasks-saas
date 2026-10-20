import type { TaskPriority, TaskStatus } from "./models";

export const LABEL_COLORS = [
  "#0086f2",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

export const MEMBER_COLORS = LABEL_COLORS;

export const statusLabels: Record<TaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em progresso",
  done: "Concluído",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export function formatMinutes(minutes: number) {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  return hours ? `${hours}h` : `${remainder}m`;
}

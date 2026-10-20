// Public frontend boundary for application state. Components should import from here,
// leaving the persistence implementation free to evolve behind this module.
export { getDataRevision, useStore } from "@/lib/store";
export { useProfile } from "@/state/use-profile";
export type * from "@task-flow/shared/domain/models";
export {
  formatMinutes,
  LABEL_COLORS,
  MEMBER_COLORS,
  priorityLabels,
  statusLabels,
} from "@task-flow/shared/domain/presentation";

import type { Workspace } from "@task-flow/shared/domain/models";

import { cn } from "@/lib/utils";

type WorkspaceAvatarProps = {
  workspace: Pick<Workspace, "name" | "color" | "imageUrl">;
  className?: string;
};

export function WorkspaceAvatar({ workspace, className }: WorkspaceAvatarProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: workspace.color }}
      aria-hidden="true"
    >
      {workspace.imageUrl ? (
        <img src={workspace.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        workspace.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

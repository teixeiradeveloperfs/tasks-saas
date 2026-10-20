import { Eye } from "lucide-react";

export function ReadOnlyNotice() {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Eye className="h-3.5 w-3.5" />
      Você tem acesso somente para leitura neste workspace.
    </div>
  );
}

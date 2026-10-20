import { cn } from "@/lib/utils";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  const blueSource = compact ? "/brand/icons/mark-blue.png" : "/brand/logo-white.png";
  const whiteSource = compact ? "/brand/icons/mark-white.png" : "/brand/logo-dark.png";

  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <img
        src={blueSource}
        alt="Taskora"
        className="block h-full w-full object-contain dark:hidden"
      />
      <img
        src={whiteSource}
        alt="Taskora"
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

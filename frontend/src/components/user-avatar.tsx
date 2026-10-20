import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  color: string;
  imageUrl?: string;
  className?: string;
};

export function UserAvatar({ name, color, imageUrl, className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (name || "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

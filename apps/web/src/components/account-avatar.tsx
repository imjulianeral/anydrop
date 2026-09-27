import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { cn } from "#/lib/utils.ts";

export function AccountAvatar({
  className,
  picture,
}: {
  className?: string;
  /** The Google profile photo; the shader shows when missing or while loading. */
  picture?: string | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "group/avatar relative flex size-7 items-center justify-center",
        className
      )}
    >
      <div className="from-halo-1 via-halo-2 to-halo-3 motion-safe:animate-spin-slow absolute -inset-1 rounded-full bg-linear-to-tr opacity-75 blur-xs transition-all duration-500 group-hover/avatar:opacity-100 group-hover/avatar:blur-sm motion-reduce:transition-none" />
      <div className="ring-background size-full rounded-full ring-2 transition-transform duration-500 motion-safe:group-hover/avatar:scale-95 motion-reduce:transition-none">
        <Avatar className="size-full">
          {picture && (
            <AvatarImage
              src={picture}
              alt=""
              referrerPolicy="no-referrer"
              draggable={false}
            />
          )}
          <AvatarFallback className="overflow-hidden">
            <ShaderBackground variant="swirl" speed={0.3} />
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

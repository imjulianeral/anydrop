import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { cn } from "#/lib/utils.ts";

export function AccountAvatar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "group/avatar relative flex size-7 items-center justify-center",
        className
      )}
    >
      <div className="absolute -inset-1 rounded-full bg-linear-to-tr from-yellow-400 via-fuchsia-500 to-violet-600 opacity-75 blur-xs transition-all duration-500 group-hover/avatar:opacity-100 group-hover/avatar:blur-sm motion-safe:animate-[spin_3s_linear_infinite] motion-reduce:transition-none" />
      <Avatar className="ring-background size-full ring-2 transition-transform duration-500 motion-safe:group-hover/avatar:scale-95 motion-reduce:transition-none">
        <AvatarFallback className="overflow-hidden">
          <ShaderBackground variant="swirl" speed={0.3} />
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

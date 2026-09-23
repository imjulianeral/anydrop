import { UsersRound } from "lucide-react";
import { useInView } from "motion/react";
import { useId, useRef } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { MorphFab } from "#/components/motion/morph-fab.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { Copy, ArrowUpRight } from "#/components/rune-icons.tsx";
import type { DeviceGroup } from "#/lib/api.ts";
import { deviceShader } from "#/lib/device-shader.ts";
import { cn } from "#/lib/utils.ts";

const memberPositions = [
  [],
  ["left-1/2 top-1/2"],
  ["left-[32%] top-1/2", "left-[68%] top-1/2"],
  ["left-1/2 top-[32%]", "left-[32%] top-[68%]", "left-[68%] top-[68%]"],
  [
    "left-[32%] top-[32%]",
    "left-[68%] top-[32%]",
    "left-[32%] top-[68%]",
    "left-[68%] top-[68%]",
  ],
];

export function GroupTile({
  group,
  selected,
  disabled,
  open,
  onOpenChange,
  onSend,
  onShowItems,
  onManage,
  onCenter,
}: {
  group: DeviceGroup;
  selected: boolean;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (group: DeviceGroup) => void;
  onShowItems: (group: DeviceGroup) => void;
  onManage: (group: DeviceGroup) => void;
  onCenter: () => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const inView = useInView(tileRef);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const menuOpen = open && !disabled;
  const shownMembers = group.members.slice(0, 4);
  const positions = memberPositions[shownMembers.length];

  return (
    <div
      ref={tileRef}
      className="relative flex size-full flex-col items-center"
    >
      <Button
        ref={triggerRef}
        aria-label={`Share with ${group.name} group`}
        aria-current={selected ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        className={cn(
          "device-orb relative size-full rounded-full p-0 focus-visible:outline-2 focus-visible:outline-offset-4",
          (selected || menuOpen) && "device-orb-selected"
        )}
        variant="secondary"
        ripple={false}
        whileHover={menuOpen ? {} : undefined}
        pressScale={1}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          onOpenChange(!menuOpen);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(true);
          }
        }}
      >
        <span aria-hidden="true" className="absolute inset-0 rounded-full">
          {shownMembers.map((member, index) => {
            const shader = deviceShader(member.id);
            return (
              <span
                key={member.id}
                className={`border-foreground/20 bg-card pointer-events-none absolute size-[38%] -translate-1/2 overflow-hidden rounded-full border shadow-sm ${positions[index]}`}
                title={member.display_name}
              >
                {inView ? (
                  <ShaderBackground
                    variant={shader}
                    {...(shader === "dot-grid" ? {} : { speed: 0.3 })}
                  />
                ) : null}
              </span>
            );
          })}
        </span>
      </Button>
      <MorphFab
        id={menuId}
        label={`Actions for ${group.name}`}
        triggerRef={triggerRef}
        open={menuOpen}
        onOpenChange={onOpenChange}
        actions={[
          {
            id: "manage",
            label: "Manage",
            icon: <UsersRound className="size-5" />,
            position: "top",
            onSelect: () => {
              onCenter();
              onManage(group);
            },
          },
          {
            id: "send",
            label: "Send",
            icon: <ArrowUpRight className="size-5" />,
            onSelect: () => {
              onCenter();
              onSend(group);
            },
          },
          {
            id: "shared",
            label: "Shared",
            icon: <Copy className="size-5" />,
            onSelect: () => {
              onCenter();
              onShowItems(group);
            },
          },
        ]}
      />
      <span
        className="bg-background/85 absolute top-full mt-3 max-w-44 origin-top truncate rounded-full px-3 py-1 text-center text-xs font-medium"
        style={{ scale: "calc(1 / var(--item-scale, 1))" }}
        title={group.name}
      >
        {group.name} · {group.members.length}
      </span>
    </div>
  );
}

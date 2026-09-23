import { useInView } from "motion/react";
import { useId, useRef } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { MorphFab } from "#/components/motion/morph-fab.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { Copy, ArrowUpRight } from "#/components/rune-icons.tsx";
import type { Peer } from "#/lib/api.ts";
import { deviceShader } from "#/lib/device-shader.ts";
import { cn } from "#/lib/utils.ts";

export function PeerTile({
  peer,
  selected,
  disabled,
  onSelect,
  onSend,
  open,
  onOpenChange,
  onShowItems,
  onCenter,
}: {
  peer: Peer;
  selected: boolean;
  disabled: boolean;
  onSelect: (peer: Peer) => void;
  onSend: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowItems: () => void;
  onCenter: () => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const inView = useInView(tileRef);
  const shader = deviceShader(peer.id);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const menuOpen = open && !disabled;

  return (
    <div
      ref={tileRef}
      className="relative flex size-full flex-col items-center"
    >
      <Button
        ref={triggerRef}
        aria-label={`Share with ${peer.display_name}`}
        aria-current={selected ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
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
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        >
          {inView ? (
            <ShaderBackground
              variant={shader}
              {...(shader === "dot-grid" ? {} : { speed: 0.3 })}
            />
          ) : null}
        </span>
      </Button>
      <MorphFab
        id={menuId}
        label={`Actions for ${peer.display_name}`}
        triggerRef={triggerRef}
        open={menuOpen}
        onOpenChange={onOpenChange}
        actions={[
          {
            id: "send",
            label: "Send",
            icon: <ArrowUpRight className="size-5" />,
            onSelect: () => {
              onCenter();
              onSelect(peer);
              onSend();
            },
          },
          {
            id: "shared",
            label: "Shared",
            icon: <Copy className="size-5" />,
            onSelect: () => {
              onCenter();
              onSelect(peer);
              onShowItems();
            },
          },
        ]}
      />
      <span
        className="bg-background/85 absolute top-full mt-3 max-w-44 origin-top truncate rounded-full px-3 py-1 text-center text-xs font-medium"
        style={{ scale: "calc(1 / var(--item-scale, 1))" }}
        title={peer.display_name}
      >
        {peer.display_name}
      </span>
    </div>
  );
}

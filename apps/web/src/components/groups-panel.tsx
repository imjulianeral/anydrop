import { useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/motion/button/base.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { ScrollProgress } from "#/components/motion/scroll-progress.tsx";
import { ScrollReveal } from "#/components/motion/scroll-reveal.tsx";
import type { DeviceGroup } from "#/lib/api.ts";

export function GroupsPanel({
  groups,
  loading,
  error,
  disabled,
  onCreate,
  onOpenGroup,
}: {
  groups: DeviceGroup[];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onCreate: () => void;
  onOpenGroup: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setOverflows(node.scrollHeight - node.clientHeight > 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) {
      observer.observe(node.firstElementChild);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative w-full">
      {overflows ? (
        <ScrollProgress fixed={false} progress={scrollYProgress} />
      ) : null}
      <section
        ref={scrollRef}
        aria-label="Your groups"
        className="max-h-[min(34rem,calc(100dvh-var(--app-dock-space)-4rem))] overflow-x-hidden overflow-y-auto"
      >
        <div className="flex flex-col gap-4 p-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium">Your groups</h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Send to several devices at once.
            </p>
          </div>
          <Button
            type="button"
            aria-label="Create a group"
            disabled={disabled}
            onClick={onCreate}
          >
            Create
          </Button>
          {loading ? <Loader label="Loading groups" variant="dots" /> : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {!loading && !error && groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">No groups yet.</p>
          ) : null}
          {groups.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <ScrollReveal root={scrollRef} y={8} blur={4}>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      className="h-auto w-full justify-between gap-3 py-3"
                      onClick={() => onOpenGroup(group.id)}
                    >
                      <span className="truncate">{group.name}</span>
                      <span className="shrink-0 text-xs">
                        {group.members.length} participants
                      </span>
                    </Button>
                  </ScrollReveal>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

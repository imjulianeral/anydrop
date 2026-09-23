import { Trash2 } from "lucide-react";
import { useInView } from "motion/react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { Button } from "#/components/motion/button/index.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { Plus, X } from "#/components/rune-icons.tsx";
import { saveGroup, deleteGroup, leaveGroup } from "#/lib/api.ts";
import type { DeviceGroup, Peer } from "#/lib/api.ts";
import { deviceShader } from "#/lib/device-shader.ts";
import { toast } from "#/lib/toast.ts";

type ManageView = "members" | "add" | "remove";

export function GroupManageModal({
  group,
  peers,
  selfId,
  token,
  refresh,
  onClose,
  onRemoved,
}: {
  group: DeviceGroup | null;
  peers: Peer[];
  selfId: string;
  token: string;
  refresh: () => Promise<void>;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [view, setView] = useState<ManageView>("members");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const contentRef = useRef<HTMLDialogElement>(null);
  const shownGroup = group;
  const open = shownGroup !== null;
  const owner = shownGroup?.owner_id === selfId;
  const available = peers.filter(
    (peer) => !shownGroup?.members.some((member) => member.id === peer.id)
  );

  const close = () => {
    if (!busy) {
      setView("members");
      onClose();
    }
  };
  const goBack = useEffectEvent(() => {
    if (busy) {
      return;
    }
    if (view === "members") {
      close();
    } else {
      setView("members");
    }
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement;
    const content = contentRef.current;
    if (content?.dataset.view === view) {
      content.focus({ preventScroll: true });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        goBack();
      }
      if (event.key !== "Tab") {
        return;
      }
      const buttons = [
        ...(content?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)"
        ) ?? []),
      ];
      if (buttons.length === 0) {
        return;
      }
      const current =
        document.activeElement instanceof HTMLButtonElement
          ? buttons.indexOf(document.activeElement)
          : -1;
      const next = event.shiftKey
        ? current <= 0
          ? buttons.length - 1
          : current - 1
        : (current + 1) % buttons.length;
      event.preventDefault();
      buttons[next]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previous instanceof HTMLElement &&
        (content?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, view]);

  const updateMembers = async (memberIds: string[]) => {
    if (!shownGroup || busy) {
      return;
    }
    setBusy(true);
    try {
      await saveGroup(
        token,
        { name: shownGroup.name, member_ids: memberIds },
        shownGroup.id
      );
      await refresh();
      setView("members");
    } catch (error) {
      toast.add({
        title: "Could not update group",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async () => {
    if (!shownGroup || busy) {
      return;
    }
    setBusy(true);
    try {
      if (owner) {
        await deleteGroup(token, shownGroup.id);
      } else {
        await leaveGroup(token, shownGroup.id);
      }
      onRemoved();
      await refresh();
      setView("members");
    } catch (error) {
      toast.add({
        title: owner ? "Could not delete group" : "Could not leave group",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MorphingModal
      viewId={open ? `${shownGroup.id}:${view}` : null}
      onClose={close}
      placement="center"
      className="max-w-md"
    >
      {shownGroup ? (
        <dialog
          open
          ref={contentRef}
          data-view={view}
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby={titleId}
          className="static m-0 flex max-h-[min(36rem,calc(100dvh-4rem))] w-full flex-col gap-5 overflow-x-hidden overflow-y-auto border-0 bg-transparent p-0 text-inherit outline-none"
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                {view === "members"
                  ? `Manage ${shownGroup.name}`
                  : view === "add"
                    ? "Add devices"
                    : owner
                      ? "Delete group"
                      : "Leave group"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {view === "members"
                  ? `${shownGroup.members.length} of 50 devices`
                  : view === "add"
                    ? `Choose a device for ${shownGroup.name}`
                    : "Previously shared items remain available until they expire."}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close group manager"
              disabled={busy}
              onClick={close}
            >
              <X className="size-4" />
            </Button>
          </header>

          {view === "members" ? (
            <>
              <ul
                aria-label="Group devices"
                className="grid max-h-72 grid-cols-3 gap-x-3 gap-y-5 overflow-x-hidden overflow-y-auto px-1 py-2 sm:grid-cols-4"
              >
                {shownGroup.members.map((member) => (
                  <li
                    key={member.id}
                    className="group flex min-w-0 flex-col items-center gap-2"
                  >
                    <span className="relative">
                      <DeviceCircle peer={member} />
                      {owner && member.id !== selfId ? (
                        <Button
                          size="icon"
                          variant="secondary"
                          ripple={false}
                          className="bg-background text-foreground border-border absolute top-0 right-0 z-10 size-7 rounded-full border p-0 opacity-80 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                          aria-label={`Remove ${member.display_name} from ${shownGroup.name}`}
                          disabled={busy}
                          onClick={() => {
                            void updateMembers(
                              shownGroup.members
                                .filter((item) => item.id !== member.id)
                                .map((item) => item.id)
                            );
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </span>
                    <span
                      className="w-full truncate text-center text-xs"
                      title={member.display_name}
                    >
                      {member.display_name}
                      {member.id === selfId ? " (you)" : ""}
                    </span>
                  </li>
                ))}
                {owner ? (
                  <li className="flex min-w-0 flex-col items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      ripple={false}
                      className="border-border text-muted-foreground size-16 rounded-full border-dashed p-0"
                      aria-label="Add devices to group"
                      disabled={busy || shownGroup.members.length >= 50}
                      onClick={() => setView("add")}
                    >
                      <Plus className="size-6" />
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      Add device
                    </span>
                  </li>
                ) : null}
              </ul>
              <Button
                variant="ghost"
                className="bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive w-full"
                disabled={busy}
                onClick={() => setView("remove")}
              >
                <Trash2 className="size-4" />
                {owner ? "Delete group" : "Leave group"}
              </Button>
            </>
          ) : null}

          {view === "add" ? (
            <>
              {available.length > 0 ? (
                <ul
                  aria-label="Available devices"
                  className="grid max-h-72 grid-cols-3 gap-4 overflow-x-hidden overflow-y-auto px-1 py-2 sm:grid-cols-4"
                >
                  {available.map((peer) => (
                    <li key={peer.id}>
                      <Button
                        variant="ghost"
                        ripple={false}
                        className="group h-auto w-full flex-col gap-2 rounded-2xl p-2"
                        disabled={busy}
                        aria-label={`Add ${peer.display_name} to ${shownGroup.name}`}
                        onClick={() => {
                          void updateMembers([
                            ...shownGroup.members.map((member) => member.id),
                            peer.id,
                          ]);
                        }}
                      >
                        <span className="relative">
                          <DeviceCircle peer={peer} />
                          <span className="bg-background absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border">
                            <Plus className="size-3.5" />
                          </span>
                        </span>
                        <span
                          className="w-full truncate text-center text-xs"
                          title={peer.display_name}
                        >
                          {peer.display_name}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No more available devices. Invite a device to add it here.
                </p>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setView("members")}
              >
                Back to group
              </Button>
            </>
          ) : null}

          {view === "remove" ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive flex-1"
                disabled={busy}
                onClick={() => void removeGroup()}
              >
                {busy ? "Working…" : owner ? "Delete group" : "Leave group"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setView("members")}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </dialog>
      ) : null}
    </MorphingModal>
  );
}

function DeviceCircle({ peer }: { peer: Peer }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const shader = deviceShader(peer.id);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="border-border bg-card block size-16 overflow-hidden rounded-full border"
    >
      {inView ? (
        <ShaderBackground
          variant={shader}
          {...(shader === "dot-grid" ? {} : { speed: 0.3 })}
        />
      ) : null}
    </span>
  );
}

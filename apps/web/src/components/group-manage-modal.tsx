import { Trash2 } from "lucide-react";
import { useInView } from "motion/react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "#/components/motion/button/base.tsx";
import { Checkbox } from "#/components/motion/checkbox.tsx";
import { Input } from "#/components/motion/input.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { Plus, X } from "#/components/rune-icons.tsx";
import { saveGroup, deleteGroup, leaveGroup } from "#/lib/api.ts";
import type { DeviceGroup, Peer } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { deviceShader } from "#/lib/device-shader.ts";
import { toast } from "#/lib/toast.ts";

type ManageView = "members" | "add" | "rename" | "remove";

export function GroupManageModal({
  group,
  creating,
  peers,
  selfId,
  token,
  refresh,
  onClose,
  onCreated,
  onRemoved,
}: {
  group: DeviceGroup | null;
  creating: boolean;
  peers: Peer[];
  selfId: string;
  token: string;
  refresh: () => Promise<void>;
  onClose: () => void;
  onCreated: (group: DeviceGroup) => void;
  onRemoved: () => void;
}) {
  const [view, setView] = useState<ManageView>("members");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [createMembers, setCreateMembers] = useState(() => new Set([selfId]));
  const [nameError, setNameError] = useState<string | null>(null);
  const titleId = useId();
  const nameId = useId();
  const contentRef = useRef<HTMLDialogElement>(null);
  const shownGroup = group;
  const open = creating || shownGroup !== null;
  const activeView = creating ? "create" : view;
  const owner = shownGroup?.owner_id === selfId;
  const removeLabel = owner ? "Delete group" : "Leave group";
  const heading = viewHeading(activeView, shownGroup, removeLabel);
  let viewId: string | null = null;
  if (creating) {
    viewId = "create";
  } else if (shownGroup) {
    viewId = `${shownGroup.id}:${view}`;
  }
  const createChoices = peers.filter((peer) => peer.id !== selfId);
  const available = peers.filter(
    (peer) => !shownGroup?.members.some((member) => member.id === peer.id)
  );

  const close = () => {
    if (!busy) {
      setView("members");
      setName("");
      setCreateMembers(new Set([selfId]));
      setNameError(null);
      onClose();
    }
  };
  const goBack = useEffectEvent(() => {
    if (busy) {
      return;
    }
    if (creating || view === "members") {
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
    if (content?.dataset.view === activeView) {
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
      const focusable = [
        ...(content?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]"
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        return;
      }
      const { activeElement } = document;
      const current =
        activeElement instanceof HTMLElement
          ? focusable.indexOf(activeElement)
          : -1;
      let next = (current + 1) % focusable.length;
      if (event.shiftKey) {
        next = current <= 0 ? focusable.length - 1 : current - 1;
      }
      event.preventDefault();
      focusable[next]?.focus();
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
  }, [open, activeView]);

  const createGroup = async () => {
    const groupName = name.trim();
    if (!groupName || busy) {
      return;
    }
    setBusy(true);
    setNameError(null);
    await attempt(
      async () => {
        const result = await saveGroup(token, {
          name: groupName,
          member_ids: [...createMembers],
        });
        await refresh();
        setName("");
        setCreateMembers(new Set([selfId]));
        onCreated(result.group);
      },
      {
        onError: (error) => {
          setNameError(
            error instanceof Error ? error.message : "Could not create group"
          );
        },
        onSettled: () => {
          setBusy(false);
        },
      }
    );
  };

  const renameGroup = async () => {
    const groupName = name.trim();
    if (!shownGroup || !groupName || busy) {
      return;
    }
    setBusy(true);
    setNameError(null);
    await attempt(
      async () => {
        await saveGroup(
          token,
          {
            name: groupName,
            member_ids: shownGroup.members.map((member) => member.id),
          },
          shownGroup.id
        );
        await refresh();
        setView("members");
      },
      {
        onError: (error) => {
          setNameError(
            error instanceof Error ? error.message : "Could not rename group"
          );
        },
        onSettled: () => {
          setBusy(false);
        },
      }
    );
  };

  const updateMembers = async (memberIds: string[]) => {
    if (!shownGroup || busy) {
      return;
    }
    setBusy(true);
    await attempt(
      async () => {
        await saveGroup(
          token,
          { name: shownGroup.name, member_ids: memberIds },
          shownGroup.id
        );
        await refresh();
        setView("members");
      },
      {
        onError: (error) => {
          toast.add({
            title: "Could not update group",
            description: error instanceof Error ? error.message : undefined,
            type: "error",
          });
        },
        onSettled: () => {
          setBusy(false);
        },
      }
    );
  };

  const removeGroup = async () => {
    if (!shownGroup || busy) {
      return;
    }
    setBusy(true);
    await attempt(
      async () => {
        await (owner ? deleteGroup : leaveGroup)(token, shownGroup.id);
        onRemoved();
        await refresh();
        setView("members");
      },
      {
        onError: (error) => {
          toast.add({
            title: owner ? "Could not delete group" : "Could not leave group",
            description: error instanceof Error ? error.message : undefined,
            type: "error",
          });
        },
        onSettled: () => {
          setBusy(false);
        },
      }
    );
  };

  return (
    <MorphingModal
      viewId={viewId}
      onClose={close}
      placement="center"
      className="max-w-md"
    >
      {open ? (
        <dialog
          open
          ref={contentRef}
          data-view={activeView}
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby={titleId}
          className="static m-0 flex max-h-[min(36rem,calc(100dvh-4rem))] w-full flex-col gap-5 overflow-x-hidden overflow-y-auto border-0 bg-transparent px-2 py-0 text-inherit outline-none"
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                {heading.title}
              </h2>
              <p className="text-muted-foreground text-sm">
                {heading.description}
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

          {creating ? (
            <CreateGroupForm
              nameId={nameId}
              name={name}
              nameError={nameError}
              busy={busy}
              choices={createChoices}
              members={createMembers}
              onNameChange={setName}
              onMembersChange={setCreateMembers}
              onSubmit={() => void createGroup()}
              onCancel={close}
            />
          ) : null}

          {shownGroup && view === "members" ? (
            <GroupMembers
              group={shownGroup}
              owner={owner}
              selfId={selfId}
              busy={busy}
              removeLabel={removeLabel}
              onMembersChange={(ids) => void updateMembers(ids)}
              onAdd={() => setView("add")}
              onRename={() => {
                setName(shownGroup.name);
                setNameError(null);
                setView("rename");
              }}
              onRemove={() => setView("remove")}
            />
          ) : null}

          {shownGroup && view === "rename" ? (
            <RenameGroupForm
              nameId={nameId}
              name={name}
              nameError={nameError}
              busy={busy}
              onNameChange={setName}
              onSubmit={() => void renameGroup()}
              onCancel={() => setView("members")}
            />
          ) : null}

          {shownGroup && view === "add" ? (
            <AddGroupDevices
              group={shownGroup}
              available={available}
              busy={busy}
              onMembersChange={(ids) => void updateMembers(ids)}
              onBack={() => setView("members")}
            />
          ) : null}

          {shownGroup && view === "remove" ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive flex-1"
                disabled={busy}
                onClick={() => void removeGroup()}
              >
                {busy ? "Working…" : removeLabel}
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

function CreateGroupForm({
  nameId,
  name,
  nameError,
  busy,
  choices,
  members,
  onNameChange,
  onMembersChange,
  onSubmit,
  onCancel,
}: {
  nameId: string;
  name: string;
  nameError: string | null;
  busy: boolean;
  choices: Peer[];
  members: Set<string>;
  onNameChange: (name: string) => void;
  onMembersChange: Dispatch<SetStateAction<Set<string>>>;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        id={nameId}
        label="Group name"
        value={name}
        onChange={onNameChange}
        maxLength={80}
        required
        disabled={busy}
        placeholder="e.g. Work devices"
        error={nameError ?? undefined}
      />
      <fieldset disabled={busy} className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          Participants · {members.size}/50
        </legend>
        <p className="text-muted-foreground text-xs">
          Your device is always included. Add nearby or connected devices.
        </p>
        {choices.length > 0 ? (
          <div className="flex max-h-52 flex-col gap-3 overflow-y-auto">
            {choices.map((peer) => (
              <Checkbox
                key={peer.id}
                checked={members.has(peer.id)}
                disabled={busy || (!members.has(peer.id) && members.size >= 50)}
                label={peer.display_name}
                onCheckedChange={(checked) => {
                  onMembersChange((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(peer.id);
                    } else {
                      next.delete(peer.id);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Open AnyShare on another device or invite one to add participants.
          </p>
        )}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create group"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function GroupMembers({
  group,
  owner,
  selfId,
  busy,
  removeLabel,
  onMembersChange,
  onAdd,
  onRename,
  onRemove,
}: {
  group: DeviceGroup;
  owner: boolean;
  selfId: string;
  busy: boolean;
  removeLabel: string;
  onMembersChange: (ids: string[]) => void;
  onAdd: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <ul
        aria-label="Group devices"
        className="grid max-h-72 grid-cols-3 gap-x-3 gap-y-5 overflow-x-hidden overflow-y-auto px-1 py-2 sm:grid-cols-4"
      >
        {group.members.map((member) => (
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
                  aria-label={`Remove ${member.display_name} from ${group.name}`}
                  disabled={busy}
                  onClick={() => {
                    onMembersChange(
                      group.members
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
              disabled={busy || group.members.length >= 50}
              onClick={onAdd}
            >
              <Plus className="size-6" />
            </Button>
            <span className="text-muted-foreground text-xs">Add device</span>
          </li>
        ) : null}
      </ul>
      <div className="flex flex-col gap-2">
        {owner ? (
          <Button variant="outline" disabled={busy} onClick={onRename}>
            Rename group
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive w-full"
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          {removeLabel}
        </Button>
      </div>
    </>
  );
}

function RenameGroupForm({
  nameId,
  name,
  nameError,
  busy,
  onNameChange,
  onSubmit,
  onCancel,
}: {
  nameId: string;
  name: string;
  nameError: string | null;
  busy: boolean;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        id={nameId}
        label="Group name"
        value={name}
        onChange={onNameChange}
        maxLength={80}
        required
        disabled={busy}
        error={nameError ?? undefined}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddGroupDevices({
  group,
  available,
  busy,
  onMembersChange,
  onBack,
}: {
  group: DeviceGroup;
  available: Peer[];
  busy: boolean;
  onMembersChange: (ids: string[]) => void;
  onBack: () => void;
}) {
  return (
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
                aria-label={`Add ${peer.display_name} to ${group.name}`}
                onClick={() => {
                  onMembersChange([
                    ...group.members.map((member) => member.id),
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
      <Button variant="outline" disabled={busy} onClick={onBack}>
        Back to group
      </Button>
    </>
  );
}

function viewHeading(
  view: ManageView | "create",
  group: DeviceGroup | null,
  removeLabel: string
) {
  switch (view) {
    case "create": {
      return {
        title: "Create group",
        description: "Choose a name and the devices to include.",
      };
    }
    case "members": {
      return {
        title: `Manage ${group?.name}`,
        description: `${group?.members.length} of 50 devices`,
      };
    }
    case "add": {
      return {
        title: "Add devices",
        description: `Choose a device for ${group?.name}`,
      };
    }
    case "rename": {
      return {
        title: "Rename group",
        description: "Choose a new name for this group.",
      };
    }
    default: {
      return {
        title: removeLabel,
        description:
          "Previously shared items remain available until they expire.",
      };
    }
  }
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

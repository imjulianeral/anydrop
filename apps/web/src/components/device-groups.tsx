import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { FileComposer } from "#/components/file-composer.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { Checkbox } from "#/components/motion/checkbox.tsx";
import { Input } from "#/components/motion/input.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { TextComposer } from "#/components/text-composer.tsx";
import { TransferHistory } from "#/components/transfer-history.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#/components/ui/field.tsx";
import { deleteGroup, leaveGroup, saveGroup } from "#/lib/api.ts";
import type { DeviceGroup } from "#/lib/api.ts";
import { toast } from "#/lib/toast.ts";
import { usePeerTransfers } from "#/lib/use-peer-transfers.ts";
import { useSendTransfers } from "#/lib/use-send-transfers.ts";

export function DeviceGroups({
  disabled = false,
  groups,
  loading,
  error,
  refresh,
  open,
  onOpenChange,
  selectedId,
  onSelectGroup,
}: {
  disabled?: boolean;
  groups: DeviceGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelectGroup: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const selected = groups.find((group) => group.id === selectedId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!sending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={disabled} />}
      >
        Groups{groups.length > 0 ? ` · ${groups.length}` : ""}
      </DialogTrigger>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>{selected?.name ?? "Your groups"}</DialogTitle>
          <DialogDescription>
            Share files and text with a set of devices. Each participant gets an
            encrypted copy.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}{" "}
            <Button
              variant="ghost"
              onClick={() => {
                void refresh();
              }}
            >
              Retry
            </Button>
          </p>
        ) : null}
        {selected ? (
          <GroupDetails
            key={selected.id}
            group={selected}
            refresh={refresh}
            onBack={() => onSelectGroup(null)}
            onSendingChange={setSending}
          />
        ) : null}
        {!selected && creating ? (
          <GroupEditor
            onCancel={() => setCreating(false)}
            onSaved={async (group) => {
              await refresh();
              onSelectGroup(group.id);
              setCreating(false);
            }}
          />
        ) : null}
        {!selected && !creating ? (
          <div className="flex flex-col gap-4">
            <Button onClick={() => setCreating(true)}>Create group</Button>
            {loading ? <Loader label="Loading groups" variant="dots" /> : null}
            {!loading && !error && groups.length === 0 ? (
              <EmptyState
                title="Bring your devices together"
                description="Create a named group, choose participants, and send to everyone at once."
              />
            ) : null}
            {groups.map((group) => (
              <Button
                key={group.id}
                variant="outline"
                className="h-auto justify-between gap-3 py-3"
                onClick={() => onSelectGroup(group.id)}
              >
                <span className="truncate">{group.name}</span>
                <span className="shrink-0">
                  {group.members.length} participants
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GroupDetails({
  group,
  refresh,
  onBack,
  onSendingChange,
}: {
  group: DeviceGroup;
  refresh: () => Promise<void>;
  onBack: () => void;
  onSendingChange: (sending: boolean) => void;
}) {
  const { self, token } = useAppSession();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const history = usePeerTransfers(null, group.id);
  const recipients = group.members.filter((member) => member.id !== self.id);
  const sender = useSendTransfers({
    token,
    recipients,
    groupId: group.id,
    onTransfer: history.appendTransfer,
  });
  const owner = group.owner_id === self.id;
  const removeLabel = owner ? "Delete group" : "Leave group";

  const sendText: typeof sender.sendText = async (...args) => {
    onSendingChange(true);
    try {
      return await sender.sendText(...args);
    } finally {
      onSendingChange(false);
    }
  };
  const sendFiles: typeof sender.sendFiles = async (...args) => {
    onSendingChange(true);
    try {
      return await sender.sendFiles(...args);
    } finally {
      onSendingChange(false);
    }
  };

  if (editing) {
    return (
      <GroupEditor
        group={group}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          await refresh();
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className="flex flex-col gap-5"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!sender.sending) {
          setFiles([...event.dataTransfer.files]);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={sender.sending}
          onClick={onBack}
        >
          All groups
        </Button>
        {owner ? (
          <Button
            variant="outline"
            size="sm"
            disabled={sender.sending}
            onClick={() => setEditing(true)}
          >
            Manage participants
          </Button>
        ) : null}
      </div>
      <ul aria-label="Participants" className="flex flex-col gap-2 text-sm">
        {group.members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate">
              {member.display_name}
              {member.id === self.id ? " (you)" : ""}
            </span>
            {member.id === group.owner_id ? (
              <span className="text-muted-foreground text-xs">Creator</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Sends to {recipients.length}{" "}
        {recipients.length === 1 ? "device" : "devices"}. Offline participants
        can open their copy before it expires. Limits apply to each copy.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={sender.sending || recipients.length === 0}
          onClick={() => setTextOpen(true)}
        >
          Send text
        </Button>
        <Button
          disabled={sender.sending || recipients.length === 0}
          onClick={() => fileInput.current?.click()}
        >
          Send files
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="Files to share with group"
        disabled={sender.sending}
        onChange={(event) => {
          setFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <TransferHistory
        transfers={history.transfers}
        loading={history.loading}
        selfId={self.id}
        peerName={group.name}
        participants={group.members}
        compact
        visible
      />
      {confirmRemove ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {owner ? "Delete this group for everyone?" : "Leave this group?"}{" "}
            Previously delivered copies stay available until they expire.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await (owner
                    ? deleteGroup(token, group.id)
                    : leaveGroup(token, group.id));
                  await refresh();
                  onBack();
                } catch (error) {
                  showError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : removeLabel}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          disabled={sender.sending}
          onClick={() => setConfirmRemove(true)}
        >
          {owner ? "Delete group" : "Leave group"}
        </Button>
      )}
      <TextComposer
        open={textOpen}
        onOpenChange={setTextOpen}
        peerName={group.name}
        sending={sender.sending}
        onSend={sendText}
      />
      {files.length > 0 ? (
        <FileComposer
          files={files}
          sending={sender.sending}
          progress={sender.progress}
          phase={sender.phase}
          onCancel={() => sender.cancel()}
          onClose={() => setFiles([])}
          onSend={sendFiles}
        />
      ) : null}
    </div>
  );
}

function GroupEditor({
  group,
  onCancel,
  onSaved,
}: {
  group?: DeviceGroup;
  onCancel: () => void;
  onSaved: (group: DeviceGroup) => Promise<void>;
}) {
  const { token, self, peers } = useAppSession();
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState(
    () => new Set(group?.members.map((member) => member.id) ?? [self.id])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = [
    ...new Map(
      [...(group?.members ?? []), ...peers].map((peer) => [peer.id, peer])
    ).values(),
  ].filter((peer) => peer.id !== self.id);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) {
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const result = await saveGroup(
            token,
            { name: name.trim(), member_ids: [...members] },
            group?.id
          );
          await onSaved(result.group);
        } catch (caughtError) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not save group"
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="group-name">Group name</FieldLabel>
          <Input
            id="group-name"
            value={name}
            onChange={setName}
            maxLength={80}
            required
            disabled={busy}
            placeholder="e.g. Work devices"
          />
        </Field>
        <FieldSet disabled={busy}>
          <FieldLegend>Participants · {members.size}/50</FieldLegend>
          <p className="text-muted-foreground text-xs">
            Your device is always included. Add nearby devices or devices you
            have connected with.
          </p>
          <div className="flex max-h-52 flex-col gap-3 overflow-y-auto">
            {choices.map((peer) => (
              <Field key={peer.id} orientation="horizontal">
                <Checkbox
                  id={`group-member-${peer.id}`}
                  checked={members.has(peer.id)}
                  disabled={
                    busy || (!members.has(peer.id) && members.size >= 50)
                  }
                  aria-label={peer.display_name}
                  onCheckedChange={(checked) => {
                    setMembers((current) => {
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
                <FieldLabel
                  htmlFor={`group-member-${peer.id}`}
                  className="min-w-0"
                >
                  <span className="truncate">{peer.display_name}</span>
                </FieldLabel>
              </Field>
            ))}
          </div>
          {choices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Open AnyShare on another device or invite one to add participants.
            </p>
          ) : null}
        </FieldSet>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <StatefulButton
            type="submit"
            state={busy ? "loading" : "idle"}
            loadingText="Saving…"
            disabled={!name.trim()}
          >
            {group ? "Save changes" : "Create group"}
          </StatefulButton>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function showError(error: unknown) {
  toast.add({
    title: "Could not update group",
    description: error instanceof Error ? error.message : undefined,
    type: "error",
  });
}

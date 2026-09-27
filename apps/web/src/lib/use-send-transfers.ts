import { useEffect, useRef, useState } from "react";

import { createFileTransfer, createTextTransfer } from "#/lib/api.ts";
import type { Peer, Transfer } from "#/lib/api.ts";
import { maxFileBytes } from "#/lib/config.ts";
import { defaultExpiration } from "#/lib/expiration-options.ts";
import { beginFileTransfer } from "#/lib/file-transfers.ts";
import { island } from "#/lib/island.ts";
import { withPreparedFile } from "#/lib/large-secrets.ts";
import { formatBytes } from "#/lib/media.ts";
import { prepareText } from "#/lib/secrets.ts";
import { sendBatch } from "#/lib/send-batch.ts";
import { uploadFile } from "#/lib/upload.ts";

type Recipient = Pick<Peer, "id" | "display_name" | "public_key">;

export function useSendTransfers({
  token,
  recipients,
  groupId,
  onTransfer,
}: {
  token: string;
  recipients: Recipient[];
  groupId?: string;
  onTransfer: (transfer: Transfer) => void;
}) {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("Uploading");
  const upload = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const batch = useRef<{
    key: string;
    files?: File[];
    completed: Set<string>;
  } | null>(null);
  useEffect(() => () => upload.current?.abort(), []);

  const begin = (key: string, files?: File[]) => {
    if (busy.current) {
      return null;
    }
    if (recipients.length === 0) {
      throw new Error("Add another participant before sending.");
    }
    const missing = recipients.filter((recipient) => !recipient.public_key);
    if (missing.length > 0) {
      throw new Error(
        `Ask ${missing.map((recipient) => recipient.display_name).join(", ")} to reload AnyShare before sending.`
      );
    }
    const sameFiles =
      files?.length === batch.current?.files?.length &&
      files?.every((file, index) => file === batch.current?.files?.[index]);
    if (!batch.current || batch.current.key !== key || (files && !sameFiles)) {
      batch.current = { key, files, completed: new Set() };
    }
    busy.current = true;
    setSending(true);
    return batch.current.completed;
  };

  const finish = () => {
    busy.current = false;
    upload.current = null;
    setSending(false);
    setProgress(null);
  };

  const sent = (transfer: Transfer, recipient: Recipient) => {
    onTransfer(transfer);
    island.sent({ transfer, peerName: recipient.display_name });
  };

  const sendText = async (body: string, expiration = defaultExpiration) => {
    const key = JSON.stringify([
      groupId,
      recipients.map((recipient) => recipient.id),
      body,
      expiration,
    ]);
    const completed = begin(key);
    if (!completed) {
      return false;
    }
    try {
      await sendBatch(
        recipients.map((recipient) => ({
          id: recipient.id,
          label: recipient.display_name,
          send: async () => {
            const prepared = await prepareText(body, {
              recipientPublicKey: recipientKey(recipient),
            });
            try {
              const created = await createTextTransfer(token, {
                recipientId: recipient.id,
                groupId,
                expiration,
                body: prepared.body,
                secret: prepared.secret,
              });
              sent(created.transfer, recipient);
            } finally {
              prepared.masterKey?.fill(0);
            }
          },
        })),
        completed
      );
      batch.current = null;
      return true;
    } finally {
      finish();
    }
  };

  const sendFiles = async (files: File[], expiration = defaultExpiration) => {
    if (files.length === 0) {
      return false;
    }
    if (files.some((file) => file.size > maxFileBytes)) {
      throw new Error(
        `Each file must be ${formatBytes(maxFileBytes)} or smaller.`
      );
    }
    const key = JSON.stringify([
      groupId,
      recipients.map((recipient) => recipient.id),
      "files",
      expiration,
    ]);
    const completed = begin(key, files);
    if (!completed) {
      return false;
    }
    const controller = new AbortController();
    upload.current = controller;
    try {
      await sendBatch(
        files.flatMap((file, index) =>
          recipients.map((recipient) => ({
            id: `${index}:${recipient.id}`,
            label: `${file.name} → ${recipient.display_name}`,
            send: async () => {
              const transfer = beginFileTransfer({
                direction: "upload",
                name: `${file.name} → ${recipient.display_name}`,
                totalBytes: file.size,
                phase: "Encrypting",
                onCancel: () => controller.abort(),
              });
              setProgress(0);
              setPhase(`Encrypting for ${recipient.display_name}`);
              try {
                await withPreparedFile(
                  file,
                  { recipientPublicKey: recipientKey(recipient) },
                  async (prepared) => {
                    const uploadPhase = `Uploading to ${recipient.display_name}`;
                    setPhase(uploadPhase);
                    setProgress(0);
                    transfer.update(uploadPhase, 0, prepared.file.size);
                    const created = await createFileTransfer(token, {
                      recipientId: recipient.id,
                      groupId,
                      expiration,
                      filename: prepared.file.name,
                      byteSize: prepared.file.size,
                      contentType:
                        prepared.file.type || "application/octet-stream",
                      secret: prepared.secret,
                    });
                    const result = await uploadFile(
                      token,
                      created.transfer.id,
                      created.upload,
                      prepared.file,
                      (ratio) => {
                        setProgress(ratio);
                        transfer.update(uploadPhase, ratio, prepared.file.size);
                      },
                      controller.signal
                    );
                    sent(result.transfer, recipient);
                  },
                  controller.signal,
                  (ratio) => {
                    setProgress(ratio);
                    transfer.update("Encrypting", ratio, file.size);
                  }
                );
                transfer.done();
              } catch (error) {
                if (controller.signal.aborted) {
                  transfer.cancel();
                } else {
                  transfer.fail();
                }
                throw error;
              }
            },
          }))
        ),
        completed,
        controller.signal
      );
      batch.current = null;
      return true;
    } finally {
      finish();
    }
  };

  return {
    sending,
    progress,
    phase,
    sendText,
    sendFiles,
    cancel: () => upload.current?.abort(),
  };
}

function recipientKey(recipient: Recipient) {
  if (!recipient.public_key) {
    throw new Error(
      `Ask ${recipient.display_name} to reload AnyShare before sending.`
    );
  }
  return recipient.public_key;
}

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import type { Transfer } from "#/lib/api.ts";
import { listGroupTransfers, listTransfers } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { island } from "#/lib/island.ts";
import {
  applyTransferUsage,
  belongsToHistory,
  mergeTransfers,
  readTransfer,
} from "#/lib/transfer-events.ts";

interface PeerHistory {
  peerId: string | null;
  transfers: Transfer[];
  loaded: boolean;
}

export function usePeerTransfers(peerId: string | null, groupId?: string) {
  const historyId = groupId ?? peerId;
  const { token, self, subscribeToEvents } = useAppSession();
  const [history, setHistory] = useState<PeerHistory>({
    peerId: null,
    transfers: [],
    loaded: false,
  });
  const selectedRef = useRef(historyId);

  useEffect(() => {
    selectedRef.current = historyId;
  }, [historyId]);

  useEffect(() => {
    if (!historyId) {
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeToEvents((payload) => {
      if (payload.type === "transfer_usage") {
        setHistory((current) => ({
          ...current,
          transfers: applyTransferUsage(current.transfers, payload),
        }));
        return;
      }
      if (
        payload.type !== "text_received" &&
        payload.type !== "transfer_offered"
      ) {
        return;
      }
      const incoming = readTransfer(payload);
      if (!incoming || !belongsToHistory(incoming, self.id, peerId, groupId)) {
        return;
      }
      setHistory((current) => ({
        peerId: historyId,
        transfers: mergeTransfers(
          current.peerId === historyId ? current.transfers : [],
          [incoming]
        ),
        loaded: current.peerId === historyId && current.loaded,
      }));
    });
    const load = async () => {
      await attempt(
        async () => {
          const payload = groupId
            ? await listGroupTransfers(token, groupId)
            : await listTransfers(token, peerId ?? "");
          if (!cancelled) {
            const visible = payload.transfers.filter((transfer) =>
              belongsToHistory(transfer, self.id, peerId, groupId)
            );
            setHistory((current) => ({
              peerId: historyId,
              transfers: mergeTransfers(
                visible,
                current.peerId === historyId
                  ? current.transfers.filter((transfer) =>
                      belongsToHistory(transfer, self.id, peerId, groupId)
                    )
                  : []
              ),
              loaded: true,
            }));
          }
        },
        {
          onError: (error) => {
            if (cancelled) {
              return;
            }
            island.error("Could not load shared items", error);
            setHistory((current) => ({
              peerId: historyId,
              transfers: current.peerId === historyId ? current.transfers : [],
              loaded: true,
            }));
          },
        }
      );
    };
    void load();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [peerId, historyId, groupId, self.id, subscribeToEvents, token]);

  const appendTransfer = useCallback(
    (transfer: Transfer) => {
      const selectedId = selectedRef.current;
      if (
        !selectedId ||
        !belongsToHistory(transfer, self.id, peerId, groupId)
      ) {
        return;
      }
      setHistory((current) => {
        const samePeer = current.peerId === selectedId;
        return {
          peerId: selectedId,
          loaded: samePeer && current.loaded,
          transfers: mergeTransfers(samePeer ? current.transfers : [], [
            transfer,
          ]),
        };
      });
    },
    [self.id, peerId, groupId]
  );

  return {
    transfers:
      history.peerId === historyId
        ? history.transfers.filter((transfer) =>
            belongsToHistory(transfer, self.id, peerId, groupId)
          )
        : [],
    loading: history.peerId !== historyId || !history.loaded,
    appendTransfer,
  };
}

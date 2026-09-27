import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";

import { FileTransferProgressButton } from "#/components/crafts/download-progress-button/index.tsx";
import {
  getFileTransfers,
  subscribeFileTransfers,
} from "#/lib/file-transfers.ts";

export function FileTransfersHost() {
  const transfers = useSyncExternalStore(
    subscribeFileTransfers,
    getFileTransfers,
    getFileTransfers
  );

  return (
    <aside
      aria-label="File transfers"
      className="pointer-events-none fixed inset-x-4 top-16 z-[100] flex flex-col items-end gap-2 pr-2 pb-2 sm:top-6"
    >
      <AnimatePresence initial={false}>
        {transfers.map((transfer) => (
          <motion.div
            key={transfer.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            className="pointer-events-auto max-w-full"
          >
            <FileTransferProgressButton transfer={transfer} />
          </motion.div>
        ))}
      </AnimatePresence>
    </aside>
  );
}

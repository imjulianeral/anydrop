import { createConsumer } from "@rails/actioncable";

import { cableUrl } from "#/lib/config.ts";

export interface CableHandlers {
  onEvent: (payload: Record<string, unknown>) => void;
  onDisconnect?: () => void;
  onConnect?: () => void;
}

export const connectRoom = (token: string, handlers: CableHandlers) => {
  const consumer = createConsumer(
    `${cableUrl()}?token=${encodeURIComponent(token)}`
  );
  const subscription = consumer.subscriptions.create("RoomChannel", {
    connected() {
      handlers.onConnect?.();
    },
    disconnected() {
      handlers.onDisconnect?.();
    },
    received(data: unknown) {
      if (data && typeof data === "object") {
        handlers.onEvent(data as Record<string, unknown>);
      }
    },
  });

  const heartbeat = globalThis.setInterval(() => {
    subscription.perform("heartbeat");
  }, 15_000);

  return () => {
    globalThis.clearInterval(heartbeat);
    subscription.unsubscribe();
    consumer.disconnect();
  };
};

import { useEffect } from "react";

import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from "#/components/motion/animated-toast-stack.tsx";
import { bindToastListener } from "#/lib/toast.ts";

export function ToastHost() {
  const { toasts, showToast, dismissToast } = useAnimatedToastStack();

  useEffect(() => {
    bindToastListener(showToast);
    return () => {
      bindToastListener(null);
    };
  }, [showToast]);

  return (
    <AnimatedToastStack
      onDismiss={dismissToast}
      placement="fixed"
      position="top-center"
      toasts={toasts}
    />
  );
}

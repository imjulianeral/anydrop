import type {
  ToastInput,
  ToastStatus,
} from "#/components/motion/animated-toast-stack.tsx";

type ToastListener = (input: ToastInput) => string;

let listener: ToastListener | null = null;

const statusFromType = (type?: string): ToastStatus => {
  if (type === "error") {
    return "error";
  }
  if (type === "success") {
    return "success";
  }
  if (type === "info") {
    return "info";
  }
  return "neutral";
};

export const toast = {
  add(input: { title: string; description?: string; type?: string }) {
    listener?.({
      title: input.title,
      description: input.description,
      status: statusFromType(input.type),
    });
  },
};

export const bindToastListener = (next: ToastListener | null) => {
  listener = next;
};

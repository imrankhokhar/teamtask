type Handler = (n: { id?: string; title?: string; body?: string; type?: string; taskId?: string }) => void;

const handlers = new Set<Handler>();

export function onAppNotify(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function emitAppNotify(n: Parameters<Handler>[0]) {
  handlers.forEach((fn) => {
    try {
      fn(n);
    } catch {
      // ignore
    }
  });
}

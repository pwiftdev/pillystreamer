export async function runAction<T>(
  action: () => Promise<T>,
  signal: AbortSignal,
  timeoutMs = 45_000,
): Promise<T> {
  signal.throwIfAborted();
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(deadline.reason);
    deadline.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const result = await Promise.race([action(), interrupted]);
    deadline.throwIfAborted();
    return result;
  } finally {
    deadline.removeEventListener("abort", onAbort);
  }
}

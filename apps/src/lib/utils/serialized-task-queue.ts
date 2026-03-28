export function createSerializedTaskQueue() {
  let tail = Promise.resolve<void>(undefined);

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task);
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
  };
}

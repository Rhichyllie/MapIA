export type TimeoutHandle = ReturnType<typeof setTimeout>;

type TimerAdapter = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

export function createDebouncedTask(
  callback: () => void,
  delayMs: number,
  timers: TimerAdapter = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  },
) {
  let timeoutHandle: TimeoutHandle | null = null;

  function clearPending() {
    if (!timeoutHandle) {
      return;
    }

    timers.clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }

  return {
    trigger() {
      clearPending();
      timeoutHandle = timers.setTimeout(() => {
        timeoutHandle = null;
        callback();
      }, delayMs);
    },
    flush() {
      if (!timeoutHandle) {
        return;
      }

      clearPending();
      callback();
    },
    cancel() {
      clearPending();
    },
    hasPending() {
      return timeoutHandle !== null;
    },
  };
}

export function createEditorSaveRequestTracker() {
  let latestRequestId = 0;

  return {
    issueRequestId() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isStaleResponse(requestId: number) {
      return requestId !== latestRequestId;
    },
    getLatestRequestId() {
      return latestRequestId;
    },
  };
}

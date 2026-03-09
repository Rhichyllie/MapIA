import { describe, expect, it, vi } from "vitest";
import {
  createDebouncedTask,
  createEditorSaveRequestTracker,
} from "./editor-autosave-helpers";

describe("editor autosave helpers", () => {
  it("debounces repeated triggers", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const task = createDebouncedTask(callback, 1000);

    task.trigger();
    task.trigger();
    task.trigger();

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(task.hasPending()).toBe(false);

    vi.useRealTimers();
  });

  it("marks obsolete responses as stale using request ids", () => {
    const tracker = createEditorSaveRequestTracker();

    const requestA = tracker.issueRequestId();
    const requestB = tracker.issueRequestId();

    expect(tracker.isStaleResponse(requestA)).toBe(true);
    expect(tracker.isStaleResponse(requestB)).toBe(false);
  });
});

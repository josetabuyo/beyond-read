// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RelayVideoBackground from "./RelayVideoBackground";

function mockVideoDuration(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, "duration", { value: duration, configurable: true });
  Object.defineProperty(video, "readyState", { value: 4, configurable: true });
}

function trackCurrentTimeAssignments(video: HTMLVideoElement) {
  let value = 0;
  const assignments: number[] = [];
  Object.defineProperty(video, "currentTime", {
    get: () => value,
    set: (v: number) => {
      assignments.push(v);
      value = v;
    },
    configurable: true,
  });
  return assignments;
}

const baseProps = {
  relayUrl: "/api/videos/test",
  totalReadingMs: 10000,
  revealed: true,
  fading: false,
  onReady: () => {},
};

describe("RelayVideoBackground", () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("never reseeks the video across word ticks while in auto mode (regression: this caused a visible stutter)", () => {
    const { container, rerender } = render(
      <RelayVideoBackground {...baseProps} wordFraction={0} mode="auto" />,
    );
    const video = container.querySelector("video")!;
    mockVideoDuration(video, 20);
    video.dispatchEvent(new Event("loadedmetadata"));

    const assignments = trackCurrentTimeAssignments(video);

    for (const wordFraction of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      rerender(
        <RelayVideoBackground {...baseProps} wordFraction={wordFraction} mode="auto" />,
      );
    }

    expect(assignments).toEqual([]);
    expect(video.play).toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("seeks the video to the matching position on every manual navigation", () => {
    const { container, rerender } = render(
      <RelayVideoBackground {...baseProps} wordFraction={0} mode="manual" />,
    );
    const video = container.querySelector("video")!;
    mockVideoDuration(video, 20);
    video.dispatchEvent(new Event("loadedmetadata"));

    const assignments = trackCurrentTimeAssignments(video);

    rerender(<RelayVideoBackground {...baseProps} wordFraction={0.5} mode="manual" />);
    rerender(<RelayVideoBackground {...baseProps} wordFraction={0.25} mode="manual" />);

    expect(assignments).toEqual([10, 5]);
    expect(video.pause).toHaveBeenCalled();
  });

  it("pauses on transition into manual mode and resumes play on return to auto", () => {
    const { container, rerender } = render(
      <RelayVideoBackground {...baseProps} wordFraction={0.3} mode="auto" />,
    );
    const video = container.querySelector("video")!;
    mockVideoDuration(video, 20);
    video.dispatchEvent(new Event("loadedmetadata"));

    rerender(<RelayVideoBackground {...baseProps} wordFraction={0.3} mode="manual" />);
    expect(video.pause).toHaveBeenCalledTimes(1);

    rerender(<RelayVideoBackground {...baseProps} wordFraction={0.3} mode="auto" />);
    expect(video.play).toHaveBeenCalled();
  });

  it("divides the playback rate by endingSlowFactor for a cinematic slow motion near the close", () => {
    const { container, rerender } = render(
      <RelayVideoBackground {...baseProps} wordFraction={0.9} mode="auto" endingSlowFactor={1} />,
    );
    const video = container.querySelector("video")!;
    mockVideoDuration(video, 20);
    video.dispatchEvent(new Event("loadedmetadata"));

    // Flush the duration/rate state updates the event listener queued.
    rerender(
      <RelayVideoBackground {...baseProps} wordFraction={0.9} mode="auto" endingSlowFactor={1} />,
    );

    const fullSpeedRate = video.playbackRate;
    expect(fullSpeedRate).toBeGreaterThan(0);

    rerender(
      <RelayVideoBackground {...baseProps} wordFraction={0.95} mode="auto" endingSlowFactor={3} />,
    );

    expect(video.playbackRate).toBeCloseTo(fullSpeedRate / 3);
  });

  it("does not render a video element (or block on preload) when there is no relay video yet", () => {
    const onReady = vi.fn();
    const { container } = render(
      <RelayVideoBackground
        {...baseProps}
        relayUrl={null}
        wordFraction={0}
        mode="auto"
        onReady={onReady}
      />,
    );

    expect(container.querySelector("video")).toBeNull();
    expect(onReady).toHaveBeenCalled();
  });
});

"use client";

import { useEffect, useRef } from "react";
import { HallView, type FlightPhase } from "./hall-view";
import { SeatMetricsOverlay } from "./SeatMetricsOverlay";
import { useShowChrome } from "@/components/use-show-chrome";
import type { SeatMetrics } from "@/types";

export type { FlightPhase };

export function SeatViewCanvas({
  screenWidthM,
  screenHeightM,
  hallDepthM,
  hallWidthM,
  seats,
  selectedSeat,
  selectedRowLabel,
  selectedNumber,
  metrics,
  spatial,
  spatialNonce,
  onFlightPhase,
  posterUrl,
  trailerUrl,
  onVideoStateChange,
}: {
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
  hallWidthM: number;
  seats: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    rowLabel?: string;
    number?: number;
    selected?: boolean;
    taken?: boolean;
  }>;
  selectedSeat: { x: number; y: number; z: number } | null;
  selectedRowLabel?: string;
  selectedNumber?: number;
  metrics?: SeatMetrics | null;
  spatial?: boolean;
  spatialNonce?: number;
  onFlightPhase?: (phase: FlightPhase | null) => void;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  onVideoStateChange?: (playing: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HallView | null>(null);
  const chrome = useShowChrome();
  const metricsBox = chrome.metrics;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new HallView(host, {
      screenWidthM,
      screenHeightM,
      hallDepthM,
      hallWidthM,
      seats,
      selectedSeat,
      spatial: !!spatial,
      spatialNonce: spatialNonce ?? 0,
      onFlightPhase,
      posterUrl,
      trailerUrl,
      onVideoStateChange,
    });
    viewRef.current = view;
    return () => {
      view.dispose();
      viewRef.current = null;
    };
    // The view is created once. Later prop changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.update({
      screenWidthM,
      screenHeightM,
      hallDepthM,
      hallWidthM,
      seats,
      selectedSeat,
      spatial: !!spatial,
      spatialNonce: spatialNonce ?? 0,
      onFlightPhase,
      posterUrl,
      trailerUrl,
      onVideoStateChange,
    });
  }, [
    screenWidthM,
    screenHeightM,
    hallDepthM,
    hallWidthM,
    seats,
    selectedSeat,
    spatial,
    spatialNonce,
    onFlightPhase,
    posterUrl,
    trailerUrl,
    onVideoStateChange,
  ]);

  return (
    <div
      className="relative h-[100svh] w-full overflow-hidden bg-[#05070d]"
      data-vr={spatial ? "on" : "off"}
      style={spatial ? { touchAction: "none" } : undefined}
    >
      <div ref={hostRef} className="absolute inset-0" />

      <div className="vr-vignette z-10" data-vr={spatial ? "on" : "off"} aria-hidden="true" />
      <div className="vr-bridge" data-vr={spatial ? "on" : "off"} aria-hidden="true" />
      {spatial && spatialNonce ? (
        <div key={spatialNonce} className="vr-iris pointer-events-none absolute inset-0 z-10 bg-[#d6b25e]/10" aria-hidden="true" />
      ) : null}

      {selectedRowLabel && selectedNumber && metrics ? (
        <div
          data-chrome="metrics"
          aria-hidden={spatial ? true : undefined}
          className="pointer-events-none absolute z-20"
          style={{ left: metricsBox.x, top: metricsBox.y, width: metricsBox.width, height: metricsBox.height }}
        >
          <SeatMetricsOverlay rowLabel={selectedRowLabel} number={selectedNumber} metrics={metrics} />
        </div>
      ) : null}
    </div>
  );
}

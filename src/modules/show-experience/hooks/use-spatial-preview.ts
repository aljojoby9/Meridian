"use client";

import { useCallback, useRef, useState } from "react";

type XrHooks = Window & {
  __meridianEnterXR?: () => void;
  __meridianExitXR?: () => void;
  __meridianVrOrient?: () => void;
};

/**
 * VR preview toggle. Headset and phone-tilt requests have to start inside the
 * click, before any await, or the browser drops the user activation.
 */
export function useSpatialPreview() {
  const [spatial, setSpatial] = useState(false);
  const [spatialNonce, setSpatialNonce] = useState(0);
  const spatialRef = useRef(false);
  spatialRef.current = spatial;

  const toggleSpatial = useCallback(() => {
    const next = !spatialRef.current;
    const hooks = window as XrHooks;
    if (next) {
      hooks.__meridianEnterXR?.();
      hooks.__meridianVrOrient?.();
      setSpatialNonce((n) => n + 1);
    } else {
      hooks.__meridianExitXR?.();
    }
    setSpatial(next);
  }, []);

  return { spatial, spatialNonce, toggleSpatial };
}

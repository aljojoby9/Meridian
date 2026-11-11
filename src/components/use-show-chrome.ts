"use client";

import { useEffect, useState } from "react";
import { showChrome, type Viewport } from "@/lib/show-visuals";

const DESKTOP: Viewport = { width: 1280, height: 800 };

export function useShowChrome() {
  const [viewport, setViewport] = useState<Viewport>(DESKTOP);

  useEffect(() => {
    const read = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return showChrome(viewport);
}

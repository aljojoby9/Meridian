"use client";

import { useEffect, useState } from "react";

const TOAST_MS = 4200;

/** A single transient status message that clears itself. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  return { toast, setToast };
}

"use client";

import { useEffect } from "react";
import { initObservability } from "@/lib/observabilityClient";

export default function ObservabilityProvider() {
  useEffect(() => {
    const teardown = initObservability();
    return () => {
      if (typeof teardown === "function") teardown();
    };
  }, []);

  return null;
}

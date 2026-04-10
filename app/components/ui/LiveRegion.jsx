"use client";

import React from "react";

export default function LiveRegion({ message, politeness = "polite" }) {
  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        margin: -1,
        border: 0,
        padding: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
      }}
    >
      {message}
    </div>
  );
}

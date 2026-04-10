"use client";

import React from "react";

export default function MobileActionBar({ actions = [], style = {}, className = "" }) {
  return (
    <div className={className} role="toolbar" aria-label="Quick actions" style={style}>
      {actions.map((action) => (
        <button
          key={action.label}
          aria-label={action.ariaLabel || action.label}
          onClick={action.onClick}
          className={action.className}
          style={action.style}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

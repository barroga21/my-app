# Real-Device QA Matrix

## Coverage

| Device | OS | Browser | Status | Notes |
|---|---|---|---|---|
| iPhone SE (3rd gen) | iOS 17+ | Safari | TODO | Small-screen focus and keyboard overlays |
| iPhone 14/15 | iOS 17+ | Safari | TODO | Baseline iOS behavior |
| iPhone 14/15 Pro Max | iOS 17+ | Safari | TODO | Large-screen spacing + fixed bars |
| Pixel 7/8 | Android 14+ | Chrome | TODO | Baseline Android behavior |
| Samsung S23/S24 | Android 14+ | Chrome | TODO | OEM keyboard/focus differences |
| iPad 10" | iPadOS 17+ | Safari | TODO | Tablet split-view and keyboard |

## Scenario Checklist

### Keyboard and Focus
- Open command palette via Ctrl/Cmd+K on Journal, Habits, Calendar.
- Verify focus enters dialog input and remains trapped until close.
- Verify Escape closes dialogs/menus.
- Verify Enter activates selected command.
- Verify no focus loss when switching overlays.

### Offline Resume and Sync
- Start online, create and save entries.
- Toggle airplane mode and save more edits.
- Return online and verify queued sync resumes.
- Validate sync status announcements and final idle state.

### Conflict Flows
- Edit same date in two sessions/devices.
- Trigger conflict review modal.
- Test per-entry Local/Remote/Merged picks.
- Validate merged result persists and syncs without data loss.

## Sign-off
- QA Owner:
- Date:
- Build ID/Commit:
- Blocking issues:

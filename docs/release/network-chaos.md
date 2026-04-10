# Network Chaos Verification

## Goal
Validate reliability under flaky/offline/high-latency conditions with real Supabase connectivity.

## Test Conditions
- Normal network baseline.
- Offline mode (airplane mode).
- High latency (e.g., network link conditioner / browser throttling).
- Intermittent loss (toggle offline/online during save operations).

## Critical Scenarios
1. Journal save while offline then reconnect.
2. Repeated retries with eventual success.
3. Conflict trigger from stale local write vs newer remote write.
4. Merge decision and forced resync completion.
5. Cross-tab sync status updates.

## Expected Outcomes
- No data loss from local edits.
- Queue survives reload and resumes when online.
- User-visible status transitions: syncing, retrying, conflict, idle.
- Conflict resolution actions produce deterministic final entry set.

## Evidence
- Capture console/network timeline.
- Capture screenshots of status chips and conflict modal.
- Record date/time and account used for each run.

## Sign-off
- Reliability owner:
- Date:
- Regression notes:

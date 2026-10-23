---
id: PAY-12
title: Webhook retries
status: In Review
assignee:
  - '@alex'
  - '@codex'
reporter: '@sam'
created_date: '2025-09-01 09:30'
updated_date: '2025-09-03 17:05'
labels:
  - webhooks
milestone: m-1
dependencies:
  - PAY-3
references:
  - docs/webhooks.md
documentation:
  - https://example.com/webhooks
priority: High
ordinal: 2000
type: feature
custom_field: kept as is
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retry failed webhook deliveries with backoff.

```md
## Acceptance Criteria
- [ ] #9 not a real criterion, it sits in a code fence
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Failed deliveries are retried
- [ ] #2 Retries back off exponentially
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Tests pass
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a retry queue.
2. Schedule with backoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Queue lives in Redis.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
<!-- COMMENT:BEGIN -->
index: 1
author: @alex
created: 2025-09-02 10:15

Started on the queue.
<!-- COMMENT:END -->
<!-- COMMENT:BEGIN -->
index: 2
author: @sam
created: 2025-09-03 08:00

Looks good, ship it.
<!-- COMMENT:END -->
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retries ship behind a flag.
<!-- SECTION:FINAL_SUMMARY:END -->

## Testing

Ran the load test twice.

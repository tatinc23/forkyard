# NEEDS (requests for the Worker owner; UI works around all of them)

1. None blocking. The UI follows the documented contract: reads and the WebSocket are public, `x-demo-key` is sent only on POSTs, and a `?key=` in the address bar is saved to localStorage and removed from the URL immediately.
2. `GET /api/hall` jobs list has no budget or total; not needed by the UI today.
3. Nice to have: `RecordedRun.agents` carries post-run reputations. The UI rewinds each agent to the `before` of its first `reputation` event so the tickers animate before -> after during a replay.

# Indexer gossip protocol

Indexer nodes compare their latest ledger state roots with peers configured in
`INDEXER_PEERS`, a comma-separated list of HTTP or HTTPS base URLs. Invalid
entries and duplicate URLs are ignored during startup. Each polling cycle reads
the local root, requests each peer's root for the same ledger, and counts fresh
disagreements toward `DIVERGENCE_THRESHOLD`.

Peer observations are keyed by peer URL, ledger sequence, and root hash. The
same observation is handled once during `GOSSIP_MESSAGE_TTL_MS` (30 seconds by
default), which prevents duplicate announcements from being counted or logged
repeatedly. The cache removes expired entries and is capped at 10,000 records.
Changing a peer's root or ledger creates a new observation immediately.

When enough peers disagree, the node self-fences and stops serving API traffic.
If RPC reconciliation dependencies were supplied, it locates the first
diverging ledger, replays the missing range, and resumes after successful
reconciliation. `GOSSIP_INTERVAL_MS` controls polling and
`DIVERGENCE_THRESHOLD` controls the number of agreeing peer observations needed
to fence.

Unit coverage for peer parsing, deduplication expiry, divergence detection,
self-fencing, and the stream circuit breaker lives under
`services/indexer/src/__tests__/`.

# Known flaky tests

| Test | Symptom | Cause | Tracking |
| --- | --- | --- | --- |
| `internal/ws TestClientReconnect` | `client did not reconnect within 2s` | On CPU-starved shared runners the test hub's accept loop sometimes misses the first reconnect. A rerun passes. | #188 |
| `internal/hub TestBroadcastFanout` | `timed out waiting for 500 deliveries` | Race-detector slowdown on 2-core runners. | #203 |

`scripts/test-ci.sh` retries these automatically. A test that still fails after its retries, or
fails again on a rerun of the same commit, is not flaking: treat it as a real failure.

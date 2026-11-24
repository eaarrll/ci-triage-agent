package rank

import (
	"fmt"
	"sort"
	"testing"
	"time"
)

// p95 of Rank over the 50k-document catalog fixture must stay under 200ms (SLO: search p95 < 300ms end to end).
const rankBudget = 200 * time.Millisecond

func TestRankLatencyBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("latency budget runs in full mode only")
	}
	docs := loadCatalog(t, "testdata/catalog-50k.json")
	queries := []string{"red shoes", "wireless earbuds", "kids raincoat", "standing desk", "coffee grinder"}

	var samples []time.Duration
	for i := 0; i < 100; i++ {
		start := time.Now()
		Rank(docs, queries[i%len(queries)], 20)
		samples = append(samples, time.Since(start))
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	p50, p95 := samples[49], samples[94]
	t.Logf("p50=%s p95=%s over %d runs", p50.Round(time.Millisecond), p95.Round(time.Millisecond), len(samples))
	if p95 > rankBudget {
		t.Fatalf("p95 %s exceeds the %s budget", p95.Round(time.Millisecond), rankBudget)
	}
}

func loadCatalog(t *testing.T, path string) []Doc {
	t.Helper()
	docs, err := readCatalog(path)
	if err != nil {
		t.Fatal(fmt.Errorf("load %s: %w", path, err))
	}
	return docs
}

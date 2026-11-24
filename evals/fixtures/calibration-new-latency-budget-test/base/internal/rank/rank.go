package rank

import (
	"sort"
	"strings"
)

// Doc is one searchable product.
type Doc struct {
	ID       string
	Title    string
	Tags     []string
	Sales30d int
}

// Result is a scored document.
type Result struct {
	ID    string
	Score float64
}

// Rank scores every document against the query terms and returns the top n.
func Rank(docs []Doc, query string, n int) []Result {
	terms := strings.Fields(strings.ToLower(query))
	results := make([]Result, 0, len(docs))
	for _, d := range docs {
		if s := score(d, terms); s > 0 {
			results = append(results, Result{ID: d.ID, Score: s})
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	if len(results) > n {
		results = results[:n]
	}
	return results
}

func score(d Doc, terms []string) float64 {
	title := strings.ToLower(d.Title)
	var s float64
	for _, t := range terms {
		if strings.Contains(title, t) {
			s += 2
		}
		for _, tag := range d.Tags {
			if tag == t {
				s++
			}
		}
	}
	if s == 0 {
		return 0
	}
	return s + float64(d.Sales30d)/1000
}

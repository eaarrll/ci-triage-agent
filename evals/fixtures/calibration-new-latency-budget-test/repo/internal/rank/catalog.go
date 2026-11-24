package rank

import (
	"encoding/json"
	"os"
)

func readCatalog(path string) ([]Doc, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var docs []Doc
	return docs, json.Unmarshal(raw, &docs)
}

package proxy

import "testing"

func TestImageModels(t *testing.T) {
	reg := NewRegistry()
	reg.mc = &cachedModels{data: []map[string]any{
		{"id": "flash", "input_modalities": []any{"text", "image"}},
		{"id": "pro", "input_modalities": []any{"text"}},
		{"id": "gpt", "capabilities": map[string]any{"vision": true}},
		{"id": "mystery"},
	}}
	for _, c := range []struct {
		model        string
		takes, known bool
	}{
		{"flash", true, true}, {"pro", false, true}, {"gpt", true, true}, {"mystery", false, false}, {"absent", false, false},
	} {
		takes, known, with := reg.ImageModels(c.model)
		if takes != c.takes || known != c.known || len(with) != 2 {
			t.Errorf("%s: takes=%v known=%v with=%v", c.model, takes, known, with)
		}
	}
}

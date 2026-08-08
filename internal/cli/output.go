package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

func outWriter() io.Writer { return os.Stdout }

func printRaw(b []byte) error {
	_, err := outWriter().Write(append(b, '\n'))
	return err
}

func printJSON(v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return printRaw(b)
}

func printYAML(v any) error {
	b, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	_, err = outWriter().Write(b)
	return err
}

func printOutput(format string, v any, tableFn func() error) error {
	switch strings.ToLower(format) {
	case "json":
		return printJSON(v)
	case "yaml", "yml":
		return printYAML(v)
	case "table", "":
		if tableFn != nil {
			return tableFn()
		}
		return printJSON(v)
	default:
		return fmt.Errorf("unknown output format %q (json|table|yaml)", format)
	}
}

func printResourceJSON(raw json.RawMessage) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return printRaw(raw)
	}
	return printJSON(v)
}

func printKVTable(headers []string, rows [][]string) {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, r := range rows {
		for i, c := range r {
			if i < len(widths) && len(c) > widths[i] {
				widths[i] = len(c)
			}
		}
	}
	writeRow := func(cols []string) {
		parts := make([]string, len(cols))
		for i, c := range cols {
			w := 0
			if i < len(widths) {
				w = widths[i]
			}
			parts[i] = fmt.Sprintf("%-*s", w, c)
		}
		fmt.Fprintln(outWriter(), strings.Join(parts, "  "))
	}
	writeRow(headers)
	sep := make([]string, len(headers))
	for i, w := range widths {
		sep[i] = strings.Repeat("-", w)
	}
	writeRow(sep)
	for _, r := range rows {
		writeRow(r)
	}
}

func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 8 {
		return "****"
	}
	return s[:4] + "…" + s[len(s)-4:]
}

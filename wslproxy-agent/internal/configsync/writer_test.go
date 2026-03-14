package configsync

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigWriter_WriteFile(t *testing.T) {
	dir := t.TempDir()
	w := NewConfigWriter(dir)

	if err := w.WriteFile("servers/prod/host-example.json", []byte(`{"id":"host:example"}`)); err != nil {
		t.Fatalf("write: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "servers/prod/host-example.json"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(data) != `{"id":"host:example"}` {
		t.Fatalf("unexpected content: %s", data)
	}
}

func TestConfigWriter_AtomicWrite(t *testing.T) {
	dir := t.TempDir()
	w := NewConfigWriter(dir)

	// Write initial file
	_ = w.WriteFile("test.json", []byte("v1"))

	// Overwrite atomically
	_ = w.WriteFile("test.json", []byte("v2"))

	data, _ := os.ReadFile(filepath.Join(dir, "test.json"))
	if string(data) != "v2" {
		t.Fatalf("expected v2, got %s", data)
	}

	// No temp file should remain
	_, err := os.Stat(filepath.Join(dir, "test.json.tmp"))
	if !os.IsNotExist(err) {
		t.Fatal("temp file should not exist after successful write")
	}
}

func TestConfigWriter_ConfigVersion(t *testing.T) {
	dir := t.TempDir()
	w := NewConfigWriter(dir)

	// No version file yet
	v := w.ReadConfigVersion()
	if v != -1 {
		t.Fatalf("expected -1, got %d", v)
	}

	// Write version
	if err := w.WriteConfigVersion(42); err != nil {
		t.Fatalf("write version: %v", err)
	}

	v = w.ReadConfigVersion()
	if v != 42 {
		t.Fatalf("expected 42, got %d", v)
	}
}

func TestConfigWriter_DeleteFile(t *testing.T) {
	dir := t.TempDir()
	w := NewConfigWriter(dir)

	_ = w.WriteFile("test.json", []byte("data"))
	if err := w.DeleteFile("test.json"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err := os.Stat(filepath.Join(dir, "test.json"))
	if !os.IsNotExist(err) {
		t.Fatal("file should be deleted")
	}

	// Delete non-existent file should not error
	if err := w.DeleteFile("nonexistent.json"); err != nil {
		t.Fatalf("delete nonexistent: %v", err)
	}
}

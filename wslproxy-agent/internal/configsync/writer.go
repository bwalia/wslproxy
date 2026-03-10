package configsync

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// ConfigWriter writes configuration files to the local filesystem atomically.
type ConfigWriter struct {
	baseDir string // e.g., /opt/nginx/data
}

// NewConfigWriter creates a writer for the given base directory.
func NewConfigWriter(baseDir string) *ConfigWriter {
	return &ConfigWriter{baseDir: baseDir}
}

// WriteFile writes data to a file path relative to baseDir atomically.
// It creates parent directories as needed.
func (w *ConfigWriter) WriteFile(relPath string, data []byte) error {
	fullPath := filepath.Join(w.baseDir, relPath)
	dir := filepath.Dir(fullPath)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}

	// Atomic write: write to temp, then rename
	tmpPath := fullPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("write temp: %w", err)
	}

	if err := os.Rename(tmpPath, fullPath); err != nil {
		os.Remove(tmpPath) // best effort cleanup
		return fmt.Errorf("rename: %w", err)
	}

	return nil
}

// WriteConfigVersion writes the config version number to .config_version file.
func (w *ConfigWriter) WriteConfigVersion(version int64) error {
	return w.WriteFile(".config_version", []byte(strconv.FormatInt(version, 10)))
}

// ReadConfigVersion reads the current config version from .config_version file.
// Returns -1 if the file doesn't exist.
func (w *ConfigWriter) ReadConfigVersion() int64 {
	data, err := os.ReadFile(filepath.Join(w.baseDir, ".config_version"))
	if err != nil {
		return -1
	}
	v, err := strconv.ParseInt(string(data), 10, 64)
	if err != nil {
		return -1
	}
	return v
}

// DeleteFile removes a file relative to baseDir.
func (w *ConfigWriter) DeleteFile(relPath string) error {
	fullPath := filepath.Join(w.baseDir, relPath)
	err := os.Remove(fullPath)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// BaseDir returns the base directory.
func (w *ConfigWriter) BaseDir() string {
	return w.baseDir
}

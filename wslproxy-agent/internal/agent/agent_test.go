package agent

import (
	"testing"
)

func TestConfig_Validate(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{
			name:    "valid config",
			config:  DefaultConfig(),
			wantErr: false,
		},
		{
			name:    "missing node-id",
			config:  Config{Region: "eu", WSLProxyURL: "http://localhost:8080", ConfigDir: "/tmp"},
			wantErr: true,
		},
		{
			name:    "missing region",
			config:  Config{NodeID: "n1", WSLProxyURL: "http://localhost:8080", ConfigDir: "/tmp"},
			wantErr: true,
		},
		{
			name:    "standalone without etcd ok",
			config:  Config{NodeID: "n1", Region: "eu", WSLProxyURL: "http://localhost:8080", ConfigDir: "/tmp", Standalone: true},
			wantErr: false,
		},
		{
			name:    "non-standalone without etcd endpoints",
			config:  Config{NodeID: "n1", Region: "eu", WSLProxyURL: "http://localhost:8080", ConfigDir: "/tmp", EtcdEndpoints: []string{}},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

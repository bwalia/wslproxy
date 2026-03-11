package httpapi

import (
	"encoding/json"
	"net/http"
)

type handlers struct {
	deps ServerDeps
}

func (h *handlers) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *handlers) handleReadyz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	inSync := h.deps.Syncer != nil && h.deps.Syncer.InSync()
	proxyHealthy := h.deps.Checker != nil && h.deps.Checker.Health().Status == "healthy"

	ready := inSync && proxyHealthy
	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}

	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ready":         ready,
		"config_synced": inSync,
		"proxy_healthy": proxyHealthy,
	})
}

func (h *handlers) handleClusterStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var nodeCount int
	if h.deps.Registry != nil {
		nodes, err := h.deps.Registry.List(r.Context(), h.deps.Region)
		if err == nil {
			nodeCount = len(nodes)
		}
	}

	var syncState interface{}
	var configVersion int64
	var configInSync bool
	if h.deps.Syncer != nil {
		st := h.deps.Syncer.State()
		syncState = st
		configVersion = st.CurrentVersion
		configInSync = st.InSync
	}

	resp := ClusterStatusResponse{
		ClusterName:   h.deps.ClusterName,
		Region:        h.deps.Region,
		NodeCount:     nodeCount,
		ConfigVersion: configVersion,
		ConfigInSync:  configInSync,
	}

	if syncState != nil {
		resp.SyncState = h.deps.Syncer.State()
	}

	if h.deps.Elector != nil {
		resp.Leader = h.deps.Elector.Leader()
		resp.IsLeader = h.deps.Elector.IsLeader()
	}

	json.NewEncoder(w).Encode(resp)
}

func (h *handlers) handleNodeList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var nodes []interface{}
	if h.deps.Registry != nil {
		nodeList, err := h.deps.Registry.List(r.Context(), h.deps.Region)
		if err != nil {
			http.Error(w, `{"error":"failed to list nodes"}`, http.StatusInternalServerError)
			return
		}
		for _, n := range nodeList {
			nodes = append(nodes, n)
		}
	}

	resp := map[string]interface{}{
		"region": h.deps.Region,
		"nodes":  nodes,
		"count":  len(nodes),
	}
	json.NewEncoder(w).Encode(resp)
}

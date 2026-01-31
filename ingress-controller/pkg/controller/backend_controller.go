package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller"
	"sigs.k8s.io/controller-runtime/pkg/log"

	wslproxyv1alpha1 "github.com/wslproxy/wslproxy/ingress-controller/pkg/apis/wslproxy/v1alpha1"
)

// WSLProxyBackendReconciler reconciles a WSLProxyBackend object
type WSLProxyBackendReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder

	// LuaConfigUpdater handles pushing config to OpenResty
	LuaConfigUpdater ConfigUpdater
}

// ConfigUpdater interface for updating Lua configuration
type ConfigUpdater interface {
	UpdateBackend(ctx context.Context, name string, config BackendConfig) error
	DeleteBackend(ctx context.Context, name string) error
}

// BackendConfig represents the config sent to Lua
type BackendConfig struct {
	Upstreams      []UpstreamConfig      `json:"upstreams"`
	LoadBalancing  string                `json:"load_balancing"`
	HealthCheck    *HealthCheckConfig    `json:"health_check,omitempty"`
	CircuitBreaker *CircuitBreakerConfig `json:"circuit_breaker,omitempty"`
}

type UpstreamConfig struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Weight      int    `json:"weight,omitempty"`
	MaxFails    int    `json:"max_fails,omitempty"`
	FailTimeout int    `json:"fail_timeout,omitempty"`
}

type HealthCheckConfig struct {
	Enabled        bool   `json:"enabled"`
	Interval       int    `json:"interval,omitempty"`
	Timeout        int    `json:"timeout,omitempty"`
	Path           string `json:"path,omitempty"`
	ExpectedStatus int    `json:"expected_status,omitempty"`
}

type CircuitBreakerConfig struct {
	Enabled   bool `json:"enabled"`
	Threshold int  `json:"threshold,omitempty"`
	Timeout   int  `json:"timeout,omitempty"`
}

// +kubebuilder:rbac:groups=wslproxy.io,resources=wslproxybackends,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=wslproxy.io,resources=wslproxybackends/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=wslproxy.io,resources=wslproxybackends/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch

// Reconcile handles WSLProxyBackend reconciliation
func (r *WSLProxyBackendReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("Reconciling WSLProxyBackend", "name", req.Name, "namespace", req.Namespace)

	// Fetch the WSLProxyBackend instance
	backend := &wslproxyv1alpha1.WSLProxyBackend{}
	err := r.Get(ctx, req.NamespacedName, backend)
	if err != nil {
		if errors.IsNotFound(err) {
			// Object not found, could have been deleted
			logger.Info("WSLProxyBackend not found, likely deleted", "name", req.Name)
			// Delete from Lua config
			if err := r.LuaConfigUpdater.DeleteBackend(ctx, req.Name); err != nil {
				logger.Error(err, "Failed to delete backend from Lua config")
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}
		logger.Error(err, "Failed to get WSLProxyBackend")
		return ctrl.Result{}, err
	}

	// Check if the backend is being deleted
	if backend.DeletionTimestamp != nil {
		logger.Info("WSLProxyBackend is being deleted", "name", req.Name)
		if err := r.LuaConfigUpdater.DeleteBackend(ctx, req.Name); err != nil {
			logger.Error(err, "Failed to delete backend from Lua config")
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Convert CRD to Lua config format
	luaConfig := r.buildBackendConfig(backend)

	// Update Lua configuration
	if err := r.LuaConfigUpdater.UpdateBackend(ctx, backend.Name, luaConfig); err != nil {
		logger.Error(err, "Failed to update backend in Lua config")
		r.Recorder.Event(backend, "Warning", "ConfigUpdateFailed", fmt.Sprintf("Failed to update Lua config: %v", err))

		// Update status
		backend.Status.Conditions = []metav1.Condition{
			{
				Type:               "Ready",
				Status:             metav1.ConditionFalse,
				Reason:             "ConfigUpdateFailed",
				Message:            err.Error(),
				LastTransitionTime: metav1.Now(),
			},
		}
		if err := r.Status().Update(ctx, backend); err != nil {
			logger.Error(err, "Failed to update backend status")
		}

		return ctrl.Result{RequeueAfter: 30 * time.Second}, err
	}

	logger.Info("Successfully updated backend in Lua config", "name", backend.Name)
	r.Recorder.Event(backend, "Normal", "ConfigUpdated", "Lua configuration updated successfully")

	// Update status
	activeCount := 0
	for _, upstream := range backend.Spec.Upstreams {
		if upstream.Host != "" {
			activeCount++
		}
	}

	backend.Status.ActiveUpstreams = activeCount
	backend.Status.TotalUpstreams = len(backend.Spec.Upstreams)
	backend.Status.LastUpdated = metav1.Now()
	backend.Status.Conditions = []metav1.Condition{
		{
			Type:               "Ready",
			Status:             metav1.ConditionTrue,
			Reason:             "ConfigUpdated",
			Message:            "Backend configuration synced to OpenResty",
			LastTransitionTime: metav1.Now(),
		},
	}

	if err := r.Status().Update(ctx, backend); err != nil {
		logger.Error(err, "Failed to update backend status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// buildBackendConfig converts CRD spec to Lua config format
func (r *WSLProxyBackendReconciler) buildBackendConfig(backend *wslproxyv1alpha1.WSLProxyBackend) BackendConfig {
	config := BackendConfig{
		Upstreams:     make([]UpstreamConfig, 0, len(backend.Spec.Upstreams)),
		LoadBalancing: backend.Spec.LoadBalancing,
	}

	for _, upstream := range backend.Spec.Upstreams {
		config.Upstreams = append(config.Upstreams, UpstreamConfig{
			Host:        upstream.Host,
			Port:        upstream.Port,
			Weight:      upstream.Weight,
			MaxFails:    upstream.MaxFails,
			FailTimeout: upstream.FailTimeout,
		})
	}

	if backend.Spec.HealthCheck != nil && backend.Spec.HealthCheck.Enabled {
		config.HealthCheck = &HealthCheckConfig{
			Enabled:        true,
			Interval:       backend.Spec.HealthCheck.Interval,
			Timeout:        backend.Spec.HealthCheck.Timeout,
			Path:           backend.Spec.HealthCheck.Path,
			ExpectedStatus: backend.Spec.HealthCheck.ExpectedStatus,
		}
	}

	if backend.Spec.CircuitBreaker != nil && backend.Spec.CircuitBreaker.Enabled {
		config.CircuitBreaker = &CircuitBreakerConfig{
			Enabled:   true,
			Threshold: backend.Spec.CircuitBreaker.Threshold,
			Timeout:   backend.Spec.CircuitBreaker.Timeout,
		}
	}

	return config
}

// SetupWithManager sets up the controller with the Manager
func (r *WSLProxyBackendReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&wslproxyv1alpha1.WSLProxyBackend{}).
		WithOptions(controller.Options{
			MaxConcurrentReconciles: 3,
		}).
		Complete(r)
}

// HTTPConfigUpdater implements ConfigUpdater via HTTP API to OpenResty
type HTTPConfigUpdater struct {
	BaseURL string
}

// UpdateBackend sends backend config to OpenResty via HTTP
func (u *HTTPConfigUpdater) UpdateBackend(ctx context.Context, name string, config BackendConfig) error {
	// This would call the Lua HTTP API endpoint
	// POST /api/internal/backends/{name}
	// Body: JSON-encoded config

	// For now, just log
	configJSON, _ := json.MarshalIndent(config, "", "  ")
	fmt.Printf("UpdateBackend: %s\n%s\n", name, string(configJSON))
	return nil
}

// DeleteBackend removes backend from OpenResty
func (u *HTTPConfigUpdater) DeleteBackend(ctx context.Context, name string) error {
	// This would call the Lua HTTP API endpoint
	// DELETE /api/internal/backends/{name}

	fmt.Printf("DeleteBackend: %s\n", name)
	return nil
}

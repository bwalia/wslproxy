package controller

import (
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	"sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

// IngressReconciler reconciles standard networking.k8s.io/v1 Ingress objects
// that have ingressClassName: wslproxy. It translates Ingress rules into
// OpenResty backend configurations via the Lua HTTP API and patches the
// Ingress status with the external LoadBalancer IP from the OpenResty Service.
type IngressReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder

	// IngressClass is the ingress class this controller handles
	IngressClass string

	// LuaConfigUpdater handles pushing config to OpenResty
	LuaConfigUpdater ConfigUpdater

	// OpenRestyServiceName is the namespaced name of the OpenResty LoadBalancer service
	OpenRestyServiceName types.NamespacedName
}

// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses,verbs=get;list;watch
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses/status,verbs=update
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingressclasses,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=endpoints,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch

// Reconcile handles Ingress reconciliation:
// 1. Checks if the Ingress matches our ingressClass
// 2. Resolves Service backends to Pod endpoints
// 3. Pushes backend config to OpenResty via Lua API
// 4. Patches the Ingress status with the LoadBalancer IP
func (r *IngressReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Fetch the Ingress
	ingress := &networkingv1.Ingress{}
	if err := r.Get(ctx, req.NamespacedName, ingress); err != nil {
		if errors.IsNotFound(err) {
			logger.Info("Ingress deleted, cleaning up backends", "name", req.Name, "namespace", req.Namespace)
			// Build a backend name from the request and delete it
			backendName := fmt.Sprintf("%s-%s", req.Namespace, req.Name)
			if err := r.LuaConfigUpdater.DeleteBackend(ctx, backendName); err != nil {
				logger.Error(err, "Failed to delete backend for deleted ingress")
			}
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Filter: only handle ingresses with our ingressClass
	if !r.matchesIngressClass(ingress) {
		return ctrl.Result{}, nil
	}

	logger.Info("Reconciling Ingress",
		"name", ingress.Name,
		"namespace", ingress.Namespace,
		"hosts", r.getHosts(ingress),
	)

	// Process each rule in the Ingress: register backends and routes
	allOK := true
	// Collect route paths per host so we can register routes after backends
	hostRoutes := make(map[string][]RoutePath)

	for _, rule := range ingress.Spec.Rules {
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			backendName := r.buildBackendName(ingress, rule.Host, path.Path)

			// Resolve the Service to endpoint IPs
			config, err := r.resolveBackend(ctx, ingress.Namespace, path.Backend)
			if err != nil {
				logger.Error(err, "Failed to resolve backend",
					"service", path.Backend.Service.Name,
					"namespace", ingress.Namespace,
				)
				r.Recorder.Eventf(ingress, corev1.EventTypeWarning, "BackendResolveFailed",
					"Failed to resolve backend %s/%s: %v",
					ingress.Namespace, path.Backend.Service.Name, err)
				allOK = false
				continue
			}

			// Push backend to OpenResty
			if err := r.LuaConfigUpdater.UpdateBackend(ctx, backendName, config); err != nil {
				logger.Error(err, "Failed to push backend to OpenResty", "backend", backendName)
				r.Recorder.Eventf(ingress, corev1.EventTypeWarning, "ConfigUpdateFailed",
					"Failed to update OpenResty config for %s: %v", backendName, err)
				allOK = false
				continue
			}

			logger.Info("Backend synced to OpenResty",
				"backend", backendName,
				"host", rule.Host,
				"path", path.Path,
				"upstreams", len(config.Upstreams),
			)

			// Collect route path for this host
			pathType := "Prefix"
			if path.PathType != nil && *path.PathType == networkingv1.PathTypeExact {
				pathType = "Exact"
			}
			routePath := RoutePath{
				Path:     path.Path,
				Backend:  backendName,
				PathType: pathType,
			}
			if rule.Host != "" {
				hostRoutes[rule.Host] = append(hostRoutes[rule.Host], routePath)
			}
		}
	}

	// Register routes for each host
	for host, paths := range hostRoutes {
		routeConfig := RouteConfig{Paths: paths}
		if err := r.LuaConfigUpdater.UpdateRoute(ctx, host, routeConfig); err != nil {
			logger.Error(err, "Failed to push route to OpenResty", "host", host)
			r.Recorder.Eventf(ingress, corev1.EventTypeWarning, "RouteUpdateFailed",
				"Failed to update OpenResty routes for %s: %v", host, err)
			allOK = false
		} else {
			logger.Info("Route synced to OpenResty", "host", host, "paths", len(paths))
		}
	}

	// Update Ingress status with the LoadBalancer IP
	if err := r.updateIngressStatus(ctx, ingress); err != nil {
		logger.Error(err, "Failed to update ingress status")
		return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
	}

	if allOK {
		r.Recorder.Event(ingress, corev1.EventTypeNormal, "Synced",
			"Ingress rules synced to OpenResty")
	}

	return ctrl.Result{}, nil
}

// matchesIngressClass returns true if the Ingress should be handled by this controller.
func (r *IngressReconciler) matchesIngressClass(ingress *networkingv1.Ingress) bool {
	if r.IngressClass == "" {
		return true
	}

	// Check spec.ingressClassName field (preferred, K8s 1.18+)
	if ingress.Spec.IngressClassName != nil {
		return *ingress.Spec.IngressClassName == r.IngressClass
	}

	// Fallback: check the deprecated kubernetes.io/ingress.class annotation
	if ann, ok := ingress.Annotations["kubernetes.io/ingress.class"]; ok {
		return ann == r.IngressClass
	}

	return false
}

// resolveBackend resolves a Kubernetes Service backend to a BackendConfig
// with actual endpoint IPs for OpenResty upstream configuration.
func (r *IngressReconciler) resolveBackend(ctx context.Context, namespace string, backend networkingv1.IngressBackend) (BackendConfig, error) {
	if backend.Service == nil {
		return BackendConfig{}, fmt.Errorf("only Service backends are supported")
	}

	svcName := backend.Service.Name
	svcPort := backend.Service.Port

	// Get the Service
	svc := &corev1.Service{}
	if err := r.Get(ctx, types.NamespacedName{Name: svcName, Namespace: namespace}, svc); err != nil {
		return BackendConfig{}, fmt.Errorf("service %s/%s not found: %w", namespace, svcName, err)
	}

	// Determine the target port
	var targetPort int32
	if svcPort.Number != 0 {
		targetPort = svcPort.Number
	} else if svcPort.Name != "" {
		for _, p := range svc.Spec.Ports {
			if p.Name == svcPort.Name {
				targetPort = p.Port
				break
			}
		}
	}
	if targetPort == 0 && len(svc.Spec.Ports) > 0 {
		targetPort = svc.Spec.Ports[0].Port
	}

	config := BackendConfig{
		Upstreams:     make([]UpstreamConfig, 0),
		LoadBalancing: "round-robin",
	}

	// For ExternalName services, use the external name directly
	if svc.Spec.Type == corev1.ServiceTypeExternalName {
		config.Upstreams = append(config.Upstreams, UpstreamConfig{
			Host:   svc.Spec.ExternalName,
			Port:   int(targetPort),
			Weight: 1,
		})
		return config, nil
	}

	// Resolve endpoints for ClusterIP/NodePort/LoadBalancer services
	endpoints := &corev1.Endpoints{}
	if err := r.Get(ctx, types.NamespacedName{Name: svcName, Namespace: namespace}, endpoints); err != nil {
		// Fallback to Service ClusterIP if endpoints not found
		if svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
			config.Upstreams = append(config.Upstreams, UpstreamConfig{
				Host:   svc.Spec.ClusterIP,
				Port:   int(targetPort),
				Weight: 1,
			})
			return config, nil
		}
		return BackendConfig{}, fmt.Errorf("no endpoints for service %s/%s: %w", namespace, svcName, err)
	}

	// Extract ready endpoint addresses
	for _, subset := range endpoints.Subsets {
		// Find the matching port
		epPort := int(targetPort)
		for _, p := range subset.Ports {
			if svcPort.Name != "" && p.Name == svcPort.Name {
				epPort = int(p.Port)
				break
			}
			if svcPort.Number != 0 && p.Port == svcPort.Number {
				epPort = int(p.Port)
				break
			}
		}

		for _, addr := range subset.Addresses {
			config.Upstreams = append(config.Upstreams, UpstreamConfig{
				Host:        addr.IP,
				Port:        epPort,
				Weight:      1,
				MaxFails:    3,
				FailTimeout: 10,
			})
		}
	}

	if len(config.Upstreams) == 0 {
		// Fallback to ClusterIP
		if svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
			config.Upstreams = append(config.Upstreams, UpstreamConfig{
				Host:   svc.Spec.ClusterIP,
				Port:   int(targetPort),
				Weight: 1,
			})
		} else {
			return BackendConfig{}, fmt.Errorf("no ready endpoints for service %s/%s", namespace, svcName)
		}
	}

	return config, nil
}

// updateIngressStatus patches the Ingress status with the LoadBalancer external IP
// from the OpenResty Service. This is what makes `kubectl get ing` show an ADDRESS.
func (r *IngressReconciler) updateIngressStatus(ctx context.Context, ingress *networkingv1.Ingress) error {
	logger := log.FromContext(ctx)

	// Get the OpenResty Service to find its external IP
	svc := &corev1.Service{}
	if err := r.Get(ctx, r.OpenRestyServiceName, svc); err != nil {
		return fmt.Errorf("failed to get OpenResty service %s: %w", r.OpenRestyServiceName, err)
	}

	// Build the desired LoadBalancer ingress list from the Service
	var desiredLBIngress []networkingv1.IngressLoadBalancerIngress
	for _, lbIngress := range svc.Status.LoadBalancer.Ingress {
		entry := networkingv1.IngressLoadBalancerIngress{}
		if lbIngress.IP != "" {
			entry.IP = lbIngress.IP
		}
		if lbIngress.Hostname != "" {
			entry.Hostname = lbIngress.Hostname
		}
		desiredLBIngress = append(desiredLBIngress, entry)
	}

	// If the Service has no LB status yet, use ExternalIPs
	if len(desiredLBIngress) == 0 {
		for _, ip := range svc.Spec.ExternalIPs {
			desiredLBIngress = append(desiredLBIngress, networkingv1.IngressLoadBalancerIngress{
				IP: ip,
			})
		}
	}

	if len(desiredLBIngress) == 0 {
		logger.Info("OpenResty service has no external IP yet, skipping status update")
		return nil
	}

	// Check if status already matches (idempotent)
	if r.statusMatches(ingress.Status.LoadBalancer.Ingress, desiredLBIngress) {
		return nil
	}

	// Patch the Ingress status
	patch := client.MergeFrom(ingress.DeepCopy())
	ingress.Status.LoadBalancer.Ingress = desiredLBIngress
	if err := r.Status().Patch(ctx, ingress, patch); err != nil {
		return fmt.Errorf("failed to patch ingress status: %w", err)
	}

	logger.Info("Updated ingress status with LoadBalancer IP",
		"ingress", ingress.Name,
		"namespace", ingress.Namespace,
		"addresses", r.formatLBIngress(desiredLBIngress),
	)
	r.Recorder.Eventf(ingress, corev1.EventTypeNormal, "IPAssigned",
		"LoadBalancer IP assigned: %s", r.formatLBIngress(desiredLBIngress))

	return nil
}

// statusMatches checks if the current Ingress LB status matches the desired state.
func (r *IngressReconciler) statusMatches(current []networkingv1.IngressLoadBalancerIngress, desired []networkingv1.IngressLoadBalancerIngress) bool {
	if len(current) != len(desired) {
		return false
	}
	for i := range current {
		if current[i].IP != desired[i].IP || current[i].Hostname != desired[i].Hostname {
			return false
		}
	}
	return true
}

// buildBackendName creates a unique backend identifier for OpenResty
func (r *IngressReconciler) buildBackendName(ingress *networkingv1.Ingress, host string, path string) string {
	name := fmt.Sprintf("%s-%s", ingress.Namespace, ingress.Name)
	if host != "" {
		// Sanitize hostname for use as backend key
		sanitized := strings.ReplaceAll(host, ".", "-")
		name = fmt.Sprintf("%s-%s", name, sanitized)
	}
	if path != "" && path != "/" {
		sanitized := strings.Trim(path, "/")
		sanitized = strings.ReplaceAll(sanitized, "/", "-")
		name = fmt.Sprintf("%s-%s", name, sanitized)
	}
	return name
}

// getHosts returns a comma-separated list of hosts from the Ingress spec
func (r *IngressReconciler) getHosts(ingress *networkingv1.Ingress) string {
	var hosts []string
	for _, rule := range ingress.Spec.Rules {
		if rule.Host != "" {
			hosts = append(hosts, rule.Host)
		}
	}
	return strings.Join(hosts, ",")
}

// formatLBIngress formats LoadBalancer ingress entries for logging
func (r *IngressReconciler) formatLBIngress(entries []networkingv1.IngressLoadBalancerIngress) string {
	var parts []string
	for _, e := range entries {
		if e.IP != "" {
			parts = append(parts, e.IP)
		}
		if e.Hostname != "" {
			parts = append(parts, e.Hostname)
		}
	}
	return strings.Join(parts, ",")
}

// SetupWithManager sets up the controller with the Manager.
// It watches Ingress resources (primary) and the OpenResty Service (secondary)
// so that when the Service gets/loses an external IP, all matching Ingresses
// are re-reconciled to update their status.
func (r *IngressReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&networkingv1.Ingress{}).
		Watches(
			&corev1.Service{},
			handler.EnqueueRequestsFromMapFunc(r.serviceToIngressMapFunc),
		).
		Watches(
			&corev1.Endpoints{},
			handler.EnqueueRequestsFromMapFunc(r.endpointsToIngressMapFunc),
		).
		WithOptions(controller.Options{
			MaxConcurrentReconciles: 3,
		}).
		Complete(r)
}

// serviceToIngressMapFunc maps a Service change to the Ingress resources that reference it.
// This handles two cases:
// 1. The OpenResty LB Service changes IP → re-reconcile ALL matching Ingresses
// 2. A backend Service changes → re-reconcile Ingresses that reference it
func (r *IngressReconciler) serviceToIngressMapFunc(ctx context.Context, obj client.Object) []reconcile.Request {
	svc, ok := obj.(*corev1.Service)
	if !ok {
		return nil
	}

	logger := ctrl.Log.WithName("service-watcher")

	// Case 1: OpenResty Service changed — re-reconcile all matching ingresses
	if svc.Namespace == r.OpenRestyServiceName.Namespace && svc.Name == r.OpenRestyServiceName.Name {
		logger.Info("OpenResty service changed, re-reconciling all ingresses")
		return r.getAllMatchingIngresses(ctx)
	}

	// Case 2: Backend service changed — find ingresses referencing it
	return r.getIngressesForService(ctx, svc.Namespace, svc.Name)
}

// endpointsToIngressMapFunc maps an Endpoints change to the Ingress resources
// whose backend Services have updated endpoints (pods scaling up/down).
func (r *IngressReconciler) endpointsToIngressMapFunc(ctx context.Context, obj client.Object) []reconcile.Request {
	ep, ok := obj.(*corev1.Endpoints)
	if !ok {
		return nil
	}
	return r.getIngressesForService(ctx, ep.Namespace, ep.Name)
}

// getAllMatchingIngresses returns reconcile requests for all Ingresses matching our class
func (r *IngressReconciler) getAllMatchingIngresses(ctx context.Context) []reconcile.Request {
	var requests []reconcile.Request

	ingressList := &networkingv1.IngressList{}
	if err := r.List(ctx, ingressList); err != nil {
		return requests
	}

	for _, ingress := range ingressList.Items {
		if r.matchesIngressClass(&ingress) {
			requests = append(requests, reconcile.Request{
				NamespacedName: types.NamespacedName{
					Name:      ingress.Name,
					Namespace: ingress.Namespace,
				},
			})
		}
	}
	return requests
}

// getIngressesForService finds all Ingresses that reference a given Service as a backend
func (r *IngressReconciler) getIngressesForService(ctx context.Context, namespace, svcName string) []reconcile.Request {
	var requests []reconcile.Request

	ingressList := &networkingv1.IngressList{}
	if err := r.List(ctx, ingressList, client.InNamespace(namespace)); err != nil {
		return requests
	}

	for _, ingress := range ingressList.Items {
		if !r.matchesIngressClass(&ingress) {
			continue
		}
		for _, rule := range ingress.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service != nil && path.Backend.Service.Name == svcName {
					requests = append(requests, reconcile.Request{
						NamespacedName: types.NamespacedName{
							Name:      ingress.Name,
							Namespace: ingress.Namespace,
						},
					})
					goto nextIngress
				}
			}
		}
	nextIngress:
	}

	return requests
}

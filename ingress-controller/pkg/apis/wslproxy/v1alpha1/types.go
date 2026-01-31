// Package v1alpha1 contains API Schema definitions for the wslproxy v1alpha1 API group
// +kubebuilder:object:generate=true
// +groupName=wslproxy.io
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// WSLProxyBackendSpec defines the desired state of WSLProxyBackend
type WSLProxyBackendSpec struct {
	// Upstreams defines the backend servers
	Upstreams []Upstream `json:"upstreams"`

	// LoadBalancing defines the load balancing policy
	// +kubebuilder:validation:Enum=round-robin;least-connections;ip-hash;weighted-round-robin
	// +kubebuilder:default=round-robin
	LoadBalancing string `json:"loadBalancing,omitempty"`

	// HealthCheck defines health check configuration
	HealthCheck *HealthCheck `json:"healthCheck,omitempty"`

	// CircuitBreaker defines circuit breaking configuration
	CircuitBreaker *CircuitBreaker `json:"circuitBreaker,omitempty"`

	// Timeout defines timeout settings
	Timeout *Timeout `json:"timeout,omitempty"`

	// Retries defines retry policy
	Retries *RetryPolicy `json:"retries,omitempty"`
}

// Upstream represents a backend server
type Upstream struct {
	// Host is the upstream server hostname or IP
	// +kubebuilder:validation:Required
	Host string `json:"host"`

	// Port is the upstream server port
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=65535
	Port int `json:"port"`

	// Weight for weighted load balancing
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=100
	// +kubebuilder:default=1
	Weight int `json:"weight,omitempty"`

	// MaxFails before marking upstream as down
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:default=1
	MaxFails int `json:"maxFails,omitempty"`

	// FailTimeout in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=10
	FailTimeout int `json:"failTimeout,omitempty"`
}

// HealthCheck defines health check configuration
type HealthCheck struct {
	// Enabled enables health checks
	Enabled bool `json:"enabled"`

	// Interval between health checks in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=5
	Interval int `json:"interval,omitempty"`

	// Timeout for health check in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=3
	Timeout int `json:"timeout,omitempty"`

	// Path for HTTP health check
	// +kubebuilder:default=/health
	Path string `json:"path,omitempty"`

	// ExpectedStatus for successful health check
	// +kubebuilder:default=200
	ExpectedStatus int `json:"expectedStatus,omitempty"`
}

// CircuitBreaker defines circuit breaking configuration
type CircuitBreaker struct {
	// Enabled enables circuit breaking
	Enabled bool `json:"enabled"`

	// Threshold for consecutive failures before opening circuit
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=5
	Threshold int `json:"threshold,omitempty"`

	// Timeout before attempting to close circuit in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=30
	Timeout int `json:"timeout,omitempty"`
}

// Timeout defines timeout settings
type Timeout struct {
	// Connect timeout in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=5
	Connect int `json:"connect,omitempty"`

	// Send timeout in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=60
	Send int `json:"send,omitempty"`

	// Read timeout in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=60
	Read int `json:"read,omitempty"`
}

// RetryPolicy defines retry configuration
type RetryPolicy struct {
	// Attempts number of retry attempts
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=10
	// +kubebuilder:default=3
	Attempts int `json:"attempts,omitempty"`

	// Timeout for retries in seconds
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:default=5
	Timeout int `json:"timeout,omitempty"`

	// Backoff strategy
	// +kubebuilder:validation:Enum=fixed;exponential;linear
	// +kubebuilder:default=exponential
	Backoff string `json:"backoff,omitempty"`
}

// WSLProxyBackendStatus defines the observed state of WSLProxyBackend
type WSLProxyBackendStatus struct {
	// Conditions represent the latest available observations of the backend's state
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ActiveUpstreams count of healthy upstreams
	ActiveUpstreams int `json:"activeUpstreams,omitempty"`

	// TotalUpstreams count of total upstreams
	TotalUpstreams int `json:"totalUpstreams,omitempty"`

	// LastUpdated timestamp
	LastUpdated metav1.Time `json:"lastUpdated,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Load Balancing",type=string,JSONPath=`.spec.loadBalancing`
// +kubebuilder:printcolumn:name="Active",type=integer,JSONPath=`.status.activeUpstreams`
// +kubebuilder:printcolumn:name="Total",type=integer,JSONPath=`.status.totalUpstreams`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// WSLProxyBackend is the Schema for the wslproxybackends API
type WSLProxyBackend struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   WSLProxyBackendSpec   `json:"spec,omitempty"`
	Status WSLProxyBackendStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// WSLProxyBackendList contains a list of WSLProxyBackend
type WSLProxyBackendList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []WSLProxyBackend `json:"items"`
}

// WSLProxyRouteSpec defines the desired state of WSLProxyRoute
type WSLProxyRouteSpec struct {
	// Host is the hostname for this route
	Host string `json:"host"`

	// Paths defines path-based routing rules
	Paths []PathRule `json:"paths"`

	// TLS configuration
	TLS *TLSConfig `json:"tls,omitempty"`

	// Headers for header-based routing
	Headers map[string]string `json:"headers,omitempty"`

	// TrafficSplit for canary/blue-green deployments
	TrafficSplit *TrafficSplit `json:"trafficSplit,omitempty"`

	// RateLimit configuration
	RateLimit *RateLimit `json:"rateLimit,omitempty"`

	// CORS configuration
	CORS *CORS `json:"cors,omitempty"`
}

// PathRule defines a path-based routing rule
type PathRule struct {
	// Path is the URL path
	// +kubebuilder:validation:Required
	Path string `json:"path"`

	// PathType determines path matching strategy
	// +kubebuilder:validation:Enum=Prefix;Exact;Regex
	// +kubebuilder:default=Prefix
	PathType string `json:"pathType,omitempty"`

	// Backend reference
	// +kubebuilder:validation:Required
	Backend BackendRef `json:"backend"`

	// Rewrite configuration
	Rewrite *Rewrite `json:"rewrite,omitempty"`
}

// BackendRef references a WSLProxyBackend
type BackendRef struct {
	// Name of the WSLProxyBackend
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// Namespace of the WSLProxyBackend (defaults to route namespace)
	Namespace string `json:"namespace,omitempty"`
}

// Rewrite defines URL rewriting
type Rewrite struct {
	// Target path to rewrite to
	Target string `json:"target"`
}

// TLSConfig defines TLS configuration
type TLSConfig struct {
	// SecretName containing TLS certificate
	SecretName string `json:"secretName"`

	// MinVersion minimum TLS version
	// +kubebuilder:validation:Enum=1.0;1.1;1.2;1.3
	// +kubebuilder:default=1.2
	MinVersion string `json:"minVersion,omitempty"`

	// CipherSuites allowed cipher suites
	CipherSuites []string `json:"cipherSuites,omitempty"`
}

// TrafficSplit defines traffic splitting for canary deployments
type TrafficSplit struct {
	// Primary backend and weight
	Primary WeightedBackend `json:"primary"`

	// Canary backend and weight
	Canary WeightedBackend `json:"canary"`
}

// WeightedBackend represents a backend with weight
type WeightedBackend struct {
	// Backend reference
	Backend BackendRef `json:"backend"`

	// Weight percentage (0-100)
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=100
	Weight int `json:"weight"`
}

// RateLimit defines rate limiting configuration
type RateLimit struct {
	// RequestsPerSecond allowed
	// +kubebuilder:validation:Minimum=1
	RequestsPerSecond int `json:"requestsPerSecond"`

	// Burst size
	// +kubebuilder:validation:Minimum=0
	Burst int `json:"burst,omitempty"`

	// Key for rate limiting (e.g., $binary_remote_addr)
	// +kubebuilder:default=$binary_remote_addr
	Key string `json:"key,omitempty"`
}

// CORS defines CORS configuration
type CORS struct {
	// AllowOrigins list of allowed origins
	AllowOrigins []string `json:"allowOrigins"`

	// AllowMethods list of allowed HTTP methods
	AllowMethods []string `json:"allowMethods,omitempty"`

	// AllowHeaders list of allowed headers
	AllowHeaders []string `json:"allowHeaders,omitempty"`

	// ExposeHeaders list of exposed headers
	ExposeHeaders []string `json:"exposeHeaders,omitempty"`

	// MaxAge for preflight requests
	MaxAge int `json:"maxAge,omitempty"`

	// AllowCredentials
	AllowCredentials bool `json:"allowCredentials,omitempty"`
}

// WSLProxyRouteStatus defines the observed state of WSLProxyRoute
type WSLProxyRouteStatus struct {
	// Conditions represent the latest available observations
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// LastUpdated timestamp
	LastUpdated metav1.Time `json:"lastUpdated,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Host",type=string,JSONPath=`.spec.host`
// +kubebuilder:printcolumn:name="Paths",type=integer,JSONPath=`.spec.paths[*]`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// WSLProxyRoute is the Schema for the wslproxyroutes API
type WSLProxyRoute struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   WSLProxyRouteSpec   `json:"spec,omitempty"`
	Status WSLProxyRouteStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// WSLProxyRouteList contains a list of WSLProxyRoute
type WSLProxyRouteList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []WSLProxyRoute `json:"items"`
}

func init() {
	SchemeBuilder.Register(&WSLProxyBackend{}, &WSLProxyBackendList{})
	SchemeBuilder.Register(&WSLProxyRoute{}, &WSLProxyRouteList{})
}

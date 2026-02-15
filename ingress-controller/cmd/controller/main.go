package main

import (
	"flag"
	"fmt"
	"os"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	_ "k8s.io/client-go/plugin/pkg/client/auth"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"

	wslproxyv1alpha1 "github.com/wslproxy/wslproxy/ingress-controller/pkg/apis/wslproxy/v1alpha1"
	"github.com/wslproxy/wslproxy/ingress-controller/pkg/controller"
)

var (
	scheme   = runtime.NewScheme()
	setupLog = ctrl.Log.WithName("setup")
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(wslproxyv1alpha1.AddToScheme(scheme))
	// Register networking.k8s.io/v1 for Ingress resources
	utilruntime.Must(networkingv1.AddToScheme(scheme))
}

func main() {
	var metricsAddr string
	var enableLeaderElection bool
	var probeAddr string
	var openrestyAPIURL string
	var ingressClass string
	var openrestyServiceName string
	var openrestyServiceNamespace string

	flag.StringVar(&metricsAddr, "metrics-bind-address", ":8080", "The address the metric endpoint binds to.")
	flag.StringVar(&probeAddr, "health-probe-bind-address", ":8081", "The address the probe endpoint binds to.")
	flag.BoolVar(&enableLeaderElection, "leader-elect", false,
		"Enable leader election for controller manager. "+
			"Enabling this will ensure there is only one active controller manager.")
	flag.StringVar(&openrestyAPIURL, "openresty-api-url", "http://localhost:8080/api/internal",
		"The base URL for OpenResty internal API")
	flag.StringVar(&ingressClass, "ingress-class", "wslproxy",
		"The ingress class this controller handles. Only Ingress resources with a matching "+
			"ingressClassName will be reconciled.")
	flag.StringVar(&openrestyServiceName, "openresty-service-name", "",
		"Name of the OpenResty LoadBalancer Service (for Ingress status updates)")
	flag.StringVar(&openrestyServiceNamespace, "openresty-service-namespace", "",
		"Namespace of the OpenResty LoadBalancer Service")
	opts := zap.Options{
		Development: true,
	}
	opts.BindFlags(flag.CommandLine)
	flag.Parse()

	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

	// Auto-detect OpenResty service namespace from pod namespace if not specified
	if openrestyServiceNamespace == "" {
		openrestyServiceNamespace = os.Getenv("POD_NAMESPACE")
		if openrestyServiceNamespace == "" {
			openrestyServiceNamespace = "wslproxy-system"
		}
	}

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme: scheme,
		Metrics: metricsserver.Options{
			BindAddress: metricsAddr,
		},
		HealthProbeBindAddress: probeAddr,
		LeaderElection:         enableLeaderElection,
		LeaderElectionID:       "wslproxy-ingress-controller.wslproxy.io",
	})
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	// Create the shared config updater (real HTTP calls to OpenResty Lua API)
	configUpdater := controller.NewHTTPConfigUpdater(openrestyAPIURL)

	// Setup WSLProxyBackend CRD reconciler
	if err = (&controller.WSLProxyBackendReconciler{
		Client:           mgr.GetClient(),
		Scheme:           mgr.GetScheme(),
		Recorder:         mgr.GetEventRecorderFor("wslproxy-backend-controller"),
		IngressClass:     ingressClass,
		LuaConfigUpdater: configUpdater,
	}).SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "WSLProxyBackend")
		os.Exit(1)
	}

	// Determine OpenResty Service name for Ingress status updates
	openrestySvcNN := types.NamespacedName{
		Name:      openrestyServiceName,
		Namespace: openrestyServiceNamespace,
	}
	if openrestySvcNN.Name == "" {
		// Auto-detect: use Helm release naming convention
		openrestySvcNN.Name = fmt.Sprintf("%s-openresty", os.Getenv("CONTROLLER_NAME"))
		if openrestySvcNN.Name == "-openresty" || openrestySvcNN.Name == "" {
			// Fallback: list services in namespace matching the component label
			openrestySvcNN.Name = "wslproxy-ingress-wslproxy-ingress-controller-openresty"
		}
	}

	// Setup Ingress reconciler (watches networking.k8s.io/v1 Ingress)
	if err = (&controller.IngressReconciler{
		Client:               mgr.GetClient(),
		Scheme:               mgr.GetScheme(),
		Recorder:             mgr.GetEventRecorderFor("wslproxy-ingress-controller"),
		IngressClass:         ingressClass,
		LuaConfigUpdater:     configUpdater,
		OpenRestyServiceName: openrestySvcNN,
	}).SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "Ingress")
		os.Exit(1)
	}

	// Add health and ready checks
	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up health check")
		os.Exit(1)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up ready check")
		os.Exit(1)
	}

	setupLog.Info("starting manager",
		"version", "v1.1.0",
		"openresty-api-url", openrestyAPIURL,
		"ingress-class", ingressClass,
		"openresty-service", openrestySvcNN.String(),
		"leader-election", enableLeaderElection,
	)

	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}

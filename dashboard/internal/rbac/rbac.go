package rbac

import (
	"net/http"

	"github.com/bwalia/wslproxy/dashboard/internal/auth"
)

// Role constants.
const (
	RoleViewer   = "viewer"
	RoleOperator = "operator"
	RoleAdmin    = "admin"
)

// Action represents a permission.
type Action string

// Defined actions.
const (
	ActionViewConfig     Action = "config:view"
	ActionEditConfig     Action = "config:edit"
	ActionApplyConfig    Action = "config:apply"
	ActionViewMetrics    Action = "metrics:view"
	ActionViewLogs       Action = "logs:view"
	ActionManageIngress  Action = "ingress:manage"
	ActionApproveChanges Action = "changes:approve"
	ActionManageUsers    Action = "users:manage"
)

// permissions maps each role to the set of actions it may perform.
var permissions = map[string]map[Action]bool{
	RoleViewer: {
		ActionViewConfig:  true,
		ActionViewMetrics: true,
		ActionViewLogs:    true,
	},
	RoleOperator: {
		ActionViewConfig:    true,
		ActionEditConfig:    true,
		ActionApplyConfig:   true,
		ActionViewMetrics:   true,
		ActionViewLogs:      true,
		ActionManageIngress: true,
	},
	RoleAdmin: {
		ActionViewConfig:     true,
		ActionEditConfig:     true,
		ActionApplyConfig:    true,
		ActionViewMetrics:    true,
		ActionViewLogs:       true,
		ActionManageIngress:  true,
		ActionApproveChanges: true,
		ActionManageUsers:    true,
	},
}

// Can checks if a user has permission for an action.
func Can(user *auth.User, action Action) bool {
	if user == nil {
		return false
	}
	perms, ok := permissions[user.Role]
	if !ok {
		return false
	}
	return perms[action]
}

// RequireRole returns HTTP middleware that enforces a minimum role level.
func RequireRole(minRole string) func(http.Handler) http.Handler {
	minLevel := roleLevel(minRole)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := auth.UserFromContext(r.Context())
			if !ok || roleLevel(user.Role) < minLevel {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// roleLevel returns a numeric level for comparison.
func roleLevel(role string) int {
	switch role {
	case RoleViewer:
		return 1
	case RoleOperator:
		return 2
	case RoleAdmin:
		return 3
	default:
		return 0
	}
}

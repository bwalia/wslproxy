package rbac

import (
	"testing"

	"github.com/bwalia/wslproxy/dashboard/internal/auth"
)

func TestCanViewerPermissions(t *testing.T) {
	user := &auth.User{ID: "1", Username: "v", Role: RoleViewer}

	allowed := []Action{ActionViewConfig, ActionViewMetrics, ActionViewLogs}
	for _, a := range allowed {
		if !Can(user, a) {
			t.Errorf("viewer should be allowed %s", a)
		}
	}

	denied := []Action{ActionEditConfig, ActionApplyConfig, ActionManageIngress, ActionApproveChanges, ActionManageUsers}
	for _, a := range denied {
		if Can(user, a) {
			t.Errorf("viewer should NOT be allowed %s", a)
		}
	}
}

func TestCanOperatorPermissions(t *testing.T) {
	user := &auth.User{ID: "2", Username: "o", Role: RoleOperator}

	allowed := []Action{ActionViewConfig, ActionEditConfig, ActionApplyConfig, ActionViewMetrics, ActionViewLogs, ActionManageIngress}
	for _, a := range allowed {
		if !Can(user, a) {
			t.Errorf("operator should be allowed %s", a)
		}
	}

	denied := []Action{ActionApproveChanges, ActionManageUsers}
	for _, a := range denied {
		if Can(user, a) {
			t.Errorf("operator should NOT be allowed %s", a)
		}
	}
}

func TestCanAdminPermissions(t *testing.T) {
	user := &auth.User{ID: "3", Username: "a", Role: RoleAdmin}

	all := []Action{
		ActionViewConfig, ActionEditConfig, ActionApplyConfig,
		ActionViewMetrics, ActionViewLogs, ActionManageIngress,
		ActionApproveChanges, ActionManageUsers,
	}
	for _, a := range all {
		if !Can(user, a) {
			t.Errorf("admin should be allowed %s", a)
		}
	}

	// nil user
	if Can(nil, ActionViewConfig) {
		t.Error("nil user should not have any permissions")
	}
}

func TestRoleLevel(t *testing.T) {
	cases := []struct {
		role  string
		level int
	}{
		{RoleViewer, 1},
		{RoleOperator, 2},
		{RoleAdmin, 3},
		{"unknown", 0},
		{"", 0},
	}
	for _, tc := range cases {
		if got := roleLevel(tc.role); got != tc.level {
			t.Errorf("roleLevel(%q) = %d, want %d", tc.role, got, tc.level)
		}
	}
}

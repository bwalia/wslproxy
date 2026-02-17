package workflows

import (
	"testing"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

func TestCreateRequest(t *testing.T) {
	e := NewEngine()
	cr, err := e.CreateRequest("Test Change", "A test description", "validate_config", map[string]interface{}{"key": "value"}, "admin")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cr.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if cr.Status != StatusPending {
		t.Fatalf("expected status pending, got %s", cr.Status)
	}
	if cr.Title != "Test Change" {
		t.Fatalf("expected title 'Test Change', got %s", cr.Title)
	}
	if cr.CreatedBy != "admin" {
		t.Fatalf("expected created_by 'admin', got %s", cr.CreatedBy)
	}

	got, ok := e.GetRequest(cr.ID)
	if !ok {
		t.Fatal("expected to find request by ID")
	}
	if got.ID != cr.ID {
		t.Fatalf("expected ID %s, got %s", cr.ID, got.ID)
	}
}

func TestApproveRequest(t *testing.T) {
	e := NewEngine()
	cr, _ := e.CreateRequest("Approve Test", "desc", "tool", nil, "user1")

	if err := e.Approve(cr.ID, "reviewer", "looks good"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, _ := e.GetRequest(cr.ID)
	if got.Status != StatusApproved {
		t.Fatalf("expected approved, got %s", got.Status)
	}
	if got.ApprovedBy != "reviewer" {
		t.Fatalf("expected approvedBy 'reviewer', got %s", got.ApprovedBy)
	}
	if got.ApprovedAt == nil {
		t.Fatal("expected ApprovedAt to be set")
	}

	// Cannot approve again
	if err := e.Approve(cr.ID, "reviewer2", "again"); err == nil {
		t.Fatal("expected error approving non-pending request")
	}
}

func TestRejectRequest(t *testing.T) {
	e := NewEngine()
	cr, _ := e.CreateRequest("Reject Test", "desc", "tool", nil, "user1")

	if err := e.Reject(cr.ID, "reviewer", "not safe"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, _ := e.GetRequest(cr.ID)
	if got.Status != StatusRejected {
		t.Fatalf("expected rejected, got %s", got.Status)
	}
	if got.Reason != "not safe" {
		t.Fatalf("expected reason 'not safe', got %s", got.Reason)
	}
}

func TestReadOnlyMode(t *testing.T) {
	e := NewEngine()
	e.SetReadOnly(true)

	if !e.IsReadOnly() {
		t.Fatal("expected read-only to be true")
	}

	_, err := e.CreateRequest("Should Fail", "desc", "tool", nil, "user1")
	if err == nil {
		t.Fatal("expected error in read-only mode")
	}

	e.SetReadOnly(false)
	cr, err := e.CreateRequest("Should Succeed", "desc", "tool", nil, "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cr == nil {
		t.Fatal("expected non-nil change request")
	}
}

func TestDryRunResult(t *testing.T) {
	e := NewEngine()
	cr, _ := e.CreateRequest("Dry Run Test", "desc", "tool", nil, "user1")

	result := &mcp.ToolResult{
		Success: true,
		Output:  map[string]interface{}{"status": "valid"},
	}
	if err := e.SetDryRunResult(cr.ID, result); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got, _ := e.GetRequest(cr.ID)
	if got.DryRunResult == nil {
		t.Fatal("expected dry-run result to be set")
	}
	if !got.DryRunResult.Success {
		t.Fatal("expected dry-run to be successful")
	}

	// Cannot set on non-existent request
	if err := e.SetDryRunResult("nonexistent", result); err == nil {
		t.Fatal("expected error for non-existent request")
	}
}

func TestAuditLog(t *testing.T) {
	e := NewEngine()
	_, _ = e.CreateRequest("Audit Test", "desc", "tool", nil, "user1")

	log := e.GetAuditLog()
	if len(log) == 0 {
		t.Fatal("expected audit log entries")
	}
	if log[0].Who != "user1" {
		t.Fatalf("expected who 'user1', got %s", log[0].Who)
	}
	if log[0].What != "create_request" {
		t.Fatalf("expected what 'create_request', got %s", log[0].What)
	}
	if log[0].RequestID == "" {
		t.Fatal("expected request ID in audit entry")
	}
}

func TestFullWorkflow(t *testing.T) {
	e := NewEngine()

	// Create
	cr, err := e.CreateRequest("Full Workflow", "end-to-end test", "deploy", map[string]interface{}{"target": "prod"}, "dev")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if cr.Status != StatusPending {
		t.Fatalf("expected pending, got %s", cr.Status)
	}

	// Dry-run
	dryResult := &mcp.ToolResult{Success: true, Output: map[string]interface{}{"preview": "ok"}}
	if err := e.SetDryRunResult(cr.ID, dryResult); err != nil {
		t.Fatalf("dry-run: %v", err)
	}

	// Approve
	if err := e.Approve(cr.ID, "lead", "approved for deployment"); err != nil {
		t.Fatalf("approve: %v", err)
	}
	got, _ := e.GetRequest(cr.ID)
	if got.Status != StatusApproved {
		t.Fatalf("expected approved, got %s", got.Status)
	}

	// Apply
	applyResult := &mcp.ToolResult{Success: true, Output: map[string]interface{}{"deployed": true}}
	if err := e.MarkApplied(cr.ID, applyResult); err != nil {
		t.Fatalf("apply: %v", err)
	}
	got, _ = e.GetRequest(cr.ID)
	if got.Status != StatusApplied {
		t.Fatalf("expected applied, got %s", got.Status)
	}
	if got.AppliedAt == nil {
		t.Fatal("expected AppliedAt to be set")
	}
	if got.ApplyResult == nil || !got.ApplyResult.Success {
		t.Fatal("expected successful apply result")
	}

	// Verify audit log
	log := e.GetAuditLog()
	if len(log) < 4 {
		t.Fatalf("expected at least 4 audit entries, got %d", len(log))
	}

	// Verify all requests listed
	all := e.ListRequests()
	if len(all) != 1 {
		t.Fatalf("expected 1 request, got %d", len(all))
	}
}

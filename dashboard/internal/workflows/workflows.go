package workflows

import (
	"fmt"
	"sync"
	"time"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

// Status represents the state of a change request.
type Status string

const (
	StatusPending  Status = "pending"
	StatusApproved Status = "approved"
	StatusRejected Status = "rejected"
	StatusApplied  Status = "applied"
	StatusFailed   Status = "failed"
)

// ChangeRequest represents a proposed configuration change.
type ChangeRequest struct {
	ID           string                 `json:"id"`
	Title        string                 `json:"title"`
	Description  string                 `json:"description"`
	ToolName     string                 `json:"tool_name"`
	Input        map[string]interface{} `json:"input"`
	DryRunResult *mcp.ToolResult        `json:"dry_run_result,omitempty"`
	Status       Status                 `json:"status"`
	CreatedBy    string                 `json:"created_by"`
	CreatedAt    time.Time              `json:"created_at"`
	ApprovedBy   string                 `json:"approved_by,omitempty"`
	ApprovedAt   *time.Time             `json:"approved_at,omitempty"`
	AppliedAt    *time.Time             `json:"applied_at,omitempty"`
	ApplyResult  *mcp.ToolResult        `json:"apply_result,omitempty"`
	Reason       string                 `json:"reason,omitempty"`
}

// AuditEntry records an action in the audit log.
type AuditEntry struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Who       string    `json:"who"`
	What      string    `json:"what"`
	Details   string    `json:"details,omitempty"`
	RequestID string    `json:"request_id,omitempty"`
}

// Engine manages change requests and audit logging.
type Engine struct {
	mu       sync.RWMutex
	requests map[string]*ChangeRequest
	audit    []AuditEntry
	readOnly bool
}

// NewEngine creates a new workflow engine.
func NewEngine() *Engine {
	return &Engine{
		requests: make(map[string]*ChangeRequest),
	}
}

// SetReadOnly toggles read-only mode.
func (e *Engine) SetReadOnly(readOnly bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.readOnly = readOnly
}

// IsReadOnly returns current read-only state.
func (e *Engine) IsReadOnly() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.readOnly
}

// CreateRequest creates a new change request (returns error if read-only).
func (e *Engine) CreateRequest(title, description, toolName string, input map[string]interface{}, createdBy string) (*ChangeRequest, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.readOnly {
		return nil, fmt.Errorf("workflows: engine is in read-only mode")
	}

	cr := &ChangeRequest{
		ID:          fmt.Sprintf("cr-%d", time.Now().UnixNano()),
		Title:       title,
		Description: description,
		ToolName:    toolName,
		Input:       input,
		Status:      StatusPending,
		CreatedBy:   createdBy,
		CreatedAt:   time.Now(),
	}
	e.requests[cr.ID] = cr
	e.addAudit(createdBy, "create_request", fmt.Sprintf("Created change request: %s", title), cr.ID)
	return cr, nil
}

// GetRequest returns a change request by ID.
func (e *Engine) GetRequest(id string) (*ChangeRequest, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	cr, ok := e.requests[id]
	return cr, ok
}

// ListRequests returns all change requests.
func (e *Engine) ListRequests() []*ChangeRequest {
	e.mu.RLock()
	defer e.mu.RUnlock()
	result := make([]*ChangeRequest, 0, len(e.requests))
	for _, cr := range e.requests {
		result = append(result, cr)
	}
	return result
}

// SetDryRunResult stores the dry-run result on a pending request.
func (e *Engine) SetDryRunResult(id string, result *mcp.ToolResult) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cr, ok := e.requests[id]
	if !ok {
		return fmt.Errorf("workflows: request %q not found", id)
	}
	if cr.Status != StatusPending {
		return fmt.Errorf("workflows: request %q is not pending (status: %s)", id, cr.Status)
	}
	cr.DryRunResult = result
	e.addAudit("system", "dry_run", fmt.Sprintf("Dry-run completed for request %s", id), id)
	return nil
}

// Approve approves a pending request.
func (e *Engine) Approve(id, approvedBy, reason string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cr, ok := e.requests[id]
	if !ok {
		return fmt.Errorf("workflows: request %q not found", id)
	}
	if cr.Status != StatusPending {
		return fmt.Errorf("workflows: request %q is not pending (status: %s)", id, cr.Status)
	}
	now := time.Now()
	cr.Status = StatusApproved
	cr.ApprovedBy = approvedBy
	cr.ApprovedAt = &now
	cr.Reason = reason
	e.addAudit(approvedBy, "approve", fmt.Sprintf("Approved request %s: %s", id, reason), id)
	return nil
}

// Reject rejects a pending request.
func (e *Engine) Reject(id, rejectedBy, reason string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cr, ok := e.requests[id]
	if !ok {
		return fmt.Errorf("workflows: request %q not found", id)
	}
	if cr.Status != StatusPending {
		return fmt.Errorf("workflows: request %q is not pending (status: %s)", id, cr.Status)
	}
	cr.Status = StatusRejected
	cr.Reason = reason
	e.addAudit(rejectedBy, "reject", fmt.Sprintf("Rejected request %s: %s", id, reason), id)
	return nil
}

// MarkApplied marks a request as applied.
func (e *Engine) MarkApplied(id string, result *mcp.ToolResult) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cr, ok := e.requests[id]
	if !ok {
		return fmt.Errorf("workflows: request %q not found", id)
	}
	if cr.Status != StatusApproved {
		return fmt.Errorf("workflows: request %q is not approved (status: %s)", id, cr.Status)
	}
	now := time.Now()
	cr.Status = StatusApplied
	cr.AppliedAt = &now
	cr.ApplyResult = result
	e.addAudit("system", "apply", fmt.Sprintf("Applied request %s", id), id)
	return nil
}

// MarkFailed marks a request as failed.
func (e *Engine) MarkFailed(id string, reason string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cr, ok := e.requests[id]
	if !ok {
		return fmt.Errorf("workflows: request %q not found", id)
	}
	if cr.Status != StatusApproved {
		return fmt.Errorf("workflows: request %q is not approved (status: %s)", id, cr.Status)
	}
	cr.Status = StatusFailed
	cr.Reason = reason
	e.addAudit("system", "fail", fmt.Sprintf("Request %s failed: %s", id, reason), id)
	return nil
}

// GetAuditLog returns the audit log.
func (e *Engine) GetAuditLog() []AuditEntry {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]AuditEntry, len(e.audit))
	copy(out, e.audit)
	return out
}

// addAudit adds an audit entry (caller must hold e.mu).
func (e *Engine) addAudit(who, what, details, requestID string) {
	e.audit = append(e.audit, AuditEntry{
		ID:        fmt.Sprintf("audit-%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Who:       who,
		What:      what,
		Details:   details,
		RequestID: requestID,
	})
}

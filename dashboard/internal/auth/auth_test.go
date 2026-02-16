package auth

import (
	"context"
	"testing"
	"time"
)

func TestAddUser(t *testing.T) {
	s := NewStore()

	if err := s.AddUser("alice", "pass123", "admin"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// duplicate should fail
	if err := s.AddUser("alice", "other", "viewer"); err != ErrUserExists {
		t.Fatalf("expected ErrUserExists, got %v", err)
	}
}

func TestAuthenticate(t *testing.T) {
	s := NewStore()
	s.AddUser("bob", "secret", "operator")

	sess, err := s.Authenticate("bob", "secret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sess.User.Username != "bob" {
		t.Fatalf("expected username bob, got %s", sess.User.Username)
	}
	if sess.User.Role != "operator" {
		t.Fatalf("expected role operator, got %s", sess.User.Role)
	}
	if len(sess.Token) != 64 { // 32 bytes = 64 hex chars
		t.Fatalf("expected 64-char token, got %d", len(sess.Token))
	}
	if sess.ExpiresAt.Before(time.Now().Add(23 * time.Hour)) {
		t.Fatal("session expires too soon")
	}
}

func TestAuthenticateInvalidPassword(t *testing.T) {
	s := NewStore()
	s.AddUser("carol", "correct", "viewer")

	if _, err := s.Authenticate("carol", "wrong"); err != ErrInvalidCreds {
		t.Fatalf("expected ErrInvalidCreds, got %v", err)
	}

	if _, err := s.Authenticate("nobody", "whatever"); err != ErrInvalidCreds {
		t.Fatalf("expected ErrInvalidCreds for unknown user, got %v", err)
	}
}

func TestValidateSession(t *testing.T) {
	s := NewStore()
	s.AddUser("dave", "pw", "admin")

	sess, _ := s.Authenticate("dave", "pw")

	got, err := s.ValidateSession(sess.Token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.User.Username != "dave" {
		t.Fatalf("expected dave, got %s", got.User.Username)
	}

	// unknown token
	if _, err := s.ValidateSession("badtoken"); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestLogout(t *testing.T) {
	s := NewStore()
	s.AddUser("eve", "pw", "viewer")

	sess, _ := s.Authenticate("eve", "pw")
	s.Logout(sess.Token)

	if _, err := s.ValidateSession(sess.Token); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound after logout, got %v", err)
	}
}

func TestCleanExpired(t *testing.T) {
	s := NewStore()
	s.AddUser("frank", "pw", "admin")

	sess, _ := s.Authenticate("frank", "pw")

	// manually expire the session
	s.mu.Lock()
	s.sessions[sess.Token].ExpiresAt = time.Now().Add(-1 * time.Hour)
	s.mu.Unlock()

	s.CleanExpired()

	if _, err := s.ValidateSession(sess.Token); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound after cleanup, got %v", err)
	}
}

func TestContextUser(t *testing.T) {
	user := &User{ID: "1", Username: "test", Role: "admin"}
	ctx := ContextWithUser(context.Background(), user)

	got, ok := UserFromContext(ctx)
	if !ok {
		t.Fatal("expected user in context")
	}
	if got.Username != "test" {
		t.Fatalf("expected test, got %s", got.Username)
	}

	// empty context
	_, ok = UserFromContext(context.Background())
	if ok {
		t.Fatal("expected no user in empty context")
	}
}

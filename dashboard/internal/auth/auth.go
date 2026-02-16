package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"sync"
	"time"
)

// User represents an authenticated user.
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"` // "viewer", "operator", "admin"
}

// Session represents an active user session.
type Session struct {
	Token     string    `json:"token"`
	User      User      `json:"user"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Store manages users and sessions.
type Store struct {
	mu       sync.RWMutex
	users    map[string]userRecord // username -> record
	sessions map[string]*Session   // token -> session
}

type userRecord struct {
	User         User
	PasswordHash string
}

// Errors returned by Store methods.
var (
	ErrUserExists      = errors.New("user already exists")
	ErrInvalidCreds    = errors.New("invalid credentials")
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionExpired  = errors.New("session expired")
)

// SessionDuration is how long a session stays valid.
const SessionDuration = 24 * time.Hour

// CookieName is the HTTP cookie used for session tokens.
const CookieName = "session_token"

// NewStore creates a new auth store.
func NewStore() *Store {
	return &Store{
		users:    make(map[string]userRecord),
		sessions: make(map[string]*Session),
	}
}

// AddUser adds a user with a password (token).
func (s *Store) AddUser(username, password, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[username]; exists {
		return ErrUserExists
	}

	s.users[username] = userRecord{
		User: User{
			ID:       generateID(),
			Username: username,
			Role:     role,
		},
		PasswordHash: hashPassword(password),
	}
	return nil
}

// Authenticate validates credentials and creates a session.
func (s *Store) Authenticate(username, password string) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rec, exists := s.users[username]
	if !exists {
		return nil, ErrInvalidCreds
	}

	hashed := hashPassword(password)
	if subtle.ConstantTimeCompare([]byte(rec.PasswordHash), []byte(hashed)) != 1 {
		return nil, ErrInvalidCreds
	}

	token, err := generateToken()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	sess := &Session{
		Token:     token,
		User:      rec.User,
		CreatedAt: now,
		ExpiresAt: now.Add(SessionDuration),
	}
	s.sessions[token] = sess
	return sess, nil
}

// ValidateSession checks if a session token is valid.
func (s *Store) ValidateSession(token string) (*Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sess, exists := s.sessions[token]
	if !exists {
		return nil, ErrSessionNotFound
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, ErrSessionExpired
	}
	return sess, nil
}

// Logout invalidates a session.
func (s *Store) Logout(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
}

// CleanExpired removes expired sessions.
func (s *Store) CleanExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for token, sess := range s.sessions {
		if now.After(sess.ExpiresAt) {
			delete(s.sessions, token)
		}
	}
}

// generateID creates a random hex ID for a user.
func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// generateToken creates a secure random 32-byte hex token.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashPassword creates a SHA-256 hex digest of the password.
func hashPassword(password string) string {
	h := sha256.Sum256([]byte(password))
	return hex.EncodeToString(h[:])
}

// Context helpers

type contextKey string

const userContextKey contextKey = "user"

// UserFromContext extracts the authenticated user from a request context.
func UserFromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(userContextKey).(*User)
	return u, ok
}

// ContextWithUser returns a new context carrying the given user.
func ContextWithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

// compile-time check that we use net/http (middleware lives in middleware.go)
var _ http.Handler = http.NotFoundHandler()

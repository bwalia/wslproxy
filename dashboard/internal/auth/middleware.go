package auth

import (
	"net/http"
	"strings"
)

// Middleware returns HTTP middleware that validates session tokens from cookies.
// Browser requests (Accept: text/html) are redirected to /login on failure.
// API requests receive a 401 status.
func Middleware(store *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(CookieName)
			if err != nil {
				deny(w, r)
				return
			}

			sess, err := store.ValidateSession(cookie.Value)
			if err != nil {
				deny(w, r)
				return
			}

			ctx := ContextWithUser(r.Context(), &sess.User)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// deny rejects the request: redirect for browsers, 401 for API clients.
func deny(w http.ResponseWriter, r *http.Request) {
	if isBrowserRequest(r) {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}

func isBrowserRequest(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "text/html")
}

package api

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
)

var apiKeys map[string]struct{}

func init() {
	apiKeys = make(map[string]struct{})
	keys := os.Getenv("DTBUILD_API_KEYS")
	if keys == "" {
		slog.Warn("no API keys configured (DTBUILD_API_KEYS env) — auth disabled")
		return
	}
	for _, k := range strings.Split(keys, ",") {
		k = strings.TrimSpace(k)
		if k != "" {
			apiKeys[k] = struct{}{}
		}
	}
	slog.Info("api key auth enabled", "keys", len(apiKeys))
}

// authMiddleware checks API keys. If no keys are configured, it's a no-op.
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health and metrics
		if r.URL.Path == "/healthz" || r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		// Skip auth for UI assets
		if r.URL.Path == "/" || strings.HasPrefix(r.URL.Path, "/ui") {
			next.ServeHTTP(w, r)
			return
		}
		// If no keys configured, allow all
		if len(apiKeys) == 0 {
			next.ServeHTTP(w, r)
			return
		}

		key := r.Header.Get("X-Api-Key")
		if key == "" {
			// Try Bearer token
			auth := r.Header.Get("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				key = strings.TrimPrefix(auth, "Bearer ")
			}
		}

		if _, ok := apiKeys[key]; !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"unauthorized"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}

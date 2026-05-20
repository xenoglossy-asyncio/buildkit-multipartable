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

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always allow: health, metrics, stats, UI, admin, blobs
		path := r.URL.Path
		if path == "/healthz" || path == "/metrics" || path == "/" ||
			strings.HasPrefix(path, "/ui") ||
			strings.HasPrefix(path, "/api/v1/admin") ||
			strings.HasPrefix(path, "/api/v1/blobs") ||
			strings.HasPrefix(path, "/api/v1/stats") {
			next.ServeHTTP(w, r)
			return
		}

		// If no keys configured, allow all
		if len(apiKeys) == 0 {
			next.ServeHTTP(w, r)
			return
		}

		// Internal worker endpoints — skip auth (workers are trusted)
		if strings.Contains(path, "/workers/") ||
			strings.HasPrefix(path, "/api/v1/builds/next") {
			next.ServeHTTP(w, r)
			return
		}

		key := r.Header.Get("X-Api-Key")
		if key == "" {
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

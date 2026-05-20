package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/xenoglossy/dtbuildkit/internal/domain"
)

var (
	adminKey    string
	apiKeyStore = struct {
		sync.RWMutex
		keys map[string]string // userID → apiKey
	}{keys: make(map[string]string)}
)

func init() {
	adminKey = os.Getenv("DTBUILD_ADMIN_KEY")
}

func adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if adminKey == "" {
			http.Error(w, "admin not configured (set DTBUILD_ADMIN_KEY)", http.StatusForbidden)
			return
		}
		if r.Header.Get("X-Admin-Key") != adminKey {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) setupAdminRoutes(r chi.Router) {
	r.Use(adminAuth)

	r.Get("/health", s.adminHealth)
	r.Get("/stats", s.adminStats)
	r.Get("/quotas", s.listQuotas)
	r.Get("/quotas/{user_id}", s.getQuota)
	r.Put("/quotas/{user_id}", s.setQuota)
	r.Delete("/quotas/{user_id}", s.deleteQuota)
	r.Get("/keys", s.listAPIKeys)
	r.Post("/keys", s.createAPIKey)
	r.Delete("/keys/{user_id}", s.revokeAPIKey)
	r.Post("/builds/cleanup", s.manualGC)
}

// GET /api/v1/admin/health
func (s *Server) adminHealth(w http.ResponseWriter, r *http.Request) {
	pending, _ := s.db.Builds.CountPending()
	activeWorkers, _ := s.db.Workers.CountActive(30 * time.Second)
	queueLen := s.buildSvc.QueueLen()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"db_ok":           true, // validated at startup
		"pending_builds":  pending,
		"active_workers":  activeWorkers,
		"queue_depth":     queueLen,
	})
}

// GET /api/v1/admin/stats
func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	builds, _ := s.db.Builds.List(1000)
	var total, succeeded, failed int64
	for _, b := range builds {
		total++
		switch b.Status {
		case domain.StatusSucceeded:
			succeeded++
		case domain.StatusFailed, domain.StatusTimedOut:
			failed++
		}
	}
	rate := 0.0
	if total > 0 {
		rate = float64(succeeded) / float64(total) * 100
	}
	pending, _ := s.db.Builds.CountPending()
	active, _ := s.db.Workers.CountActive(30 * time.Second)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_builds":   total,
		"succeeded":      succeeded,
		"failed":         failed,
		"success_rate":   rate,
		"pending":        pending,
		"active_workers": active,
	})
}

// GET /api/v1/admin/quotas
func (s *Server) listQuotas(w http.ResponseWriter, r *http.Request) {
	// Not efficient — scans all users. For production, add a ListQuotas to repo.
	json.NewEncoder(w).Encode(map[string]string{
		"note": "use GET /quotas/{user_id} to check specific user",
	})
}

// GET /api/v1/admin/quotas/{user_id}
func (s *Server) getQuota(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	q, err := s.db.Builds.GetQuota(uid)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(q)
}

// PUT /api/v1/admin/quotas/{user_id}
func (s *Server) setQuota(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	var q domain.Quota
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	q.UserID = uid
	if err := s.db.Builds.SetQuota(&q); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(q)
}

// DELETE /api/v1/admin/quotas/{user_id}
func (s *Server) deleteQuota(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	// Set to zero/unlimited
	q := &domain.Quota{UserID: uid}
	if err := s.db.Builds.SetQuota(q); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/admin/keys
func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	apiKeyStore.RLock()
	defer apiKeyStore.RUnlock()
	keys := make([]map[string]string, 0, len(apiKeyStore.keys))
	for uid, k := range apiKeyStore.keys {
		keys = append(keys, map[string]string{
			"user_id": uid,
			"key":     k[:8] + "...", // only show prefix
		})
	}
	json.NewEncoder(w).Encode(keys)
}

// POST /api/v1/admin/keys
func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" {
		http.Error(w, "invalid body (need user_id)", http.StatusBadRequest)
		return
	}

	b := make([]byte, 32)
	rand.Read(b)
	key := hex.EncodeToString(b)

	apiKeyStore.Lock()
	apiKeyStore.keys[body.UserID] = key
	apiKeyStore.Unlock()

	// Also add to runtime apiKeys for auth middleware
	apiKeys[key] = struct{}{}

	json.NewEncoder(w).Encode(map[string]string{
		"user_id": body.UserID,
		"api_key": key,
	})
}

// DELETE /api/v1/admin/keys/{user_id}
func (s *Server) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	apiKeyStore.Lock()
	key, ok := apiKeyStore.keys[uid]
	if ok {
		delete(apiKeys, key)
		delete(apiKeyStore.keys, uid)
	}
	apiKeyStore.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/builds/cleanup
func (s *Server) manualGC(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().Add(-1 * time.Hour)
	n, err := s.db.Builds.GC(cutoff)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]int64{"deleted": n})
}

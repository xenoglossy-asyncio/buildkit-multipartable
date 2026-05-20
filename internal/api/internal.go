package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/xenoglossy/dtbuildkit/internal/domain"
)

// Key store and admin handlers moved here — no auth middleware.
// The FastAPI user service handles authentication.

var apiKeyStore = struct {
	sync.RWMutex
	keys map[string]string
}{keys: make(map[string]string)}

func (s *Server) publicStats(w http.ResponseWriter, r *http.Request) {
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
		"queue_depth":    s.buildSvc.QueueLen(),
	})
}

func (s *Server) adminHealth(w http.ResponseWriter, r *http.Request) {
	pending, _ := s.db.Builds.CountPending()
	active, _ := s.db.Workers.CountActive(30 * time.Second)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"db_ok":          true,
		"pending_builds": pending,
		"active_workers": active,
		"queue_depth":    s.buildSvc.QueueLen(),
	})
}

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

func (s *Server) getQuota(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	q, err := s.db.Builds.GetQuota(uid)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(q)
}

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
	json.NewEncoder(w).Encode(q)
}

func (s *Server) deleteQuota(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	s.db.Builds.SetQuota(&domain.Quota{UserID: uid})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	apiKeyStore.RLock()
	defer apiKeyStore.RUnlock()
	keys := make([]map[string]string, 0, len(apiKeyStore.keys))
	for uid, k := range apiKeyStore.keys {
		keys = append(keys, map[string]string{"user_id": uid, "key": k[:8] + "..."})
	}
	json.NewEncoder(w).Encode(keys)
}

func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	b := make([]byte, 32)
	rand.Read(b)
	key := hex.EncodeToString(b)
	apiKeyStore.Lock()
	apiKeyStore.keys[body.UserID] = key
	apiKeyStore.Unlock()
	json.NewEncoder(w).Encode(map[string]string{"user_id": body.UserID, "api_key": key})
}

func (s *Server) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	uid := chi.URLParam(r, "user_id")
	apiKeyStore.Lock()
	delete(apiKeyStore.keys, uid)
	apiKeyStore.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) manualGC(w http.ResponseWriter, r *http.Request) {
	n, err := s.db.Builds.GC(time.Now().Add(-1 * time.Hour))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]int64{"deleted": n})
}

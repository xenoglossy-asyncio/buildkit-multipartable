package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
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
	builds, err := s.db.Builds.List(1000)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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
	builds, err := s.db.Builds.List(1000)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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
		display := k
		if len(k) > 8 {
			display = k[:8] + "..."
		}
		keys = append(keys, map[string]string{"user_id": uid, "key": display})
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
	if _, err := rand.Read(b); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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

func (s *Server) userStats(w http.ResponseWriter, r *http.Request) {
	days := 30
	if d := r.URL.Query().Get("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	builds, err := s.db.Builds.List(5000)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)

	type ustat struct {
		UserID      string  `json:"user_id"`
		Count       int     `json:"count"`
		Succeded    int     `json:"succeeded"`
		Failed      int     `json:"failed"`
		AvgTime     float64 `json:"avg_time_sec"`
		CacheRate   float64 `json:"cache_rate"`
		SuccessRate float64 `json:"success_rate"`
	}
	users := make(map[string]*ustat)
	for _, b := range builds {
		if b.CreatedAt.Before(cutoff) {
			continue
		}
		uid := b.UserID
		if uid == "" || strings.Contains(uid, "{") {
			uid = "anonymous"
		}
		if _, ok := users[uid]; !ok {
			users[uid] = &ustat{UserID: uid}
		}
		u := users[uid]
		u.Count++
		if b.Status == domain.StatusSucceeded {
			u.Succeded++
			if b.CompletedAt != nil {
				d := b.CompletedAt.Sub(b.CreatedAt)
				if d > 0 && d < 2*time.Hour {
					u.AvgTime += d.Seconds()
				}
			}
		} else if b.Status == domain.StatusFailed || b.Status == domain.StatusTimedOut {
			u.Failed++
		}
	}
	result := make([]ustat, 0, len(users))
	for _, u := range users {
		if u.Succeded > 0 {
			u.AvgTime /= float64(u.Succeded)
		}
		if u.Count > 0 {
			u.SuccessRate = float64(u.Succeded) / float64(u.Count) * 100
		}
		// Simple cache rate: fraction of builds with above-median cache hits
		result = append(result, *u)
	}
	// Sort by count desc
	sort.Slice(result, func(i, j int) bool { return result[i].Count > result[j].Count })
	json.NewEncoder(w).Encode(result)
}

func (s *Server) runningBuilds(w http.ResponseWriter, r *http.Request) {
	builds, err := s.db.Builds.List(200)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	var running []map[string]interface{}
	for _, b := range builds {
		if b.Status == domain.StatusBuilding || b.Status == domain.StatusPending {
			elapsed := ""
			if b.Status == domain.StatusBuilding {
				elapsed = time.Since(b.UpdatedAt).Round(time.Second).String()
			}
			running = append(running, map[string]interface{}{
				"id":         b.ID,
				"image_tag":  b.ImageTag,
				"status":     b.Status,
				"elapsed":    elapsed,
				"user_id":    b.UserID,
				"created_at": b.CreatedAt,
			})
		}
	}
	json.NewEncoder(w).Encode(running)
}

func (s *Server) manualGC(w http.ResponseWriter, r *http.Request) {
	n, err := s.db.Builds.GC(time.Now().Add(-1 * time.Hour))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]int64{"deleted": n})
}

func (s *Server) dailyStats(w http.ResponseWriter, r *http.Request) {
	days := 14
	if d := r.URL.Query().Get("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	if days <= 0 {
		days = 14
	}
	if days > 365 {
		days = 365
	}
	builds, err := s.db.Builds.List(5000)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()
	today := now.Truncate(24 * time.Hour)
	counts := make([]int, days)
	succeeded := make([]int, days)
	failed := make([]int, days)
	labels := make([]string, days)
	for _, b := range builds {
		age := today.Sub(b.CreatedAt.Truncate(24 * time.Hour))
		day := int(age.Hours() / 24)
		if day >= 0 && day < days {
			idx := days - 1 - day
			counts[idx]++
			if b.Status == domain.StatusSucceeded {
				succeeded[idx]++
			} else if b.Status == domain.StatusFailed || b.Status == domain.StatusTimedOut {
				failed[idx]++
			}
		}
	}
	for i := 0; i < days; i++ {
		d := today.Add(-time.Duration(days-1-i) * 24 * time.Hour)
		labels[i] = d.Format("1/2")
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"days":      days,
		"counts":    counts,
		"succeeded": succeeded,
		"failed":    failed,
		"labels":    labels,
	})
}

func (s *Server) averageStats(w http.ResponseWriter, r *http.Request) {
	builds, err := s.db.Builds.List(2000)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	var totalTime time.Duration
	var timed int
	for _, b := range builds {
		if b.Status == domain.StatusSucceeded && b.CompletedAt != nil {
			d := b.CompletedAt.Sub(b.CreatedAt)
			if d > 0 && d < 2*time.Hour {
				totalTime += d
				timed++
			}
		}
	}
	avgSec := 0.0
	if timed > 0 {
		avgSec = totalTime.Seconds() / float64(timed)
	}

	// Use stored cache_hit_rate from DB (computed at build completion)
	var cacheRateSum float64
	var cacheCount int
	for _, b := range builds {
		if b.Status == domain.StatusSucceeded && b.CacheHitRate > 0 {
			cacheRateSum += b.CacheHitRate
			cacheCount++
		}
	}
	cacheRate := 0.0
	if cacheCount > 0 {
		cacheRate = cacheRateSum / float64(cacheCount)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"avg_build_sec":  avgSec,
		"cache_hit_rate": cacheRate,
	})
}

// Package quota provides per-user resource limits.
package quota

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/xenoglossy/dtbuildkit/internal/domain"
)

// Manager enforces per-user resource quotas.
type Manager struct {
	mu     sync.RWMutex
	quotas map[string]*domain.Quota // userID -> quota

	// Runtime counters
	concurrent map[string]int32       // userID -> current building count
	dailyCount map[string]int32       // userID -> builds today
	dailyReset map[string]int64       // userID -> unix day of last reset
	storageUse map[string]atomic.Int64 // userID -> context bytes used
}

// NewManager creates a quota manager with per-user limits.
func NewManager(defaults map[string]*domain.Quota) *Manager {
	m := &Manager{
		quotas:     defaults,
		concurrent: make(map[string]int32),
		dailyCount: make(map[string]int32),
		dailyReset: make(map[string]int64),
		storageUse: make(map[string]atomic.Int64),
	}
	if m.quotas == nil {
		m.quotas = make(map[string]*domain.Quota)
	}
	return m
}

// getQuota returns the quota for a user, or a default unlimited quota.
func (m *Manager) getQuota(userID string) *domain.Quota {
	m.mu.RLock()
	q, ok := m.quotas[userID]
	m.mu.RUnlock()
	if ok {
		return q
	}
	// Default: unlimited
	return &domain.Quota{UserID: userID}
}

// AllowBuild checks whether a user can submit a new build.
// Returns true and the effective timeout, or false and a reason string.
func (m *Manager) AllowBuild(userID string, requestedTimeout int) (bool, int, string) {
	q := m.getQuota(userID)

	// Check daily limit
	m.resetDailyIfNeeded(userID)
	m.mu.RLock()
	daily := m.dailyCount[userID]
	m.mu.RUnlock()
	if q.MaxDaily > 0 && int(daily) >= q.MaxDaily {
		return false, 0, "daily build limit reached"
	}

	// Effective timeout
	timeout := q.EffectiveTimeout(requestedTimeout)

	return true, timeout, ""
}

// ReserveConcurrent reserves a concurrent build slot. Returns false if at capacity.
func (m *Manager) ReserveConcurrent(userID string) bool {
	q := m.getQuota(userID)
	if q.MaxConcurrent <= 0 {
		return true // unlimited
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	current := m.concurrent[userID]
	if int(current) >= q.MaxConcurrent {
		return false
	}
	m.concurrent[userID] = current + 1
	return true
}

// ReleaseConcurrent releases a concurrent build slot.
func (m *Manager) ReleaseConcurrent(userID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.concurrent[userID] > 0 {
		m.concurrent[userID]--
	}
}

// RecordBuild increments daily and storage counters.
func (m *Manager) RecordBuild(userID string, contextBytes int64) {
	m.resetDailyIfNeeded(userID)
	m.mu.Lock()
	m.dailyCount[userID]++
	m.mu.Unlock()
	if contextBytes > 0 {
		s, _ := m.storageUse[userID]
		s.Add(contextBytes)
	}
}

// CheckStorage checks if the user has exceeded storage quota.
func (m *Manager) CheckStorage(userID string, additionalBytes int64) bool {
	q := m.getQuota(userID)
	if q.MaxStorageBytes <= 0 {
		return true // unlimited
	}
	s, _ := m.storageUse[userID]
	return s.Load()+additionalBytes <= q.MaxStorageBytes
}

// SetQuota updates the quota for a user.
func (m *Manager) SetQuota(q *domain.Quota) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.quotas[q.UserID] = q
}

func (m *Manager) resetDailyIfNeeded(userID string) {
	today := time.Now().UTC().Truncate(24 * time.Hour).Unix()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dailyReset[userID] != today {
		m.dailyCount[userID] = 0
		m.dailyReset[userID] = today
	}
}

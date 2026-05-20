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
	storageUse map[string]*atomic.Int64 // userID -> context bytes used
}

// NewManager creates a quota manager with per-user limits.
func NewManager(defaults map[string]*domain.Quota) *Manager {
	m := &Manager{
		quotas:     defaults,
		concurrent: make(map[string]int32),
		dailyCount: make(map[string]int32),
		dailyReset: make(map[string]int64),
		storageUse: make(map[string]*atomic.Int64),
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

	// Check daily limit under a single lock hold to avoid TOCTOU
	m.mu.Lock()
	m.resetDailyIfNeededLocked(userID)
	daily := m.dailyCount[userID]
	m.mu.Unlock()
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
	m.mu.Lock()
	m.resetDailyIfNeededLocked(userID)
	m.dailyCount[userID]++
	if contextBytes > 0 {
		if _, ok := m.storageUse[userID]; !ok {
			m.storageUse[userID] = new(atomic.Int64)
		}
		m.storageUse[userID].Add(contextBytes)
	}
	m.mu.Unlock()
}

// CheckStorage checks if the user has exceeded storage quota.
func (m *Manager) CheckStorage(userID string, additionalBytes int64) bool {
	q := m.getQuota(userID)
	if q.MaxStorageBytes <= 0 {
		return true // unlimited
	}
	m.mu.RLock()
	v, ok := m.storageUse[userID]
	var used int64
	if ok {
		used = v.Load()
	}
	m.mu.RUnlock()
	return used+additionalBytes <= q.MaxStorageBytes
}

// SetQuota updates the quota for a user.
func (m *Manager) SetQuota(q *domain.Quota) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.quotas[q.UserID] = q
}

func (m *Manager) resetDailyIfNeeded(userID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resetDailyIfNeededLocked(userID)
}

// resetDailyIfNeededLocked resets daily counter if the day has changed.
// Caller must hold m.mu write lock.
func (m *Manager) resetDailyIfNeededLocked(userID string) {
	today := time.Now().UTC().Truncate(24 * time.Hour).Unix()
	if m.dailyReset[userID] != today {
		m.dailyCount[userID] = 0
		m.dailyReset[userID] = today
	}
}

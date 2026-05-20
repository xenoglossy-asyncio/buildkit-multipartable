package quota

import (
	"testing"

	"github.com/xenoglossy/dtbuildkit/internal/domain"
)

func TestAllowUnlimited(t *testing.T) {
	m := NewManager(nil)
	ok, timeout, reason := m.AllowBuild("user1", 300)
	if !ok {
		t.Fatalf("unlimited should allow: %s", reason)
	}
	if timeout != 300 {
		t.Fatalf("timeout should be 300, got %d", timeout)
	}
}

func TestConcurrentLimit(t *testing.T) {
	q := &domain.Quota{UserID: "user1", MaxConcurrent: 2}
	m := NewManager(map[string]*domain.Quota{"user1": q})

	if !m.ReserveConcurrent("user1") {
		t.Fatal("reserve 1 failed")
	}
	if !m.ReserveConcurrent("user1") {
		t.Fatal("reserve 2 failed")
	}
	if m.ReserveConcurrent("user1") {
		t.Fatal("reserve 3 should fail (limit)")
	}

	m.ReleaseConcurrent("user1")
	if !m.ReserveConcurrent("user1") {
		t.Fatal("after release, reserve should succeed")
	}
}

func TestDailyLimit(t *testing.T) {
	q := &domain.Quota{UserID: "user1", MaxDaily: 2}
	m := NewManager(map[string]*domain.Quota{"user1": q})

	ok, _, _ := m.AllowBuild("user1", 600)
	if !ok {
		t.Fatal("first should allow")
	}
	m.RecordBuild("user1", 0)

	ok, _, _ = m.AllowBuild("user1", 600)
	if !ok {
		t.Fatal("second should allow")
	}
	m.RecordBuild("user1", 0)

	ok, _, reason := m.AllowBuild("user1", 600)
	if ok {
		t.Fatalf("third should be denied, got ok")
	}
	if reason == "" {
		t.Fatal("should have reason")
	}
}

func TestEffectiveTimeout(t *testing.T) {
	q := &domain.Quota{UserID: "user1", MaxTimeoutSec: 300}
	m := NewManager(map[string]*domain.Quota{"user1": q})

	ok, timeout, _ := m.AllowBuild("user1", 900)
	if !ok {
		t.Fatal("should allow")
	}
	if timeout != 300 {
		t.Fatalf("timeout capped to 300, got %d", timeout)
	}
}

func TestStorageLimit(t *testing.T) {
	q := &domain.Quota{UserID: "user1", MaxStorageBytes: 100}
	m := NewManager(map[string]*domain.Quota{"user1": q})

	if !m.CheckStorage("user1", 50) {
		t.Fatal("50 should allow")
	}
	m.RecordBuild("user1", 50)
	if m.CheckStorage("user1", 60) {
		t.Fatal("60 should deny (50+60 > 100)")
	}
}

func TestSetQuota(t *testing.T) {
	m := NewManager(nil)
	q := &domain.Quota{UserID: "user1", MaxConcurrent: 1}
	m.SetQuota(q)

	if !m.ReserveConcurrent("user1") {
		t.Fatal("should allow after set")
	}
	if m.ReserveConcurrent("user1") {
		t.Fatal("should deny second")
	}
}

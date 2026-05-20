package api

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/xenoglossy/dtbuildkit/internal/fingerprint"
	"github.com/xenoglossy/dtbuildkit/internal/store"
)

// POST /api/v1/builds/bulk
// Accepts a tar.gz of a root directory. Walks all subdirectories,
// finds Dockerfiles, and creates one Build per Dockerfile found.
// Each subdirectory context is stored as a separate tar.gz in the blob store.
func (s *Server) submitBulkBuild(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(500 << 20); err != nil { // 500MB
		http.Error(w, "failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	contextFile, _, err := r.FormFile("context")
	if err != nil {
		http.Error(w, "missing context file", http.StatusBadRequest)
		return
	}
	defer contextFile.Close()

	tagPrefix := r.FormValue("tag_prefix")
	if tagPrefix == "" {
		tagPrefix = r.FormValue("tag")
	}
	if tagPrefix == "" {
		http.Error(w, "missing tag_prefix", http.StatusBadRequest)
		return
	}
	// Ensure prefix ends with / or -
	if !strings.HasSuffix(tagPrefix, "/") && !strings.HasSuffix(tagPrefix, "-") && !strings.HasSuffix(tagPrefix, ":") {
		tagPrefix += "/"
	}

	// Discover Dockerfiles in the tar.gz
	subdirs, err := discoverDockerfiles(contextFile)
	if err != nil {
		http.Error(w, "failed to process archive: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if len(subdirs) == 0 {
		http.Error(w, "no Dockerfiles found in archive", http.StatusBadRequest)
		return
	}

	// Re-read the file for per-subdirectory extraction
	// (need a new reader since we consumed the first one)
	contextFile.Seek(0, io.SeekStart)

	var builds []*store.Build
	for _, sd := range subdirs {
		subTar, err := extractSubdirTar(contextFile, sd)
		if err != nil {
			slog.Warn("failed to extract subdir", "dir", sd.Path, "error", err)
			continue
		}
		contextFile.Seek(0, io.SeekStart)

		buildID := uuid.New().String()
		contextKey := fmt.Sprintf("contexts/%s.tar.gz", buildID)

		if _, err := s.blobs.Put(contextKey, bytes.NewReader(subTar)); err != nil {
			slog.Warn("failed to store subdir context", "dir", sd.Path, "error", err)
			continue
		}

		fp := fingerprint.FromDockerfile(sd.DockerfileContent)
		tag := tagPrefix + strings.ReplaceAll(strings.TrimPrefix(sd.Path, "/"), "/", "-")

		b := &store.Build{
			ID:          buildID,
			Status:      store.StatusPending,
			Fingerprint: fp.Hash,
			ContextKey:  contextKey,
			Dockerfile:  sd.DockerfileName,
			ImageTag:    tag,
		}
		builds = append(builds, b)
	}

	if len(builds) == 0 {
		http.Error(w, "failed to create any builds", http.StatusInternalServerError)
		return
	}

	if err := s.store.CreateBuilds(builds); err != nil {
		http.Error(w, "failed to create builds: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":  len(builds),
		"builds": builds,
	})
}

type dockerfileEntry struct {
	Path             string
	DockerfileName   string
	DockerfileContent []byte
}

func discoverDockerfiles(r io.Reader) ([]dockerfileEntry, error) {
	gzr, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer gzr.Close()

	var entries []dockerfileEntry
	tr := tar.NewReader(gzr)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		name := strings.TrimPrefix(hdr.Name, "./")
		base := filepath.Base(name)
		if base == "Dockerfile" || strings.HasPrefix(base, "Dockerfile.") {
			content, err := io.ReadAll(tr)
			if err != nil {
				continue
			}
			entries = append(entries, dockerfileEntry{
				Path:            filepath.Dir(name),
				DockerfileName:  base,
				DockerfileContent: content,
			})
		}
	}
	return entries, nil
}

func extractSubdirTar(r io.Reader, entry dockerfileEntry) ([]byte, error) {
	gzr, err := gzip.NewReader(r)
	if err != nil {
		return nil, err
	}
	defer gzr.Close()

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	tr := tar.NewReader(gzr)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		name := strings.TrimPrefix(hdr.Name, "./")
		// Only include files within this subdirectory
		if !strings.HasPrefix(name, entry.Path+"/") && name != entry.Path {
			continue
		}

		relName := strings.TrimPrefix(name, entry.Path+"/")
		if relName == entry.Path {
			relName = filepath.Base(entry.Path)
		}

		newHdr := *hdr
		newHdr.Name = relName
		if err := tw.WriteHeader(&newHdr); err != nil {
			return nil, err
		}
		if hdr.Typeflag == tar.TypeReg {
			io.Copy(tw, tr)
		}
	}

	tw.Close()
	gw.Close()
	return buf.Bytes(), nil
}

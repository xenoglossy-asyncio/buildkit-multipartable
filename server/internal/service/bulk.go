package service

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"path/filepath"
	"strings"
)

type bulkEntry struct {
	path    string
	name    string
	content []byte
}

func discoverBulkDockerfiles(r io.Reader) ([]bulkEntry, error) {
	gzr, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer gzr.Close()

	var entries []bulkEntry
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
			entries = append(entries, bulkEntry{
				path:    filepath.Dir(name),
				name:    base,
				content: content,
			})
		}
	}
	return entries, nil
}

func extractSubdir(r io.Reader, entry bulkEntry) (*bytes.Reader, error) {
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
		if !strings.HasPrefix(name, entry.path+"/") && name != entry.path {
			continue
		}
		relName := strings.TrimPrefix(name, entry.path+"/")
		if relName == entry.path {
			relName = filepath.Base(entry.path)
		}

		newHdr := *hdr
		newHdr.Name = relName
		if err := tw.WriteHeader(&newHdr); err != nil {
			return nil, err
		}
		if hdr.Typeflag == tar.TypeReg {
			if _, err := io.Copy(tw, tr); err != nil {
				return nil, fmt.Errorf("copy tar entry %s: %w", newHdr.Name, err)
			}
		}
	}

	tw.Close()
	gw.Close()
	return bytes.NewReader(buf.Bytes()), nil
}

func sanitizeTag(path string) string {
	s := strings.TrimPrefix(path, "/")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ToLower(s)
	return s
}

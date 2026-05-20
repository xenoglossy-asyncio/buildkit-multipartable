// Package buildkit wraps the BuildKit gRPC client for image builds.
package buildkit

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/moby/buildkit/client"
	fsutil "github.com/tonistiigi/fsutil"
	"github.com/moby/buildkit/session"
	"github.com/moby/buildkit/session/auth/authprovider"
)

// BuildOptions configures a build.
type BuildOptions struct {
	ContextDir string
	Dockerfile string
	OutputTag  string
	CacheFrom  string
	CacheTo    string
	BuildArgs  map[string]string
}

// BuildResult holds the outcome of a build.
type BuildResult struct {
	ImageDigest string
}

// Client wraps BuildKit's gRPC client.
type Client struct {
	addr string
}

// NewClient creates a new BuildKit client.
func NewClient(buildkitAddr string) (*Client, error) {
	return &Client{addr: buildkitAddr}, nil
}

// Build executes a build via BuildKit gRPC and streams logs to the provided writer.
func (c *Client) Build(ctx context.Context, opts BuildOptions, logWriter io.Writer) (*BuildResult, error) {
	bkClient, err := client.New(ctx, c.addr)
	if err != nil {
		return nil, fmt.Errorf("connect to buildkitd: %w", err)
	}
	defer bkClient.Close()

	contextFS, err := fsutil.NewFS(opts.ContextDir)
	if err != nil {
		return nil, fmt.Errorf("create context fs: %w", err)
	}

	solveOpt := client.SolveOpt{
		Frontend: "dockerfile.v0",
		LocalMounts: map[string]fsutil.FS{
			"context":    contextFS,
			"dockerfile": contextFS,
		},
		FrontendAttrs: map[string]string{
			"filename": opts.Dockerfile,
		},
		Session: []session.Attachable{
			authprovider.NewDockerAuthProvider(authprovider.DockerAuthProviderConfig{}),
		},
	}

	// Build args
	for k, v := range opts.BuildArgs {
		solveOpt.FrontendAttrs["build-arg:"+k] = v
	}

	// Output
	if opts.OutputTag != "" {
		solveOpt.Exports = []client.ExportEntry{
			{
				Type: client.ExporterImage,
				Attrs: map[string]string{
					"name": opts.OutputTag,
					"push": "true",
				},
			},
		}
	}

	// Cache import
	if opts.CacheFrom != "" {
		solveOpt.CacheImports = []client.CacheOptionsEntry{
			{
				Type: "registry",
				Attrs: map[string]string{
					"ref": opts.CacheFrom,
				},
			},
		}
	}

	// Cache export
	if opts.CacheTo != "" {
		solveOpt.CacheExports = []client.CacheOptionsEntry{
			{
				Type: "registry",
				Attrs: map[string]string{
					"ref":  opts.CacheTo,
					"mode": "max",
				},
			},
		}
	}

	ch := make(chan *client.SolveStatus, 64)

	go func() {
		for s := range ch {
			if logWriter != nil {
				writeStatus(logWriter, s)
			}
		}
	}()

	resp, err := bkClient.Solve(ctx, nil, solveOpt, ch)

	// Drain remaining events with a timeout to prevent goroutine leak
	go func() {
		for range ch {
		}
	}()
	time.Sleep(100 * time.Millisecond)

	if err != nil {
		return nil, fmt.Errorf("build failed: %w", err)
	}

	result := &BuildResult{}
	if resp != nil && resp.ExporterResponse != nil {
		if digest, ok := resp.ExporterResponse["containerimage.digest"]; ok {
			result.ImageDigest = digest
		}
	}

	return result, nil
}

func writeStatus(w io.Writer, s *client.SolveStatus) {
	for _, v := range s.Vertexes {
		fmt.Fprintf(w, "#%d [%s] %s", 0, v.Name, v.Started.Format(time.RFC3339))
		if v.Completed != nil {
			fmt.Fprintf(w, " %s", v.Completed.Sub(*v.Started))
		}
		if v.Error != "" {
			fmt.Fprintf(w, " ERROR: %s", v.Error)
		}
		fmt.Fprintln(w)
	}
	for _, l := range s.Logs {
		fmt.Fprintf(w, "%s", l.Data)
	}
	// Flush after each status update
	if f, ok := w.(interface{ Flush() error }); ok {
		f.Flush()
	}
}


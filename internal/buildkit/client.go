package buildkit

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
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

// LogFunc is called for each log line during a build.
type LogFunc func(line string)

// BuildResult holds the outcome of a build.
type BuildResult struct {
	ImageDigest string
}

// Client wraps buildctl for executing builds.
type Client struct {
	buildctlPath string
	buildkitAddr string
}

// NewClient creates a new BuildKit client.
func NewClient(buildkitAddr string) (*Client, error) {
	path, err := exec.LookPath("buildctl")
	if err != nil {
		return nil, fmt.Errorf("buildctl not found in PATH: %w", err)
	}
	return &Client{buildctlPath: path, buildkitAddr: buildkitAddr}, nil
}

// Build executes a build via buildctl. Logs are streamed via the onLog callback.
func (c *Client) Build(ctx context.Context, opts BuildOptions, onLog LogFunc) (*BuildResult, error) {
	dockerfilePath := opts.ContextDir + "/" + opts.Dockerfile
	if _, err := os.Stat(dockerfilePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("Dockerfile not found at %s", dockerfilePath)
	}

	args := []string{
		"--addr=" + c.buildkitAddr,
		"build",
		"--frontend=dockerfile.v0",
		"--local=context=" + opts.ContextDir,
		"--local=dockerfile=" + opts.ContextDir,
		"--opt=filename=" + opts.Dockerfile,
		"--progress=plain",
	}

	if opts.OutputTag != "" {
		args = append(args, "--output=type=image,name="+opts.OutputTag+",push=true")
	}
	if opts.CacheFrom != "" {
		args = append(args, "--import-cache=type=registry,ref="+opts.CacheFrom)
	}
	if opts.CacheTo != "" {
		args = append(args, "--export-cache=type=registry,ref="+opts.CacheTo+",mode=max")
	}
	for k, v := range opts.BuildArgs {
		args = append(args, "--opt=build-arg:"+k+"="+v)
	}

	cmd := exec.CommandContext(ctx, c.buildctlPath, args...)
	cmd.Env = append(os.Environ(), "BUILDKIT_HOST="+c.buildkitAddr)

	// buildctl writes build progress to stderr
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start buildctl: %w", err)
	}

	var logBuf strings.Builder
	var logWG sync.WaitGroup
	logWG.Add(1)
	go func() {
		defer logWG.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			logBuf.WriteString(line + "\n")
			if onLog != nil {
				onLog(line)
			}
		}
	}()

	waitErr := cmd.Wait()
	logWG.Wait()

	if waitErr != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("buildctl failed: %s", logBuf.String())
	}

	result := &BuildResult{}
	output := logBuf.String()
	if idx := strings.LastIndex(output, "containerimage.descriptor"); idx >= 0 {
		// best-effort digest extraction
	}

	return result, nil
}

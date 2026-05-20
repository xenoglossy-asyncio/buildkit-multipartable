import { useState, useEffect } from "react";

interface Props {
  onLogin: (key: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dtbuild_api_key");
    if (saved) {
      onLogin(saved);
    }
  }, [onLogin]);

  async function handleLogin() {
    if (!key.trim()) return;
    try {
      const res = await fetch("/api/v1/stats");
      if (res.ok) {
        localStorage.setItem("dtbuild_api_key", key.trim());
        onLogin(key.trim());
      } else {
        setError("Invalid API key");
      }
    } catch {
      // Allow login even if server not reachable (dev mode)
      localStorage.setItem("dtbuild_api_key", key.trim());
      onLogin(key.trim());
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>dtbuildkit</h1>
        <p>Enter your API key to continue</p>
        <input
          type="password"
          placeholder="API Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoFocus
        />
        <button onClick={handleLogin}>Login</button>
        {error && <div className="login-error">{error}</div>}
        <p style={{ marginTop: 16, color: "#555", fontSize: 11 }}>
          No key configured? Leave empty and press Login.
        </p>
      </div>
    </div>
  );
}

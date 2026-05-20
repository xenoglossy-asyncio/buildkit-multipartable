import { useState, useEffect } from "react";

interface Props {
  onLogin: (key: string, isAdmin: boolean) => void;
}

export default function Login({ onLogin }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dtbuild_api_key");
    if (saved) {
      tryAutoLogin(saved);
    }
  }, []);

  async function tryAutoLogin(savedKey: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: savedKey }),
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(savedKey, data.is_admin);
      }
    } catch {
      // server not ready, try again later
    }
  }

  async function handleLogin() {
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("dtbuild_api_key", key.trim());
        onLogin(key.trim(), data.is_admin);
      } else {
        const data = await res.json();
        setError(data.detail || "Invalid API key");
      }
    } catch {
      localStorage.setItem("dtbuild_api_key", key.trim());
      onLogin(key.trim(), false);
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

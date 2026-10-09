"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 200ms",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.08), transparent 60%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: "420px", position: "relative" }} className="animate-slide-up">
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "10px", textDecoration: "none", marginBottom: "24px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>📋</div>
            <span style={{ fontSize: "20px", fontWeight: 700, background: "linear-gradient(135deg, #c7d2fe, #e0e7ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GuideFlow</span>
          </Link>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "8px" }}>Create your account</h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Start creating step-by-step guides in minutes</p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "16px", padding: "32px" }}>
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--danger-bg)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)", fontSize: "13px", fontWeight: 500, marginBottom: "20px" }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" style={inputStyle} required />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" style={inputStyle} required />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" style={inputStyle} required minLength={8} />
          </div>

          <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px 20px", borderRadius: "10px", border: "none", fontSize: "14px", fontWeight: 600, color: "white", background: loading ? "var(--bg-elevated)" : "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: loading ? "none" : "0 4px 16px rgba(99,102,241,0.25)", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 200ms" }}>
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link href="/auth/login" style={{ color: "var(--accent-primary)", fontWeight: 600 }}>Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

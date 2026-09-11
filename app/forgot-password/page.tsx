"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const endpoint = token ? "/api/auth/reset-password" : "/api/auth/request-password-reset";
      const body = token ? { token, password } : { email };
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      setMessage(data.message);
      if (token) setPassword("");
    } catch (err: any) { setError(err.message || "Something went wrong"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-cream p-8 flex items-center">
      <div className="max-w-md mx-auto w-full">
        <h1 className="text-3xl font-bold text-primary text-center">{token ? "Set New Password" : "Forgot Password"}</h1>
        <p className="text-gray-600 text-center mt-2">{token ? "Choose a new password for your account." : "Enter your email to receive a secure reset link."}</p>
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-md mt-6 space-y-4">
          {!token ? <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required className="w-full p-3 border rounded-md" />
            : <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password (8+ characters)" minLength={8} required className="w-full p-3 border rounded-md" />}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {message && <p className="text-green-600 text-sm">{message}</p>}
          <button disabled={loading} className="bg-yellow-500 text-black px-6 py-3 rounded-md w-full font-semibold disabled:opacity-50">{loading ? "Processing…" : token ? "Reset Password" : "Send Reset Link"}</button>
          <p className="text-center"><Link href="/login" className="text-primary hover:underline">← Back to Login</Link></p>
        </form>
      </div>
    </div>
  );
}

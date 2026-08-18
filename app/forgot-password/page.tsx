"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">Forgot Password</h1>
        <p className="text-gray-600 text-center mt-2">
          Enter your email to reset your password
        </p>
        {!submitted ? (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-md mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <button
              type="submit"
              className="mt-4 bg-yellow-500 text-black px-6 py-3 rounded-md hover:bg-yellow-400 w-full font-semibold"
            >
              Send Reset Link
            </button>
            <p className="text-center mt-4">
              <Link href="/login" className="text-primary hover:underline">
                ← Back to Login
              </Link>
            </p>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6 text-center">
            <p className="text-green-600 font-semibold">✅ Reset link sent!</p>
            <p className="text-gray-600 mt-2">Check your email for instructions.</p>
            <Link href="/login" className="mt-4 inline-block text-primary hover:underline">
              ← Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

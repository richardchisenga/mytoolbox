"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [school, setSchool] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            email,
            password,
            school,
            province,
            district,
            grades,
            subjects,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Registration failed");
      }

      const data = await response.json();
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 md:p-8 border border-highlight">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Mwabuka buti — good morning</h1>
          <p className="text-sm text-dark/70 mt-1">Set up once — your details flow straight onto your lesson plans.</p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className={`flex-1 h-1 rounded-full ${step >= 1 ? "bg-secondary" : "bg-gray-200"}`} />
          <span className={`text-xs font-medium mx-2 ${step === 1 ? "text-primary" : "text-gray-400"}`}>1. Account</span>
          <div className={`flex-1 h-1 rounded-full ${step >= 2 ? "bg-secondary" : "bg-gray-200"}`} />
          <span className={`text-xs font-medium mx-2 ${step === 2 ? "text-primary" : "text-gray-400"}`}>2. Profile</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            ❌ {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark">Full name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="John Banda"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Confirm password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Re-enter password"
              />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5">
              Continue
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark">School name</label>
              <input
                type="text"
                required
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Manungu Secondary School"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Province</label>
              <select
                required
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select province</option>
                <option>Central</option>
                <option>Copperbelt</option>
                <option>Eastern</option>
                <option>Luapula</option>
                <option>Lusaka</option>
                <option>Muchinga</option>
                <option>Northern</option>
                <option>North-Western</option>
                <option>Southern</option>
                <option>Western</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">District</label>
              <input
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Itezhi-Tezhi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Grades you teach</label>
              <input
                type="text"
                value={grades.join(", ")}
                onChange={(e) => setGrades(e.target.value.split(",").map((s) => s.trim()))}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Grade 5, Grade 8"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Subjects</label>
              <input
                type="text"
                value={subjects.join(", ")}
                onChange={(e) => setSubjects(e.target.value.split(",").map((s) => s.trim()))}
                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Mathematics, Science"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 disabled:opacity-50"
            >
              {loading ? "Registering..." : "Complete Registration"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

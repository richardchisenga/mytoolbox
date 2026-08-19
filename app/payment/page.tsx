"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PaymentPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState("mtn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/payments/initiate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: 150,
            phoneNumber: phoneNumber,
            provider: provider,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Payment initiation failed");
      }

      setSuccess(true);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">💳 Upgrade to Pro</h1>
        <p className="text-gray-600 text-center mt-2">Pay ZMW 150 for unlimited lesson plans</p>

        {success ? (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-primary">Payment Initiated!</h2>
            <p className="text-gray-600 mt-2">Please complete the payment on your phone.</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 bg-yellow-500 text-black px-6 py-2 rounded-md hover:bg-yellow-400"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handlePayment} className="bg-white p-6 rounded-xl shadow-md mt-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                ❌ {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Mobile Money Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="mtn">MTN Mobile Money</option>
                <option value="airtel">Airtel Money</option>
                <option value="zamtel">Zamtel Kwacha</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 260977123456"
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Format: 260XXXXXXXXX (without +)</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full bg-yellow-500 text-black py-3 rounded-lg hover:bg-yellow-400 disabled:opacity-50 font-semibold"
            >
              {loading ? "Processing..." : "Pay Now"}
            </button>

            <div className="text-center mt-4">
              <Link href="/pricing" className="text-sm text-primary hover:underline">
                ← Back to Pricing
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

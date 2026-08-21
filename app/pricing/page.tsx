"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error("Error:", error);
      }
    };

    fetchUser();
  }, [router]);

  const handleUpgrade = async (plan: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/payments/initiate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            plan: plan,
            amount: plan === 'pro' ? 150 : 500,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Redirect to payment page with transaction details
        router.push(`/payment?transaction=${data.transactionId}`);
      } else {
        alert("Payment initiation failed. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Payment initiation failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">
          Choose Your Plan
        </h1>
        <p className="text-gray-600 text-center mt-2">
          Start free, upgrade when you need more
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {/* Free Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">Free</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 0</p>
            <p className="text-sm text-gray-500">Per month</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2">✅ 5 lessons per month</li>
              <li className="flex items-center gap-2">✅ 3 schemes per term</li>
              <li className="flex items-center gap-2">✅ Basic templates</li>
              <li className="flex items-center gap-2 text-gray-400">❌ Export to Word/PDF</li>
              <li className="flex items-center gap-2 text-gray-400">❌ Assessment weeks</li>
              <li className="flex items-center gap-2 text-gray-400">❌ Priority support</li>
            </ul>
            {user?.role === 'free' ? (
              <button
                className="mt-4 w-full py-2 border border-gray-300 rounded-md text-gray-500 cursor-default"
                disabled
              >
                ✅ Current Plan
              </button>
            ) : (
              <button
                className="mt-4 w-full bg-gray-200 text-gray-500 py-2 rounded-md cursor-default"
                disabled
              >
                Current Plan
              </button>
            )}
          </div>

          {/* Pro Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border-2 border-secondary relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-black text-xs px-3 py-1 rounded-full font-semibold">
              MOST POPULAR
            </span>
            <h2 className="text-xl font-bold">Pro</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 150</p>
            <p className="text-sm text-gray-500">Per month</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2">✅ Unlimited lessons</li>
              <li className="flex items-center gap-2">✅ Unlimited schemes</li>
              <li className="flex items-center gap-2">✅ All templates</li>
              <li className="flex items-center gap-2">✅ Export to Word/PDF</li>
              <li className="flex items-center gap-2">✅ Assessment weeks</li>
              <li className="flex items-center gap-2">✅ Priority support</li>
            </ul>
            {user?.role === 'pro' ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md cursor-default"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade('pro')}
                disabled={loading}
                className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Upgrade to Pro"}
              </button>
            )}
          </div>

          {/* School Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">School</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 500</p>
            <p className="text-sm text-gray-500">Per month</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2">✅ Up to 10 teachers</li>
              <li className="flex items-center gap-2">✅ All Pro features</li>
              <li className="flex items-center gap-2">✅ Admin dashboard</li>
              <li className="flex items-center gap-2">✅ Bulk reporting</li>
              <li className="flex items-center gap-2">✅ Dedicated support</li>
            </ul>
            {user?.role === 'school' ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md cursor-default"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade('school')}
                disabled={loading}
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/80 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Contact Sales"}
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/dashboard" className="text-primary hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    const fetchSubscription = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/subscription/status`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setSubscription(data);
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      }
    };

    fetchSubscription();
  }, [router]);

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">
          Choose Your Plan
        </h1>
        <p className="text-gray-600 text-center mt-2">
          Upgrade to Pro for unlimited lesson plans and premium features
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Free Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">Free</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 0</p>
            <p className="text-sm text-gray-500">Per month</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2">✅ 5 lessons per month</li>
              <li className="flex items-center gap-2">✅ Basic templates</li>
              <li className="flex items-center gap-2 text-gray-400">❌ Export to PDF</li>
              <li className="flex items-center gap-2 text-gray-400">❌ Priority support</li>
            </ul>
            <button
              className="mt-4 w-full py-2 border border-gray-300 rounded-md text-gray-500 cursor-default"
              disabled
            >
              {subscription?.role === "free" ? "✅ Current Plan" : "Free"}
            </button>
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
              <li className="flex items-center gap-2">✅ All templates</li>
              <li className="flex items-center gap-2">✅ Export to PDF/Word</li>
              <li className="flex items-center gap-2">✅ Priority support</li>
            </ul>
            {subscription?.role === "pro" ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md cursor-default"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <Link
                href="/payment"
                className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 text-center block font-semibold"
              >
                Subscribe Now
              </Link>
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

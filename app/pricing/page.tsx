"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      const session = await response.json();
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
      await stripe.redirectToCheckout({ sessionId: session.id });
    } catch (error) {
      console.error("Payment error:", error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">Choose Your Plan</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {/* Free Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">Free</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 0</p>
            <ul className="mt-4 space-y-2">
              <li>✅ 5 lessons per month</li>
              <li>✅ Basic templates</li>
              <li>❌ Export to PDF</li>
              <li>❌ Priority support</li>
            </ul>
            <button className="mt-4 w-full py-2 border border-gray-300 rounded-md" disabled>
              Current Plan
            </button>
          </div>

          {/* Pro Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border-2 border-secondary">
            <h2 className="text-xl font-bold">Pro</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 150</p>
            <ul className="mt-4 space-y-2">
              <li>✅ Unlimited lessons</li>
              <li>✅ All templates</li>
              <li>✅ Export to PDF/Word</li>
              <li>✅ Priority support</li>
            </ul>
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Subscribe Now"}
            </button>
          </div>

          {/* School Plan */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">School</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 500</p>
            <ul className="mt-4 space-y-2">
              <li>✅ Up to 10 teachers</li>
              <li>✅ All Pro features</li>
              <li>✅ Admin dashboard</li>
              <li>✅ Priority support</li>
            </ul>
            <button className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/80">
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

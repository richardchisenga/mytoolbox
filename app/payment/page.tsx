"use client";

import { useState } from "react";

type Plan = "PRO" | "SCHOOL";
type Provider = "MTN" | "AIRTEL" | "ZAMTEL";

const plans = {
  PRO: {
    name: "Pro",
    amount: 150,
    description: "Unlimited lesson plans",
  },
  SCHOOL: {
    name: "School",
    amount: 500,
    description: "School-wide access",
  },
};

export default function PaymentPage() {
  const [plan, setPlan] = useState<Plan>("PRO");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState<Provider>("MTN");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedPlan = plans[plan];

  async function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          phoneNumber,
          provider,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Payment failed");
      }

      setMessage(
        data.message ||
          "Payment request sent. Please approve the payment on your phone."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start payment."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">
          💳 Upgrade
        </h1>

        <p className="text-gray-600 text-center mt-2">
          Pay securely using Zambian mobile money.
        </p>

        <div className="bg-white rounded-xl shadow-md p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Choose a plan</h2>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPlan("PRO")}
              className={`rounded-lg border p-4 text-left ${
                plan === "PRO"
                  ? "border-primary bg-primary/10"
                  : "border-gray-300"
              }`}
            >
              <div className="font-bold">Pro</div>
              <div className="text-lg">ZMW 150</div>
              <div className="text-sm text-gray-600">
                Unlimited lesson plans
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPlan("SCHOOL")}
              className={`rounded-lg border p-4 text-left ${
                plan === "SCHOOL"
                  ? "border-primary bg-primary/10"
                  : "border-gray-300"
              }`}
            >
              <div className="font-bold">School</div>
              <div className="text-lg">ZMW 500</div>
              <div className="text-sm text-gray-600">
                School-wide access
              </div>
            </button>
          </div>

          <form onSubmit={handlePayment} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="phoneNumber"
                className="block text-sm font-medium mb-1"
              >
                Zambian phone number
              </label>

              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0971234567"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3"
              />

              <p className="text-xs text-gray-500 mt-1">
                Example: 0971234567 or +260971234567
              </p>
            </div>

            <div>
              <label
                htmlFor="provider"
                className="block text-sm font-medium mb-1"
              >
                Mobile money provider
              </label>

              <select
                id="provider"
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as Provider)
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3"
              >
                <option value="MTN">MTN Mobile Money</option>
                <option value="AIRTEL">Airtel Money</option>
                <option value="ZAMTEL">Zamtel Money</option>
              </select>
            </div>

            <div className="rounded-lg bg-gray-100 p-4">
              <div className="flex justify-between">
                <span className="font-medium">Selected plan</span>
                <span className="font-bold">{selectedPlan.name}</span>
              </div>

              <div className="flex justify-between mt-2">
                <span>Amount</span>
                <span className="font-bold">
                  ZMW {selectedPlan.amount}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary text-white py-3 font-semibold disabled:opacity-50"
            >
              {loading
                ? "Processing..."
                : `Pay ZMW ${selectedPlan.amount}`}
            </button>
          </form>

          {message && (
            <div className="mt-4 rounded-lg bg-gray-100 p-4 text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

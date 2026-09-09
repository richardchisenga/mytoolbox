"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Provider = "MTN" | "AIRTEL" | "ZAMTEL";
type PlanKey = "pro" | "school";

const plans: Record<PlanKey, {
  name: string;
  amount: number;
  duration: string;
  features: string[];
}> = {
  pro: {
    name: "Pro",
    amount: 150,
    duration: "90 days",
    features: [
      "Unlimited lessons",
      "Unlimited schemes",
      "All templates",
      "Export to Word/PDF",
      "Assessment weeks",
      "Priority support",
    ],
  },
  school: {
    name: "School",
    amount: 500,
    duration: "90 days",
    features: [
      "Up to 10 teachers",
      "All Pro features",
      "Admin dashboard",
      "Bulk reporting",
      "Dedicated support",
    ],
  },
};

export default function PricingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("pro");
  const [provider, setProvider] = useState<Provider>("MTN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

  const paymentNumbers = useMemo(
    () => ({
      MTN: process.env.NEXT_PUBLIC_PAYMENT_MTN || "",
      AIRTEL: process.env.NEXT_PUBLIC_PAYMENT_AIRTEL || "",
      ZAMTEL: process.env.NEXT_PUBLIC_PAYMENT_ZAMTEL || "",
    }),
    []
  );

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          setUser(await response.json());
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error("User fetch error:", error);
      }
    };

    fetchUser();
  }, [router, API_URL]);

  function normalizePhone(phone: string) {
    let value = phone.trim().replace(/\s+/g, "").replace(/-/g, "");

    if (value.startsWith("+260")) value = value.substring(1);

    if (value.startsWith("0") && value.length === 10) {
      value = `260${value.substring(1)}`;
    }

    if (!/^260[0-9]{9}$/.test(value)) {
      throw new Error(
        "Please enter a valid Zambian phone number, e.g. 0976638676."
      );
    }

    return value;
  }

  const openPaymentModal = (plan: PlanKey) => {
    setSelectedPlan(plan);
    setProvider("MTN");
    setPhoneNumber("");
    setTransactionReference("");
    setPaymentError("");
    setPaymentSuccess(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (loading) return;
    setShowModal(false);
    setPhoneNumber("");
    setTransactionReference("");
    setPaymentError("");
    setPaymentSuccess(false);
  };

  const handleManualPayment = async () => {
    setPaymentError("");
    setPaymentSuccess(false);

    if (!transactionReference.trim()) {
      setPaymentError("Please enter the mobile-money transaction reference.");
      return;
    }

    let cleanPhone = "";

    try {
      cleanPhone = normalizePhone(phoneNumber);
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Invalid phone number."
      );
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const selected = plans[selectedPlan];
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/payments/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: selectedPlan,
          amount: selected.amount,
          provider,
          phoneNumber: cleanPhone,
          transactionReference: transactionReference.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Payment submission failed. Please try again."
        );
      }

      setPaymentSuccess(true);
      setPaymentError("");
    } catch (error) {
      console.error("Manual payment error:", error);
      setPaymentError(
        error instanceof Error ? error.message : "Unable to submit payment."
      );
    } finally {
      setLoading(false);
    }
  };

  const isUnlimited =
    user?.role === "ADMIN" ||
    user?.role === "PRO" ||
    user?.role === "SCHOOL";

  const getRemainingLessons = () => {
    if (!user) return 0;
    if (isUnlimited) return "♾️ Unlimited";
    return (user.lessonsLimit || 5) - (user.lessonsUsed || 0);
  };

  const isProOrSchool =
    user?.role === "ADMIN" ||
    user?.role === "PRO" ||
    user?.role === "SCHOOL";

  const currentPlan = plans[selectedPlan];
  const destinationNumber = paymentNumbers[provider];

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-primary text-center">
          Choose Your Plan
        </h1>

        <p className="text-gray-600 text-center mt-2">
          Start free with 5 lessons per month. Upgrade when you need more!
        </p>

        {user && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-500">
              Current Plan:{" "}
              <span className="font-semibold text-primary uppercase">
                {user.role || "FREE"}
              </span>
            </p>

            {isUnlimited ? (
              <p className="text-sm text-gray-500">
                Lessons:{" "}
                <span className="font-semibold text-secondary">
                  ♾️ Unlimited
                </span>
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Lessons used this month:{" "}
                  <span className="font-semibold">
                    {user.lessonsUsed || 0}
                  </span>{" "}
                  / {user.lessonsLimit || 5}
                </p>

                <p className="text-sm text-gray-500">
                  Remaining lessons:{" "}
                  <span className="font-semibold text-secondary">
                    {getRemainingLessons()}
                  </span>
                </p>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {/* FREE */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">Free</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 0</p>
            <p className="text-sm text-gray-500">Per month</p>

            <ul className="mt-4 space-y-2">
              <li>✅ 5 lessons per month</li>
              <li>✅ 3 schemes per term</li>
              <li>✅ Basic templates</li>
              <li className="text-gray-400">❌ Export to Word/PDF</li>
              <li className="text-gray-400">❌ Assessment weeks</li>
              <li className="text-gray-400">❌ Priority support</li>
            </ul>

            <button
              className="mt-4 w-full bg-gray-200 text-gray-500 py-2 rounded-md"
              disabled
            >
              {user?.role === "FREE" || !user?.role
                ? "✅ Current Plan"
                : "Free"}
            </button>
          </div>

          {/* PRO */}
          <div className="bg-white p-6 rounded-xl shadow-md border-2 border-secondary relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-black text-xs px-3 py-1 rounded-full font-semibold">
              MOST POPULAR
            </span>

            <h2 className="text-xl font-bold">Pro</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 150</p>
            <p className="text-sm text-gray-500">90 days access</p>

            <ul className="mt-4 space-y-2">
              {plans.pro.features.map((feature) => (
                <li key={feature}>✅ {feature}</li>
              ))}
            </ul>

            {isProOrSchool ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => openPaymentModal("pro")}
                className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 transition-colors"
              >
                🚀 Upgrade to Pro
              </button>
            )}

            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure manual payment via MTN, Airtel or Zamtel
            </p>
          </div>

          {/* SCHOOL */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">School</h2>
            <p className="text-3xl font-bold text-primary mt-2">ZMW 500</p>
            <p className="text-sm text-gray-500">90 days access</p>

            <ul className="mt-4 space-y-2">
              {plans.school.features.map((feature) => (
                <li key={feature}>✅ {feature}</li>
              ))}
            </ul>

            {user?.role === "ADMIN" || user?.role === "SCHOOL" ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => openPaymentModal("school")}
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/80 transition-colors"
              >
                🏫 Upgrade to School
              </button>
            )}

            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure manual payment via MTN, Airtel or Zamtel
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/dashboard" className="text-primary hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* MANUAL PAYMENT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{currentPlan.name} Plan</h2>
              <button
                onClick={closeModal}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            {paymentSuccess ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-bold text-green-600">
                  Payment Submitted
                </h3>
                <p className="text-gray-600 mt-3">
                  Your payment reference has been submitted successfully. The
                  administrator will verify your payment and activate your{" "}
                  {currentPlan.name} plan.
                </p>
                <p className="text-sm text-gray-500 mt-3">
                  You will receive access after the payment is approved.
                </p>
                <button
                  onClick={closeModal}
                  className="mt-5 w-full bg-primary text-white py-3 rounded-md"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="font-semibold text-gray-800">
                    Step 1: Send payment
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Send <strong>ZMW {currentPlan.amount}</strong> using the
                    selected mobile-money network to the MyToolbox payment
                    number below.
                  </p>

                  {destinationNumber ? (
                    <div className="mt-3 bg-white border rounded-md p-3 text-center">
                      <p className="text-xs text-gray-500">
                        {provider} PAYMENT NUMBER
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {destinationNumber}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-red-600">
                      Payment number for {provider} has not been configured.
                      Please contact the administrator.
                    </p>
                  )}
                </div>

                {paymentError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    ❌ {paymentError}
                  </div>
                )}

                <div className="mb-4">
                  <label
                    htmlFor="provider"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Mobile Money Provider
                  </label>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) =>
                      setProvider(e.target.value as Provider)
                    }
                    disabled={loading}
                    className="w-full px-3 py-3 border border-gray-300 rounded-md bg-white"
                  >
                    <option value="MTN">MTN Mobile Money</option>
                    <option value="AIRTEL">Airtel Money</option>
                    <option value="ZAMTEL">Zamtel Money</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="phoneNumber"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Your Mobile Money Number
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0976638676"
                    className="w-full px-3 py-3 border border-gray-300 rounded-md"
                    disabled={loading}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: 0976638676, 260976638676 or +260976638676
                  </p>
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="transactionReference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Transaction Reference
                  </label>
                  <input
                    id="transactionReference"
                    type="text"
                    value={transactionReference}
                    onChange={(e) =>
                      setTransactionReference(e.target.value)
                    }
                    placeholder="Enter the transaction ID/reference"
                    className="w-full px-3 py-3 border border-gray-300 rounded-md"
                    disabled={loading}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Copy the transaction reference from your mobile-money
                    confirmation message.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Plan</span>
                    <span className="font-bold">{currentPlan.name}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-600">Access</span>
                    <span className="font-bold">
                      {currentPlan.duration}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-600">Amount</span>
                    <span className="font-bold">
                      ZMW {currentPlan.amount}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-600">Network</span>
                    <span className="font-bold">{provider}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={loading}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleManualPayment}
                    disabled={
                      loading ||
                      !phoneNumber ||
                      !transactionReference.trim() ||
                      !destinationNumber
                    }
                    className="flex-1 bg-yellow-500 text-black px-4 py-3 rounded-md hover:bg-yellow-400 disabled:opacity-50 font-semibold"
                  >
                    {loading ? "Submitting..." : "Submit Payment"}
                  </button>
                </div>

                <p className="text-xs text-gray-400 mt-3 text-center">
                  🔒 Your payment details are submitted securely for manual
                  verification.
                </p>

                <p className="text-xs text-gray-500 mt-2 text-center">
                  Need help? Contact MyToolbox Admin:{" "}
                  <a
                    href="https://wa.me/260976638676?text=Hello%20MyToolbox%20Admin%2C%20I%20need%20help%20with%20my%20payment."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline"
                  >
                    WhatsApp Admin
                  </a>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

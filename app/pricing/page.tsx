"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [showModal, setShowModal] = useState(false);

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
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error("Error:", error);
      }
    };

    fetchUser();
  }, [router]);

  const handleUpgrade = async (plan: string) => {
    // Validate phone number
    const cleanNumber = phoneNumber.replace(/\s/g, '');
    if (!cleanNumber.match(/^260[0-9]{9}$/)) {
      setPaymentError("Please enter a valid Zambian phone number (e.g., 260977123456)");
      return;
    }

    setLoading(true);
    setPaymentError("");
    setPaymentSuccess(false);
    setStatusMessage("⏳ Initiating payment...");

    try {
      const token = localStorage.getItem("token");
      
      // Set amount based on plan
      const planAmount = plan === "school" ? 500 : 150;

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
            phoneNumber: cleanNumber,
            amount: planAmount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Payment initiation failed");
      }

      setStatusMessage("⏳ Payment initiated... Waiting for confirmation...");

      if (data.payment?.referenceId) {
        pollPaymentStatus(data.payment.referenceId);
      }

    } catch (error: any) {
      setPaymentError(error.message);
      setStatusMessage("");
      setLoading(false);
    }
  };

  const pollPaymentStatus = async (referenceId: string) => {
    const token = localStorage.getItem("token");
    const maxAttempts = 30; // 30 * 3 seconds = 90 seconds
    let attempts = 0;

    setStatusMessage("⏳ Checking payment status...");

    const checkStatus = setInterval(async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/payments/${referenceId}/status`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log("Payment status:", data);

          if (data.payment?.status === "completed") {
            clearInterval(checkStatus);
            setPaymentSuccess(true);
            setStatusMessage("✅ Payment successful! You've been upgraded to Pro!");
            setLoading(false);
            setShowModal(false);
            setTimeout(() => {
              router.push("/dashboard");
            }, 2000);
          } else if (data.payment?.status === "failed") {
            clearInterval(checkStatus);
            setPaymentError("Payment failed. Please try again.");
            setStatusMessage("");
            setLoading(false);
          }
        }

        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(checkStatus);
          setPaymentError("Payment taking too long. Please check your transaction status.");
          setStatusMessage("");
          setLoading(false);
        }
      } catch (error) {
        console.error("Status check error:", error);
      }
    }, 3000); // Check every 3 seconds
  };

  const openPaymentModal = (plan: string) => {
    setSelectedPlan(plan);
    setPhoneNumber("");
    setPaymentError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setPhoneNumber("");
    setPaymentError("");
  };

  const getRemainingLessons = () => {
    if (!user) return 0;
    if (user.role === "PRO" || user.role === "SCHOOL") return "♾️ Unlimited";
    return (user.lessonsLimit || 5) - (user.lessonsUsed || 0);
  };

  const isProOrSchool = user?.role === "PRO" || user?.role === "SCHOOL";

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
              Current Plan: <span className="font-semibold text-primary uppercase">{user.role || "FREE"}</span>
            </p>
            <p className="text-sm text-gray-500">
              Lessons used this month: <span className="font-semibold">{user.lessonsUsed || 0}</span>
              {user.role !== "PRO" && user.role !== "SCHOOL" && ` / ${user.lessonsLimit || 5} remaining`}
            </p>
            {user.role !== "PRO" && user.role !== "SCHOOL" && (
              <p className="text-sm text-gray-500">
                Remaining lessons: <span className="font-semibold text-secondary">{getRemainingLessons()}</span>
              </p>
            )}
          </div>
        )}

        {statusMessage && (
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 text-sm text-center">
            ℹ️ {statusMessage}
          </div>
        )}

        {paymentError && !showModal && (
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            ❌ {paymentError}
          </div>
        )}

        {paymentSuccess && (
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm text-center">
            ✅ Payment successful! Redirecting to dashboard...
          </div>
        )}

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
            {user?.role === "FREE" || !user?.role ? (
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
                Free
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
            {isProOrSchool ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md cursor-default"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => openPaymentModal("pro")}
                disabled={loading}
                className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 disabled:opacity-50 transition-colors"
              >
                {loading ? "Processing..." : "🚀 Upgrade to Pro"}
              </button>
            )}
            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure mobile-money payment via Lipila
            </p>
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
            {user?.role === "SCHOOL" ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md cursor-default"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() => openPaymentModal("school")}
                disabled={loading}
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "Processing..." : "🏫 Contact Sales"}
              </button>
            )}
            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure mobile-money payment via Lipila
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/dashboard" className="text-primary hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {selectedPlan === "school" ? "School" : "Pro"} Plan
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Amount: <span className="font-bold">ZMW {selectedPlan === "school" ? "500" : "150"}</span> per month
            </p>

            {paymentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                ❌ {paymentError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number (Lipila)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g., 260977123456"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary"
                disabled={loading}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your mobile money phone number (Zambia only)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpgrade(selectedPlan)}
                disabled={loading || !phoneNumber}
                className="flex-1 bg-yellow-500 text-black px-4 py-2 rounded-md hover:bg-yellow-400 disabled:opacity-50 transition-colors"
              >
                {loading ? "Processing..." : "Pay Now"}
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-3 text-center">
              🔒 Your payment is secure and processed by Lipila
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

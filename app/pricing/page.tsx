"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Provider = "MTN" | "AIRTEL" | "ZAMTEL";

const plans = {
  pro: {
    name: "Pro",
    amount: 150,
  },
  school: {
    name: "School",
    amount: 500,
  },
};

export default function PricingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState<Provider>("MTN");

  const [selectedPlan, setSelectedPlan] =
    useState<"pro" | "school">("pro");

  const [showModal, setShowModal] = useState(false);

  /*
   * API URL
   */
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "";

  /*
   * GET CURRENT USER
   */
  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setUser(data);
        } else {
          router.push("/login");
        }
      } catch (error) {
        console.error(
          "❌ User fetch error:",
          error
        );
      }
    };

    fetchUser();
  }, [router, API_URL]);

  /*
   * NORMALIZE ZAMBIAN PHONE NUMBER
   *
   * Accepts:
   * 0976638676
   * +260976638676
   * 260976638676
   */
  function normalizePhone(phone: string) {
    let value = phone
      .trim()
      .replace(/\s+/g, "")
      .replace(/-/g, "");

    if (value.startsWith("+260")) {
      value = value.substring(1);
    }

    if (value.startsWith("0") && value.length === 10) {
      value = `260${value.substring(1)}`;
    }

    if (
      !/^260[0-9]{9}$/.test(value)
    ) {
      throw new Error(
        "Please enter a valid Zambian phone number, e.g. 260976638676."
      );
    }

    return value;
  }

  /*
   * START PAYMENT
   */
  const handleUpgrade = async () => {
    setPaymentError("");
    setPaymentSuccess(false);

    let cleanNumber: string;

    try {
      cleanNumber = normalizePhone(phoneNumber);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Invalid phone number."
      );
      return;
    }

    setLoading(true);
    setStatusMessage(
      "⏳ Initiating payment..."
    );

    try {
      const token =
        localStorage.getItem("token");

      if (!token) {
        router.push("/login");
        return;
      }

      const selected = plans[selectedPlan];

      /*
       * IMPORTANT:
       * This is the exact object sent to backend.
       */
      const paymentRequest = {
        plan: selectedPlan,
        phoneNumber: cleanNumber,
        amount: selected.amount,
        provider,
      };

      console.log(
        "📤 PAYMENT REQUEST:",
        paymentRequest
      );

      const response = await fetch(
        `${API_URL}/api/payments/initiate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(
            paymentRequest
          ),
        }
      );

      const data =
        await response.json().catch(
          () => ({})
        );

      console.log(
        "📥 PAYMENT RESPONSE:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Payment initiation failed."
        );
      }

      /*
       * Backend returns transactionId
       * at the top level.
       */
      if (!data.transactionId) {
        throw new Error(
          "Payment started but no transaction ID was returned."
        );
      }

      setStatusMessage(
        "📱 Payment request sent. Please approve the payment on your phone."
      );

      /*
       * Start checking payment status.
       */
      pollPaymentStatus(
        data.transactionId,
        selected.name
      );
    } catch (error) {
      console.error(
        "❌ PAYMENT ERROR:",
        error
      );

      setPaymentError(
        error instanceof Error
          ? error.message
          : "Unable to start payment."
      );

      setStatusMessage("");
      setLoading(false);
    }
  };

  /*
   * CHECK PAYMENT STATUS
   *
   * IMPORTANT:
   * Backend route is:
   *
   * GET /api/payments/status/:transactionId
   */
  const pollPaymentStatus = (
    transactionId: string,
    planName: string
  ) => {
    const token =
      localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return;
    }

    const maxAttempts = 30;
    let attempts = 0;

    setStatusMessage(
      "⏳ Waiting for payment confirmation..."
    );

    const checkStatus = setInterval(
      async () => {
        try {
          console.log(
            "🔎 Checking payment:",
            transactionId
          );

          const response = await fetch(
            `${API_URL}/api/payments/status/${transactionId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          const data =
            await response.json().catch(
              () => ({})
            );

          console.log(
            "📥 STATUS RESPONSE:",
            data
          );

          if (response.ok) {
            /*
             * Backend returns:
             *
             * {
             *   transactionId,
             *   status,
             *   ...
             * }
             */
            const paymentStatus =
              String(
                data.status || ""
              ).toLowerCase();

            if (
              paymentStatus ===
                "completed" ||
              paymentStatus === "success" ||
              paymentStatus === "paid"
            ) {
              clearInterval(
                checkStatus
              );

              setPaymentSuccess(true);

              setStatusMessage(
                `✅ Payment successful! Your ${planName} plan is now active.`
              );

              setLoading(false);
              setShowModal(false);

              /*
               * Refresh dashboard after payment.
               */
              setTimeout(() => {
                router.push(
                  "/dashboard"
                );
              }, 2000);

              return;
            }

            if (
              paymentStatus ===
                "failed" ||
              paymentStatus ===
                "cancelled" ||
              paymentStatus ===
                "expired"
            ) {
              clearInterval(
                checkStatus
              );

              setPaymentError(
                "❌ Payment failed or was cancelled. Please try again."
              );

              setStatusMessage("");
              setLoading(false);

              return;
            }
          }

          attempts++;

          if (
            attempts >= maxAttempts
          ) {
            clearInterval(
              checkStatus
            );

            setPaymentError(
              "Payment is taking too long. Please check your mobile money transaction and try again if necessary."
            );

            setStatusMessage("");
            setLoading(false);
          }
        } catch (error) {
          console.error(
            "❌ Status check error:",
            error
          );

          attempts++;

          if (
            attempts >= maxAttempts
          ) {
            clearInterval(
              checkStatus
            );

            setPaymentError(
              "Unable to confirm payment status."
            );

            setStatusMessage("");
            setLoading(false);
          }
        }
      },
      3000
    );
  };

  /*
   * OPEN PAYMENT MODAL
   */
  const openPaymentModal = (
    plan: "pro" | "school"
  ) => {
    setSelectedPlan(plan);
    setPhoneNumber("");
    setProvider("MTN");
    setPaymentError("");
    setPaymentSuccess(false);
    setStatusMessage("");
    setShowModal(true);
  };

  /*
   * CLOSE MODAL
   */
  const closeModal = () => {
    if (loading) return;

    setShowModal(false);
    setPhoneNumber("");
    setProvider("MTN");
    setPaymentError("");
    setStatusMessage("");
  };

  /*
   * REMAINING LESSONS
   */
  const getRemainingLessons = () => {
    if (!user) return 0;

    if (
      user.role === "PRO" ||
      user.role === "SCHOOL"
    ) {
      return "♾️ Unlimited";
    }

    return (
      (user.lessonsLimit || 5) -
      (user.lessonsUsed || 0)
    );
  };

  const isProOrSchool =
    user?.role === "PRO" ||
    user?.role === "SCHOOL";

  const currentPlan =
    plans[selectedPlan];

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <h1 className="text-3xl font-bold text-primary text-center">
          Choose Your Plan
        </h1>

        <p className="text-gray-600 text-center mt-2">
          Start free with 5 lessons per month.
          Upgrade when you need more!
        </p>

        {/* CURRENT PLAN */}
        {user && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-500">
              Current Plan:{" "}
              <span className="font-semibold text-primary uppercase">
                {user.role || "FREE"}
              </span>
            </p>

            <p className="text-sm text-gray-500">
              Lessons used this month:{" "}
              <span className="font-semibold">
                {user.lessonsUsed || 0}
              </span>

              {user.role !== "PRO" &&
                user.role !== "SCHOOL" &&
                ` / ${
                  user.lessonsLimit || 5
                }`}
            </p>

            {user.role !== "PRO" &&
              user.role !== "SCHOOL" && (
                <p className="text-sm text-gray-500">
                  Remaining lessons:{" "}
                  <span className="font-semibold text-secondary">
                    {getRemainingLessons()}
                  </span>
                </p>
              )}
          </div>
        )}

        {/* STATUS */}
        {statusMessage && (
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 text-sm text-center">
            {statusMessage}
          </div>
        )}

        {/* ERROR */}
        {paymentError &&
          !showModal && (
            <div className="max-w-2xl mx-auto mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {paymentError}
            </div>
          )}

        {/* SUCCESS */}
        {paymentSuccess && (
          <div className="max-w-2xl mx-auto mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm text-center">
            ✅ Payment successful! Redirecting
            to dashboard...
          </div>
        )}

        {/* PLANS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

          {/* FREE */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold">
              Free
            </h2>

            <p className="text-3xl font-bold text-primary mt-2">
              ZMW 0
            </p>

            <p className="text-sm text-gray-500">
              Per month
            </p>

            <ul className="mt-4 space-y-2">
              <li>✅ 5 lessons per month</li>
              <li>✅ 3 schemes per term</li>
              <li>✅ Basic templates</li>
              <li className="text-gray-400">
                ❌ Export to Word/PDF
              </li>
              <li className="text-gray-400">
                ❌ Assessment weeks
              </li>
              <li className="text-gray-400">
                ❌ Priority support
              </li>
            </ul>

            {user?.role === "FREE" ||
            !user?.role ? (
              <button
                className="mt-4 w-full py-2 border border-gray-300 rounded-md text-gray-500"
                disabled
              >
                ✅ Current Plan
              </button>
            ) : (
              <button
                className="mt-4 w-full bg-gray-200 text-gray-500 py-2 rounded-md"
                disabled
              >
                Free
              </button>
            )}
          </div>

          {/* PRO */}
          <div className="bg-white p-6 rounded-xl shadow-md border-2 border-secondary relative">

            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-black text-xs px-3 py-1 rounded-full font-semibold">
              MOST POPULAR
            </span>

            <h2 className="text-xl font-bold">
              Pro
            </h2>

            <p className="text-3xl font-bold text-primary mt-2">
              ZMW 150
            </p>

            <p className="text-sm text-gray-500">
              Per month
            </p>

            <ul className="mt-4 space-y-2">
              <li>✅ Unlimited lessons</li>
              <li>✅ Unlimited schemes</li>
              <li>✅ All templates</li>
              <li>✅ Export to Word/PDF</li>
              <li>✅ Assessment weeks</li>
              <li>✅ Priority support</li>
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
                onClick={() =>
                  openPaymentModal("pro")
                }
                disabled={loading}
                className="mt-4 w-full bg-yellow-500 text-black py-2 rounded-md hover:bg-yellow-400 disabled:opacity-50 transition-colors"
              >
                {loading
                  ? "Processing..."
                  : "🚀 Upgrade to Pro"}
              </button>
            )}

            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure mobile-money payment via
              Lipila
            </p>
          </div>

          {/* SCHOOL */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">

            <h2 className="text-xl font-bold">
              School
            </h2>

            <p className="text-3xl font-bold text-primary mt-2">
              ZMW 500
            </p>

            <p className="text-sm text-gray-500">
              Per month
            </p>

            <ul className="mt-4 space-y-2">
              <li>✅ Up to 10 teachers</li>
              <li>✅ All Pro features</li>
              <li>✅ Admin dashboard</li>
              <li>✅ Bulk reporting</li>
              <li>✅ Dedicated support</li>
            </ul>

            {user?.role === "SCHOOL" ? (
              <button
                className="mt-4 w-full bg-green-500 text-white py-2 rounded-md"
                disabled
              >
                ✅ Active
              </button>
            ) : (
              <button
                onClick={() =>
                  openPaymentModal("school")
                }
                disabled={loading}
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                {loading
                  ? "Processing..."
                  : "🏫 Upgrade to School"}
              </button>
            )}

            <p className="text-xs text-gray-400 mt-2 text-center">
              🔒 Secure mobile-money payment via
              Lipila
            </p>
          </div>
        </div>

        {/* BACK */}
        <div className="text-center mt-8">
          <Link
            href="/dashboard"
            className="text-primary hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

          <div className="bg-white rounded-lg p-6 max-w-md w-full">

            {/* TITLE */}
            <div className="flex justify-between items-center mb-4">

              <h2 className="text-xl font-bold">
                {currentPlan.name} Plan
              </h2>

              <button
                onClick={closeModal}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* AMOUNT */}
            <p className="text-gray-600 mb-4">
              Amount:{" "}
              <span className="font-bold">
                ZMW {currentPlan.amount}
              </span>{" "}
              per month
            </p>

            {/* ERROR */}
            {paymentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                ❌ {paymentError}
              </div>
            )}

            {/* PHONE */}
            <div className="mb-4">
              <label
                htmlFor="phoneNumber"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Mobile Money Phone Number
              </label>

              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(
                    e.target.value
                  )
                }
                placeholder="0976638676"
                className="w-full px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary"
                disabled={loading}
                required
              />

              <p className="text-xs text-gray-500 mt-1">
                Example: 0976638676,
                260976638676 or
                +260976638676
              </p>
            </div>

            {/* PROVIDER */}
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
                  setProvider(
                    e.target.value as Provider
                  )
                }
                disabled={loading}
                className="w-full px-3 py-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                <option value="MTN">
                  MTN Mobile Money
                </option>

                <option value="AIRTEL">
                  Airtel Money
                </option>

                <option value="ZAMTEL">
                  Zamtel Money
                </option>
              </select>
            </div>

            {/* PAYMENT SUMMARY */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">

              <div className="flex justify-between">
                <span className="text-gray-600">
                  Plan
                </span>

                <span className="font-bold">
                  {currentPlan.name}
                </span>
              </div>

              <div className="flex justify-between mt-2">
                <span className="text-gray-600">
                  Provider
                </span>

                <span className="font-bold">
                  {provider}
                </span>
              </div>

              <div className="flex justify-between mt-2">
                <span className="text-gray-600">
                  Amount
                </span>

                <span className="font-bold">
                  ZMW {currentPlan.amount}
                </span>
              </div>
            </div>

            {/* BUTTONS */}
            <div className="flex gap-3">

              <button
                type="button"
                onClick={closeModal}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleUpgrade}
                disabled={
                  loading ||
                  !phoneNumber
                }
                className="flex-1 bg-yellow-500 text-black px-4 py-3 rounded-md hover:bg-yellow-400 disabled:opacity-50 transition-colors font-semibold"
              >
                {loading
                  ? "Processing..."
                  : `Pay ZMW ${currentPlan.amount}`}
              </button>
            </div>

            {/* FOOTER */}
            <p className="text-xs text-gray-400 mt-3 text-center">
              🔒 Your payment is secure and
              processed by Lipila
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

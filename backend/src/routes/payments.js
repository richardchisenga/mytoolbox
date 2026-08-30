const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

/* =========================================================
   LIPILA CONFIGURATION
========================================================= */

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL ||
  "https://console.lipila.tech/api/v1";

/* =========================================================
   PLANS
========================================================= */

const pricing = {
  pro: {
    amount: 150,
    label: "Pro Plan",
  },

  school: {
    amount: 500,
    label: "School Plan",
  },
};

/* =========================================================
   PROVIDER MAPPING
=========================================================

   Frontend sends:

   MTN
   AIRTEL
   ZAMTEL

   Backend sends to Lipila:

   MTN_MOMO_ZMB
   AIRTEL_OAPI_ZMB
   ZAMTEL_ZMB
========================================================= */

function getLipilaProvider(provider) {
  const value = String(provider || "")
    .trim()
    .toUpperCase();

  if (value === "MTN") {
    return "MTN_MOMO_ZMB";
  }

  if (value === "AIRTEL") {
    return "AIRTEL_OAPI_ZMB";
  }

  if (value === "ZAMTEL") {
    return "ZAMTEL_ZMB";
  }

  return null;
}

/* =========================================================
   VALIDATION
========================================================= */

const paymentSchema = z.object({
  plan: z.string().trim().min(2),

  phoneNumber: z
    .string()
    .trim()
    .min(9),

  provider: z
    .string()
    .trim()
    .min(2),
});

/* =========================================================
   NORMALIZE PLAN
========================================================= */

function normalizePlan(plan) {
  return String(plan || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
   NORMALIZE PHONE
========================================================= */

function normalizePhone(phone) {
  let value = String(phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  /*
   * +260976638676
   * ->
   * 260976638676
   */

  if (value.startsWith("+260")) {
    value = value.substring(1);
  }

  /*
   * 0976638676
   * ->
   * 260976638676
   */

  if (value.startsWith("0")) {
    if (value.length !== 10) {
      throw new Error(
        "Enter a valid 10-digit Zambian mobile number."
      );
    }

    value = "260" + value.substring(1);
  }

  /*
   * 260976638676
   */

  if (!/^260\d{9}$/.test(value)) {
    throw new Error(
      "Enter a valid Zambian mobile money number."
    );
  }

  return value;
}

/* =========================================================
   ACTIVATE SUBSCRIPTION
========================================================= */

async function activateSubscription(tx, payment) {
  const now = new Date();

  const currentUser =
    await tx.user.findUnique({
      where: {
        id: payment.userId,
      },

      select: {
        subscriptionEndsAt: true,
      },
    });

  const baseDate =
    currentUser &&
    currentUser.subscriptionEndsAt &&
    currentUser.subscriptionEndsAt > now
      ? currentUser.subscriptionEndsAt
      : now;

  const subscriptionEndsAt =
    new Date(baseDate);

  subscriptionEndsAt.setMonth(
    subscriptionEndsAt.getMonth() + 1
  );

  return tx.user.update({
    where: {
      id: payment.userId,
    },

    data: {
      role: payment.plan,

      lessonsLimit: 999999,

      lessonsUsed: 0,

      lastResetAt: now,

      subscriptionEndsAt,
    },
  });
}

/* =========================================================
   INITIATE PAYMENT

   POST /api/payments/initiate
========================================================= */

router.post(
  "/initiate",
  authenticate,
  async (req, res) => {
    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "📥 PAYMENT REQUEST RECEIVED"
    );
    console.log(
      "=========================================="
    );

    console.log(
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    try {
      /* =====================================================
         VALIDATE REQUEST
      ===================================================== */

      const input =
        paymentSchema.parse(
          req.body
        );

      /* =====================================================
         CHECK LIPILA CONFIG
      ===================================================== */

      if (
        !process.env.LIPILA_API_KEY
      ) {
        console.error(
          "❌ LIPILA_API_KEY is missing."
        );

        return res.status(503).json({
          error:
            "Lipila API key is not configured.",
        });
      }

      if (
        !process.env.LIPILA_WALLET_ID
      ) {
        console.error(
          "❌ LIPILA_WALLET_ID is missing."
        );

        return res.status(503).json({
          error:
            "Lipila wallet ID is not configured.",
        });
      }

      /* =====================================================
         PLAN
      ===================================================== */

      const plan =
        normalizePlan(
          input.plan
        );

      console.log(
        "📋 Plan:",
        plan
      );

      const selectedPlan =
        pricing[plan];

      if (!selectedPlan) {
        return res.status(400).json({
          error:
            "Invalid payment plan.",
          received:
            input.plan,
          supported:
            ["pro", "school"],
        });
      }

      /* =====================================================
         PHONE
      ===================================================== */

      let payer;

      try {
        payer =
          normalizePhone(
            input.phoneNumber
          );
      } catch (phoneError) {
        console.error(
          "❌ PHONE ERROR:",
          phoneError.message
        );

        return res.status(400).json({
          error:
            phoneError.message,
        });
      }

      console.log(
        "📱 Payer:",
        payer
      );

      /* =====================================================
         PROVIDER
      ===================================================== */

      const providerReceived =
        input.provider;

      const providerNormalized =
        String(
          providerReceived || ""
        )
          .trim()
          .toUpperCase();

      console.log(
        "📡 Provider received:",
        providerReceived
      );

      console.log(
        "📡 Provider normalized:",
        providerNormalized
      );

      /*
       * THIS IS THE IMPORTANT FIX.
       *
       * Do not use:
       *
       * providers[input.provider]
       *
       * We explicitly convert it.
       */

      const lipilaProvider =
        getLipilaProvider(
          providerNormalized
        );

      console.log(
        "📡 Lipila provider:",
        lipilaProvider
      );

      /* =====================================================
         PROVIDER VALIDATION
      ===================================================== */

      if (!lipilaProvider) {
        console.error(
          "❌ UNSUPPORTED PROVIDER"
        );

        return res.status(400).json({
          error:
            "Unsupported mobile money provider.",

          received:
            providerReceived,

          normalized:
            providerNormalized,

          supported: [
            "MTN",
            "AIRTEL",
            "ZAMTEL",
          ],
        });
      }

      /* =====================================================
         INTERNAL PAYMENT IDS
      ===================================================== */

      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      console.log(
        "🔖 Reference:",
        referenceId
      );

      console.log(
        "🔖 Transaction:",
        transactionId
      );

      /* =====================================================
         CREATE DATABASE PAYMENT
      ===================================================== */

      const payment =
        await prisma.payment.create({
          data: {
            userId:
              req.userId,

            amount:
              selectedPlan.amount,

            plan:
              plan.toUpperCase(),

            currency:
              "ZMW",

            provider:
              "lipila",

            phoneNumber:
              payer,

            referenceId:
              referenceId,

            transactionId:
              transactionId,

            status:
              "pending",

            expiresAt:
              new Date(
                Date.now() +
                  30 * 60 * 1000
              ),
          },
        });

      console.log(
        "✅ Payment created:",
        payment.id
      );

      /* =====================================================
         LIPILA URL
      ===================================================== */

      const lipilaUrl =
        `${LIPILA_API_BASE}` +
        `/payments/mobile-money/` +
        `${process.env.LIPILA_WALLET_ID}/`;

      console.log(
        "🌐 Lipila URL:",
        lipilaUrl
      );

      /* =====================================================
         LIPILA PAYLOAD
      ===================================================== */

      const lipilaPayload = {
        reference:
          referenceId,

        amount:
          String(
            selectedPlan.amount
          ),

        payer:
          payer,

        provider:
          lipilaProvider,

        payer_message:
          `MyToolbox ${selectedPlan.label}`,

        metadata: {
          transactionId:
            transactionId,

          userId:
            req.userId,

          plan:
            plan.toUpperCase(),
        },
      };

      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        "📤 SENDING TO LIPILA"
      );
      console.log(
        "=========================================="
      );

      console.log(
        JSON.stringify(
          lipilaPayload,
          null,
          2
        )
      );

      /* =====================================================
         CALL LIPILA
      ===================================================== */

      let response;

      try {
        response =
          await fetch(
            lipilaUrl,
            {
              method: "POST",

              headers: {
                "x-api-key":
                  process.env
                    .LIPILA_API_KEY,

                "X-API-KEY":
                  process.env
                    .LIPILA_API_KEY,

                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",
              },

              body:
                JSON.stringify(
                  lipilaPayload
                ),
            }
          );
      } catch (networkError) {
        console.error(
          "❌ LIPILA CONNECTION ERROR"
        );

        console.error(
          networkError
        );

        await prisma.payment.update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "failed",
          },
        });

        return res.status(502).json({
          error:
            "Unable to connect to Lipila. Please try again.",
        });
      }

      /* =====================================================
         READ LIPILA RESPONSE
      ===================================================== */

      const responseText =
        await response.text();

      let lipilaData = {};

      if (responseText) {
        try {
          lipilaData =
            JSON.parse(
              responseText
            );
        } catch (parseError) {
          lipilaData = {
            raw:
              responseText,
          };
        }
      }

      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        "📥 LIPILA RESPONSE"
      );
      console.log(
        "=========================================="
      );

      console.log(
        "HTTP:",
        response.status
      );

      console.log(
        JSON.stringify(
          lipilaData,
          null,
          2
        )
      );

      /* =====================================================
         LIPILA REJECTED REQUEST
      ===================================================== */

      if (!response.ok) {
        console.error(
          "❌ LIPILA REJECTED PAYMENT"
        );

        await prisma.payment.update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "failed",
          },
        });

        return res.status(502).json({
          error:
            lipilaData?.message ||
            lipilaData?.detail ||
            lipilaData?.error ||
            "Lipila payment could not be started.",

          lipilaStatus:
            response.status,

          lipilaResponse:
            lipilaData,
        });
      }

      /* =====================================================
         EXTERNAL TRANSACTION ID
      ===================================================== */

      const externalId =
        lipilaData?.transaction_id ||
        lipilaData?.transactionId ||
        lipilaData?.identifier ||
        lipilaData?.id ||
        null;

      await prisma.payment.update({
        where: {
          id:
            payment.id,
        },

        data: {
          externalId:
            externalId,
        },
      });

      /* =====================================================
         SUCCESS
      ===================================================== */

      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        "✅ PAYMENT REQUEST SENT TO LIPILA"
      );
      console.log(
        "=========================================="
      );

      return res.json({
        success: true,

        paymentId:
          payment.id,

        transactionId:
          transactionId,

        referenceId:
          referenceId,

        externalId:
          externalId,

        amount:
          selectedPlan.amount,

        plan:
          plan.toUpperCase(),

        provider:
          providerNormalized,

        lipilaProvider:
          lipilaProvider,

        status:
          "pending",

        instructions:
          lipilaData?.message ||
          lipilaData?.detail ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      console.error("");
      console.error(
        "=========================================="
      );
      console.error(
        "❌ PAYMENT INITIATION ERROR"
      );
      console.error(
        "=========================================="
      );
      console.error(
        error
      );

      if (
        error instanceof
        z.ZodError
      ) {
        return res.status(400).json({
          error:
            "Invalid payment request.",

          details:
            error.errors,
        });
      }

      return res.status(500).json({
        error:
          error?.message ||
          "Payment initiation failed.",
      });
    }
  }
);

/* =========================================================
   PAYMENT STATUS

   GET /api/payments/status/:transactionId
========================================================= */

router.get(
  "/status/:transactionId",
  authenticate,
  async (req, res) => {
    try {
      const transactionId =
        req.params.transactionId;

      const payment =
        await prisma.payment.findUnique({
          where: {
            transactionId:
              transactionId,
          },
        });

      if (!payment) {
        return res.status(404).json({
          error:
            "Transaction not found.",
        });
      }

      if (
        payment.userId !==
        req.userId
      ) {
        return res.status(403).json({
          error:
            "Unauthorized.",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id:
              req.userId,
          },

          select: {
            role: true,

            subscriptionEndsAt:
              true,
          },
        });

      return res.json({
        transactionId:
          payment.transactionId,

        referenceId:
          payment.referenceId,

        externalId:
          payment.externalId,

        status:
          payment.status,

        amount:
          payment.amount,

        plan:
          payment.plan,

        provider:
          payment.provider,

        phoneNumber:
          payment.phoneNumber,

        createdAt:
          payment.createdAt,

        completedAt:
          payment.completedAt ||
          null,

        userRole:
          user?.role ||
          null,

        isUpgraded:
          ["PRO", "SCHOOL"].includes(
            user?.role
          ),

        subscriptionEndsAt:
          user?.subscriptionEndsAt ||
          null,
      });
    } catch (error) {
      console.error(
        "❌ Payment status error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to get payment status.",
      });
    }
  }
);

/* =========================================================
   PAYMENT HISTORY

   GET /api/payments/history
========================================================= */

router.get(
  "/history",
  authenticate,
  async (req, res) => {
    try {
      const payments =
        await prisma.payment.findMany({
          where: {
            userId:
              req.userId,
          },

          orderBy: {
            createdAt:
              "desc",
          },
        });

      return res.json({
        payments:
          payments,
      });
    } catch (error) {
      console.error(
        "❌ Payment history error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to get payment history.",
      });
    }
  }
);

/* =========================================================
   LIPILA WEBHOOK

   POST /api/payments/webhook
========================================================= */

router.post(
  "/webhook",
  async (req, res) => {
    try {
      const body =
        req.body || {};

      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        "📥 LIPILA WEBHOOK"
      );
      console.log(
        "=========================================="
      );

      console.log(
        JSON.stringify(
          body,
          null,
          2
        )
      );

      const event =
        body.event ||
        "";

      const data =
        body.data ||
        body;

      const referenceId =
        data.reference ||
        data.referenceId ||
        data.reference_id;

      if (!referenceId) {
        console.log(
          "ℹ️ Webhook has no reference."
        );

        return res.status(200).json({
          received:
            true,
        });
      }

      const payment =
        await prisma.payment.findUnique({
          where: {
            referenceId:
              referenceId,
          },
        });

      if (!payment) {
        console.log(
          "ℹ️ Unknown payment:",
          referenceId
        );

        return res.status(200).json({
          received:
            true,
        });
      }

      if (
        payment.status ===
        "completed"
      ) {
        return res.status(200).json({
          received:
            true,
        });
      }

      const status =
        String(
          data.status ||
          data.payment_status ||
          event ||
          ""
        )
          .trim()
          .toLowerCase();

      console.log(
        "Webhook status:",
        status
      );

      /* =====================================================
         SUCCESS STATUSES
      ===================================================== */

      const completed =
        status === "completed" ||
        status === "success" ||
        status === "successful" ||
        status === "paid" ||
        status === "successful_payment" ||
        event ===
          "deposit.completed";

      /* =====================================================
         FAILED STATUSES
      ===================================================== */

      const failed =
        status === "failed" ||
        status === "failure" ||
        status === "cancelled" ||
        status === "canceled" ||
        status === "expired" ||
        event ===
          "deposit.failed";

      /* =====================================================
         COMPLETED
      ===================================================== */

      if (completed) {
        await prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.payment.updateMany({
                where: {
                  id:
                    payment.id,

                  status:
                    "pending",
                },

                data: {
                  status:
                    "completed",

                  completedAt:
                    new Date(),

                  externalId:
                    data.transaction_id ||
                    data.transactionId ||
                    data.identifier ||
                    data.id ||
                    payment.externalId,
                },
              });

            if (
              updated.count > 0
            ) {
              await activateSubscription(
                tx,
                payment
              );

              console.log(
                "✅ Subscription activated:",
                payment.userId
              );
            }
          }
        );
      }

      /* =====================================================
         FAILED
      ===================================================== */

      else if (failed) {
        await prisma.payment.update({
          where: {
            id:
              payment.id,
          },

          data: {
            status:
              "failed",

            externalId:
              data.transaction_id ||
              data.transactionId ||
              data.identifier ||
              data.id ||
              payment.externalId,
          },
        });

        console.log(
          "❌ Payment marked failed:",
          payment.referenceId
        );
      }

      /* =====================================================
         ACKNOWLEDGE LIPILA
      ===================================================== */

      return res.status(200).json({
        received:
          true,
      });
    } catch (error) {
      console.error(
        "❌ Lipila webhook error:",
        error
      );

      return res.status(500).json({
        error:
          "Webhook processing failed.",
      });
    }
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL ||
  "https://console.lipila.tech/api/v1";

/*
 * ============================================================
 * PLANS
 * ============================================================
 */

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

/*
 * ============================================================
 * FRONTEND PROVIDER -> LIPILA PROVIDER
 *
 * IMPORTANT:
 * Frontend sends:
 *   MTN
 *   AIRTEL
 *   ZAMTEL
 *
 * Lipila requires:
 *   MTN_MOMO_ZMB
 *   AIRTEL_OAPI_ZMB
 *   ZAMTEL_ZMB
 * ============================================================
 */

const providers = {
  MTN: "MTN_MOMO_ZMB",
  AIRTEL: "AIRTEL_OAPI_ZMB",
  ZAMTEL: "ZAMTEL_ZMB",
};

/*
 * ============================================================
 * VALIDATION
 * ============================================================
 */

const paymentSchema = z.object({
  plan: z.enum([
    "PRO",
    "SCHOOL",
    "pro",
    "school",
  ]),

  phoneNumber: z
    .string()
    .trim()
    .min(9),

  provider: z.enum([
    "MTN",
    "AIRTEL",
    "ZAMTEL",
  ]),
});

/*
 * ============================================================
 * NORMALIZE PLAN
 * ============================================================
 */

function normalizePlan(plan) {
  return String(plan).toLowerCase();
}

/*
 * ============================================================
 * NORMALIZE ZAMBIAN PHONE
 *
 * Accepted:
 *
 * 0976638676
 * 260976638676
 * +260976638676
 *
 * Output:
 *
 * 260976638676
 * ============================================================
 */

function normalizePhone(phone) {
  let value = String(phone)
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (value.startsWith("+260")) {
    value = value.substring(1);
  }

  if (value.startsWith("0")) {
    if (value.length !== 10) {
      throw new Error(
        "Enter a valid 10-digit Zambian phone number."
      );
    }

    value = `260${value.substring(1)}`;
  }

  if (!/^260\d{9}$/.test(value)) {
    throw new Error(
      "Enter a valid Zambian mobile money number."
    );
  }

  return value;
}

/*
 * ============================================================
 * ACTIVATE SUBSCRIPTION
 * ============================================================
 */

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
    currentUser?.subscriptionEndsAt &&
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

/*
 * ============================================================
 * START PAYMENT
 * POST /api/payments/initiate
 * ============================================================
 */

router.post(
  "/initiate",
  authenticate,
  async (req, res) => {
    console.log(
      "📥 Payment request body:",
      req.body
    );

    try {
      /*
       * Validate frontend request
       */
      const input =
        paymentSchema.parse(req.body);

      /*
       * Check Lipila configuration
       */
      if (
        !process.env.LIPILA_API_KEY ||
        !process.env.LIPILA_WALLET_ID
      ) {
        console.error(
          "❌ Lipila environment variables missing."
        );

        return res.status(503).json({
          error:
            "Lipila payments are not configured. Check LIPILA_API_KEY and LIPILA_WALLET_ID.",
        });
      }

      /*
       * Normalize plan
       */
      const plan =
        normalizePlan(input.plan);

      const selectedPlan =
        pricing[plan];

      if (!selectedPlan) {
        return res.status(400).json({
          error:
            "Invalid payment plan.",
        });
      }

      /*
       * Normalize phone
       */
      let payer;

      try {
        payer = normalizePhone(
          input.phoneNumber
        );
      } catch (phoneError) {
        return res.status(400).json({
          error:
            phoneError.message,
        });
      }

      /*
       * Convert frontend provider
       * to Lipila provider
       */
      const lipilaProvider =
        providers[input.provider];

      if (!lipilaProvider) {
        return res.status(400).json({
          error:
            "Unsupported mobile money provider.",
        });
      }

      console.log(
        "📱 Frontend provider:",
        input.provider
      );

      console.log(
        "📱 Lipila provider:",
        lipilaProvider
      );

      console.log(
        "📞 Lipila payer:",
        payer
      );

      console.log(
        "💰 Amount:",
        selectedPlan.amount
      );

      /*
       * Generate IDs
       */
      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      /*
       * Create local payment
       */
      const payment =
        await prisma.payment.create({
          data: {
            userId: req.userId,

            amount:
              selectedPlan.amount,

            plan:
              plan.toUpperCase(),

            currency: "ZMW",

            provider: "lipila",

            phoneNumber: payer,

            referenceId,

            transactionId,

            status: "pending",

            expiresAt:
              new Date(
                Date.now() +
                  30 * 60 * 1000
              ),
          },
        });

      /*
       * ======================================================
       * SEND PAYMENT TO LIPILA
       * ======================================================
       */

      try {
        const lipilaUrl =
          `${LIPILA_API_BASE}` +
          `/payments/mobile-money/` +
          `${process.env.LIPILA_WALLET_ID}/`;

        console.log(
          "🌐 Lipila URL:",
          lipilaUrl
        );

        const lipilaPayload = {
          reference:
            referenceId,

          amount:
            String(
              selectedPlan.amount
            ),

          payer,

          provider:
            lipilaProvider,

          payer_message:
            `MyToolbox ${selectedPlan.label}`,

          metadata: {
            transactionId,

            userId:
              req.userId,

            plan:
              plan.toUpperCase(),
          },
        };

        console.log(
          "📤 Sending to Lipila:",
          {
            ...lipilaPayload,

            /*
             * Do not expose secrets
             */
            payer: payer,
          }
        );

        const response =
          await fetch(
            lipilaUrl,
            {
              method: "POST",

              headers: {
                /*
                 * Lipila documentation uses
                 * x-api-key.
                 */
                "x-api-key":
                  process.env
                    .LIPILA_API_KEY,

                "Content-Type":
                  "application/json",

                Accept:
                  "application/json",
              },

              body: JSON.stringify(
                lipilaPayload
              ),
            }
          );

        const responseText =
          await response.text();

        let data = {};

        try {
          data =
            responseText
              ? JSON.parse(
                  responseText
                )
              : {};
        } catch {
          data = {
            raw: responseText,
          };
        }

        console.log(
          "📥 Lipila response status:",
          response.status
        );

        console.log(
          "📥 Lipila response:",
          data
        );

        /*
         * Lipila rejected request
         */
        if (!response.ok) {
          console.error(
            "❌ Lipila API error:",
            response.status,
            data
          );

          await prisma.payment.update({
            where: {
              id: payment.id,
            },

            data: {
              status: "failed",
            },
          });

          return res.status(502).json({
            error:
              data?.message ||
              data?.detail ||
              data?.error ||
              "Lipila payment could not be started.",

            lipilaStatus:
              response.status,
          });
        }

        /*
         * Save Lipila transaction ID
         */
        const externalId =
          data?.transaction_id ||
          data?.identifier ||
          data?.id ||
          null;

        await prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            externalId,
          },
        });

        /*
         * Return success to frontend
         */
        return res.json({
          success: true,

          paymentId:
            payment.id,

          transactionId,

          referenceId,

          externalId,

          amount:
            selectedPlan.amount,

          plan:
            plan.toUpperCase(),

          provider:
            input.provider,

          lipilaProvider,

          status: "pending",

          instructions:
            data?.message ||
            "Payment request sent. Please approve the payment on your phone.",
        });
      } catch (lipilaError) {
        console.error(
          "❌ Lipila initiation error:",
          lipilaError
        );

        await prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: "failed",
          },
        });

        return res.status(502).json({
          error:
            "Unable to connect to Lipila. Please try again.",
        });
      }
    } catch (error) {
      /*
       * Zod validation
       */
      if (
        error instanceof
        z.ZodError
      ) {
        console.error(
          "❌ Validation error:",
          error.errors
        );

        return res.status(400).json({
          error:
            "Please provide a valid plan, phone number and provider.",

          details:
            error.errors,
        });
      }

      console.error(
        "❌ Payment initiation error:",
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          "Payment initiation failed.",
      });
    }
  }
);

/*
 * ============================================================
 * CHECK PAYMENT STATUS
 * GET /api/payments/status/:transactionId
 * ============================================================
 */

router.get(
  "/status/:transactionId",
  authenticate,
  async (req, res) => {
    try {
      const payment =
        await prisma.payment.findUnique({
          where: {
            transactionId:
              req.params
                .transactionId,
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
            id: req.userId,
          },

          select: {
            role: true,
            subscriptionEndsAt: true,
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

        createdAt:
          payment.createdAt,

        completedAt:
          payment.completedAt ||
          null,

        userRole:
          user?.role || null,

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

/*
 * ============================================================
 * PAYMENT HISTORY
 * GET /api/payments/history
 * ============================================================
 */

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

/*
 * ============================================================
 * LIPILA WEBHOOK
 * POST /api/payments/webhook
 * ============================================================
 */

router.post(
  "/webhook",
  async (req, res) => {
    try {
      const body =
        req.body || {};

      console.log(
        "📥 Lipila webhook received:",
        body
      );

      const event =
        body.event;

      const data =
        body.data ||
        body;

      const referenceId =
        data.reference ||
        data.referenceId;

      /*
       * Always acknowledge unknown webhook
       */
      if (!referenceId) {
        return res.status(200).json({
          received: true,
        });
      }

      const payment =
        await prisma.payment.findUnique({
          where: {
            referenceId,
          },
        });

      /*
       * Payment not from our system
       */
      if (!payment) {
        console.log(
          "ℹ️ Unknown Lipila reference:",
          referenceId
        );

        return res.status(200).json({
          received: true,
        });
      }

      /*
       * Already completed
       */
      if (
        payment.status ===
        "completed"
      ) {
        return res.status(200).json({
          received: true,
        });
      }

      const status =
        String(
          data.status ||
            event ||
            ""
        ).toLowerCase();

      const completed =
        status === "completed" ||
        status === "success" ||
        status === "paid" ||
        event ===
          "deposit.completed";

      const failed =
        status === "failed" ||
        status ===
          "cancelled" ||
        status ===
          "expired" ||
        event ===
          "deposit.failed";

      /*
       * ======================================================
       * COMPLETED
       * ======================================================
       */

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
                    data.id ||
                    payment.externalId,
                },
              });

            /*
             * Only activate once.
             */
            if (
              updated.count > 0
            ) {
              await activateSubscription(
                tx,
                payment
              );

              console.log(
                "✅ Subscription activated for user:",
                payment.userId
              );
            }
          }
        );
      }

      /*
       * ======================================================
       * FAILED
       * ======================================================
       */

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
              data.id ||
              payment.externalId,
          },
        });

        console.log(
          "❌ Payment failed:",
          payment.referenceId
        );
      }

      /*
       * Acknowledge Lipila
       */
      return res.status(200).json({
        received: true,
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

module.exports = router;

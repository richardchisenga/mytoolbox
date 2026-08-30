const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| LIPILA CONFIGURATION
|--------------------------------------------------------------------------
*/

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL ||
  "https://console.lipila.tech/api/v1";

/*
|--------------------------------------------------------------------------
| PLANS
|--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| MOBILE MONEY PROVIDERS
|--------------------------------------------------------------------------
|
| Frontend sends:
|
| MTN
| AIRTEL
| ZAMTEL
|
| We convert them to Lipila's provider codes.
|
*/

const providers = {
  MTN: "MTN_MOMO_ZMB",
  AIRTEL: "AIRTEL_OAPI_ZMB",
  ZAMTEL: "ZAMTEL_ZMB",
};

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
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

  provider: z.string().trim().min(2),
});

/*
|--------------------------------------------------------------------------
| NORMALIZE PLAN
|--------------------------------------------------------------------------
*/

function normalizePlan(plan) {
  return String(plan)
    .trim()
    .toLowerCase();
}

/*
|--------------------------------------------------------------------------
| NORMALIZE PROVIDER
|--------------------------------------------------------------------------
*/

function normalizeProvider(provider) {
  return String(provider)
    .trim()
    .toUpperCase();
}

/*
|--------------------------------------------------------------------------
| NORMALIZE ZAMBIAN PHONE
|--------------------------------------------------------------------------
|
| Accepts:
|
| 0976638676
| 260976638676
| +260976638676
|
| Returns:
|
| 260976638676
|
*/

function normalizePhone(phone) {
  let value = String(phone)
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

    value =
      "260" +
      value.substring(1);
  }

  /*
   * Final validation
   *
   * Zambia number:
   *
   * 260 + 9 digits
   */

  if (!/^260\d{9}$/.test(value)) {
    throw new Error(
      "Enter a valid Zambian mobile money number."
    );
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| ACTIVATE SUBSCRIPTION
|--------------------------------------------------------------------------
*/

async function activateSubscription(
  tx,
  payment
) {
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
|--------------------------------------------------------------------------
| INITIATE PAYMENT
|--------------------------------------------------------------------------
|
| POST
| /api/payments/initiate
|
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
       * Validate request
       */

      const input =
        paymentSchema.parse(
          req.body
        );

      /*
       * Check Lipila credentials
       */

      if (
        !process.env.LIPILA_API_KEY ||
        !process.env.LIPILA_WALLET_ID
      ) {
        console.error(
          "❌ Missing Lipila environment variables."
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
        normalizePlan(
          input.plan
        );

      /*
       * Find plan
       */

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
        payer =
          normalizePhone(
            input.phoneNumber
          );
      } catch (phoneError) {
        console.error(
          "❌ Phone error:",
          phoneError.message
        );

        return res.status(400).json({
          error:
            phoneError.message,
        });
      }

      /*
       * Normalize provider
       */

      const providerKey =
        normalizeProvider(
          input.provider
        );

      /*
       * Convert provider to Lipila code
       */

      const lipilaProvider =
        providers[
          providerKey
        ];

      console.log(
        "🔎 Provider received:",
        input.provider
      );

      console.log(
        "🔎 Provider normalized:",
        providerKey
      );

      console.log(
        "🔎 Lipila provider:",
        lipilaProvider
      );

      /*
       * IMPORTANT
       *
       * If provider is not supported,
       * stop here.
       */

      if (!lipilaProvider) {
        return res.status(400).json({
          error:
            "Unsupported mobile money provider.",

          providerReceived:
            input.provider,

          providerNormalized:
            providerKey,

          supportedProviders: [
            "MTN",
            "AIRTEL",
            "ZAMTEL",
          ],
        });
      }

      /*
       * Generate our internal IDs
       */

      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      /*
       * Create payment in database
       */

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

            referenceId,

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

      /*
       * Lipila URL
       */

      const lipilaUrl =
        `${LIPILA_API_BASE}` +
        `/payments/mobile-money/` +
        `${process.env.LIPILA_WALLET_ID}/`;

      /*
       * Lipila request
       */

      const lipilaPayload = {
        reference:
          referenceId,

        amount:
          String(
            selectedPlan.amount
          ),

        payer,

        /*
         * THIS IS THE IMPORTANT PART
         *
         * We send:
         *
         * AIRTEL_OAPI_ZMB
         *
         * instead of:
         *
         * AIRTEL
         */

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
        "🌐 Lipila URL:",
        lipilaUrl
      );

      console.log(
        "📤 Sending payment to Lipila:",
        lipilaPayload
      );

      /*
       * Send request to Lipila
       */

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
          "❌ Cannot connect to Lipila:",
          networkError
        );

        await prisma.payment.update({
          where: {
            id: payment.id,
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

      /*
       * Read Lipila response
       */

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
        "📥 Lipila status:",
        response.status
      );

      console.log(
        "📥 Lipila response:",
        data
      );

      /*
       * Lipila rejected payment
       */

      if (!response.ok) {
        console.error(
          "❌ Lipila rejected payment:",
          response.status,
          data
        );

        await prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status:
              "failed",
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

          lipilaResponse:
            data,
        });
      }

      /*
       * Save external Lipila ID
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
       * Return successful initiation
       */

      console.log(
        "✅ Lipila payment initiated successfully."
      );

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
          providerKey,

        lipilaProvider,

        status:
          "pending",

        instructions:
          data?.message ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      /*
       * Validation error
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

      /*
       * General error
       */

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
|--------------------------------------------------------------------------
| PAYMENT STATUS
|--------------------------------------------------------------------------
|
| GET
| /api/payments/status/:transactionId
|
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

/*
|--------------------------------------------------------------------------
| PAYMENT HISTORY
|--------------------------------------------------------------------------
|
| GET
| /api/payments/history
|
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
|--------------------------------------------------------------------------
| LIPILA WEBHOOK
|--------------------------------------------------------------------------
|
| POST
| /api/payments/webhook
|
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

      /*
       * Find our payment reference
       */

      const referenceId =
        data.reference ||
        data.referenceId;

      /*
       * Always acknowledge webhook
       * if there is no reference.
       */

      if (!referenceId) {
        return res.status(200).json({
          received: true,
        });
      }

      /*
       * Find payment
       */

      const payment =
        await prisma.payment.findUnique({
          where: {
            referenceId,
          },
        });

      /*
       * Unknown payment
       */

      if (!payment) {
        console.log(
          "ℹ️ Unknown payment reference:",
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

      /*
       * Normalize status
       */

      const status =
        String(
          data.status ||
            event ||
            ""
        ).toLowerCase();

      /*
       * Successful statuses
       */

      const completed =
        status ===
          "completed" ||
        status ===
          "success" ||
        status ===
          "paid" ||
        event ===
          "deposit.completed";

      /*
       * Failed statuses
       */

      const failed =
        status ===
          "failed" ||
        status ===
          "cancelled" ||
        status ===
          "expired" ||
        event ===
          "deposit.failed";

      /*
       * PAYMENT COMPLETED
       */

      if (completed) {
        await prisma.$transaction(
          async (tx) => {
            /*
             * Update only if still pending.
             */

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
             * Activate subscription
             * only once.
             */

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

      /*
       * PAYMENT FAILED
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

```javascript
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| LIPILA CONFIG
|--------------------------------------------------------------------------
*/

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL ||
  "https://console.lipila.tech/api/v1";

/*
|--------------------------------------------------------------------------
| PRICING
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
| LIPILA PROVIDERS
|--------------------------------------------------------------------------
|
| These are the actual provider codes expected by Lipila.
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
|
| provider is OPTIONAL here because we can infer it from
| the Zambian phone number if the frontend doesn't send it.
|
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

  amount: z
    .union([
      z.number(),
      z.string(),
    ])
    .optional(),

  provider: z
    .string()
    .trim()
    .optional(),
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
  if (!provider) {
    return null;
  }

  return String(provider)
    .trim()
    .toUpperCase();
}

/*
|--------------------------------------------------------------------------
| NORMALIZE PHONE
|--------------------------------------------------------------------------
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
| AUTOMATIC PROVIDER DETECTION
|--------------------------------------------------------------------------
|
| This is a backup.
|
| If frontend sends provider, we use it.
|
| If frontend DOES NOT send provider, we determine
| it from the Zambian mobile number.
|
| Airtel:
| 097 / 097...
|
| MTN:
| 096 / 076...
|
| Zamtel:
| 095 / 075...
|
*/

function detectProviderFromPhone(phone) {
  const localNumber =
    phone.substring(3);

  /*
   * Airtel
   */

  if (
    localNumber.startsWith("97") ||
    localNumber.startsWith("77")
  ) {
    return "AIRTEL";
  }

  /*
   * MTN
   */

  if (
    localNumber.startsWith("96") ||
    localNumber.startsWith("76")
  ) {
    return "MTN";
  }

  /*
   * Zamtel
   */

  if (
    localNumber.startsWith("95") ||
    localNumber.startsWith("75")
  ) {
    return "ZAMTEL";
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| ACTIVATE SUBSCRIPTION
|--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| INITIATE PAYMENT
|--------------------------------------------------------------------------
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
        paymentSchema.parse(req.body);

      /*
       * Check credentials
       */

      if (
        !process.env.LIPILA_API_KEY ||
        !process.env.LIPILA_WALLET_ID
      ) {
        console.error(
          "❌ Lipila credentials missing."
        );

        return res.status(503).json({
          error:
            "Lipila payments are not configured. Check LIPILA_API_KEY and LIPILA_WALLET_ID.",
        });
      }

      /*
       * PLAN
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
       * PHONE
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
       * PROVIDER
       *
       * First use the provider sent by frontend.
       */

      let providerKey =
        normalizeProvider(
          input.provider
        );

      /*
       * If provider is missing, automatically
       * detect it from the phone number.
       */

      if (!providerKey) {
        providerKey =
          detectProviderFromPhone(
            payer
          );

        console.log(
          "🔎 Provider was missing from frontend."
        );

        console.log(
          "🔎 Provider detected from phone:",
          providerKey
        );
      }

      /*
       * Validate provider.
       */

      if (
        !providerKey ||
        !providers[providerKey]
      ) {
        return res.status(400).json({
          error:
            "Unable to determine mobile money provider. Please select MTN, Airtel or Zamtel.",
          phoneNumber: payer,
          providerReceived:
            input.provider || null,
          supportedProviders: [
            "MTN",
            "AIRTEL",
            "ZAMTEL",
          ],
        });
      }

      /*
       * Convert frontend provider to Lipila provider.
       */

      const lipilaProvider =
        providers[providerKey];

      console.log(
        "🔎 Provider received:",
        input.provider || "NOT SENT"
      );

      console.log(
        "🔎 Provider selected:",
        providerKey
      );

      console.log(
        "🔎 Lipila provider:",
        lipilaProvider
      );

      console.log(
        "📱 Payer:",
        payer
      );

      /*
       * Generate internal IDs.
       */

      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      /*
       * Create database payment.
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
       * LIPILA URL
       */

      const lipilaUrl =
        `${LIPILA_API_BASE}/payments/mobile-money/${process.env.LIPILA_WALLET_ID}/`;

      /*
       * LIPILA REQUEST
       */

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

          provider:
            providerKey,
        },
      };

      console.log(
        "🌐 Lipila URL:",
        lipilaUrl
      );

      console.log(
        "📤 Lipila request:",
        lipilaPayload
      );

      /*
       * SEND TO LIPILA
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
                  process.env.LIPILA_API_KEY,

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
          "❌ Lipila connection error:",
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
       * READ RESPONSE
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
        "📥 Lipila HTTP status:",
        response.status
      );

      console.log(
        "📥 Lipila response:",
        data
      );

      /*
       * LIPILA REJECTED
       */

      if (!response.ok) {
        console.error(
          "❌ Lipila rejected payment:",
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

          providerSent:
            lipilaProvider,
        });
      }

      /*
       * SAVE EXTERNAL ID
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
       * SUCCESS
       */

      console.log(
        "✅ Lipila payment initiated."
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

        phoneNumber:
          payer,

        status:
          "pending",

        instructions:
          data?.message ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      /*
       * ZOD ERROR
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
            "Invalid payment request.",

          details:
            error.errors,
        });
      }

      /*
       * GENERAL ERROR
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
              req.params.transactionId,
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
       * Find reference
       */

      const referenceId =
        data.reference ||
        data.referenceId;

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

      if (!payment) {
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
       * STATUS
       */

      const status =
        String(
          data.status ||
            event ||
            ""
        ).toLowerCase();

      /*
       * SUCCESS
       */

      const completed =
        status ===
          "completed" ||
        status ===
          "success" ||
        status ===
          "successful" ||
        status ===
          "paid" ||
        event ===
          "deposit.completed";

      /*
       * FAILED
       */

      const failed =
        status ===
          "failed" ||
        status ===
          "cancelled" ||
        status ===
          "canceled" ||
        status ===
          "expired" ||
        event ===
          "deposit.failed";

      /*
       * COMPLETED
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

      /*
       * FAILED
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
              data.transactionId ||
              data.identifier ||
              data.id ||
              payment.externalId,
          },
        });

        console.log(
          "❌ Payment failed:",
          payment.referenceId
        );
      }

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
```

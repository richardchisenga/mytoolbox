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
| LIPILA PROVIDERS
|--------------------------------------------------------------------------
|
| These are the official Lipila provider codes.
|
*/

const LIPILA_PROVIDERS = {
  MTN: "MTN_MOMO_ZMB",
  AIRTEL: "AIRTEL_OAPI_ZMB",
  ZAMTEL: "ZAMTEL_ZMB",

  // Also accept Lipila codes directly
  MTN_MOMO_ZMB: "MTN_MOMO_ZMB",
  AIRTEL_OAPI_ZMB: "AIRTEL_OAPI_ZMB",
  ZAMTEL_ZMB: "ZAMTEL_ZMB",
};

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

const paymentSchema = z.object({
  plan: z.string().trim().min(2),

  phoneNumber: z.string().trim().min(9),

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
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
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

  if (value.startsWith("+260")) {
    value = value.substring(1);
  }

  if (value.startsWith("0")) {
    if (value.length !== 10) {
      throw new Error(
        "Enter a valid 10-digit Zambian mobile number."
      );
    }

    value =
      "260" + value.substring(1);
  }

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

/*
|--------------------------------------------------------------------------
| INITIATE PAYMENT
|--------------------------------------------------------------------------
|
| POST /api/payments/initiate
|
*/

router.post(
  "/initiate",
  authenticate,
  async (req, res) => {
    console.log(
      "========================================"
    );

    console.log(
      "📥 PAYMENT REQUEST BODY:"
    );

    console.log(req.body);

    console.log(
      "========================================"
    );

    try {
      /*
      |--------------------------------------------------------------------------
      | VALIDATE
      |--------------------------------------------------------------------------
      */

      const input =
        paymentSchema.parse(req.body);

      /*
      |--------------------------------------------------------------------------
      | CHECK LIPILA CONFIGURATION
      |--------------------------------------------------------------------------
      */

      if (!process.env.LIPILA_API_KEY) {
        console.error(
          "❌ LIPILA_API_KEY is missing."
        );

        return res.status(503).json({
          error:
            "Lipila API key is not configured.",
        });
      }

      if (!process.env.LIPILA_WALLET_ID) {
        console.error(
          "❌ LIPILA_WALLET_ID is missing."
        );

        return res.status(503).json({
          error:
            "Lipila wallet ID is not configured.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | PLAN
      |--------------------------------------------------------------------------
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
      |--------------------------------------------------------------------------
      | PHONE
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | PROVIDER
      |--------------------------------------------------------------------------
      */

      const providerReceived =
        input.provider;

      const providerNormalized =
        normalizeProvider(
          providerReceived
        );

      /*
      |--------------------------------------------------------------------------
      | CONVERT TO LIPILA PROVIDER
      |--------------------------------------------------------------------------
      */

      const lipilaProvider =
        LIPILA_PROVIDERS[
          providerNormalized
        ];

      console.log(
        "📱 Provider received:",
        providerReceived
      );

      console.log(
        "📱 Provider normalized:",
        providerNormalized
      );

      console.log(
        "📱 Lipila provider:",
        lipilaProvider
      );

      /*
      |--------------------------------------------------------------------------
      | PROVIDER CHECK
      |--------------------------------------------------------------------------
      */

      if (!lipilaProvider) {
        console.error(
          "❌ UNSUPPORTED PROVIDER"
        );

        console.error(
          "Received:",
          providerReceived
        );

        console.error(
          "Normalized:",
          providerNormalized
        );

        return res.status(400).json({
          error:
            "Unsupported mobile money provider.",

          providerReceived:
            providerReceived,

          providerNormalized:
            providerNormalized,

          supportedProviders: [
            "MTN",
            "AIRTEL",
            "ZAMTEL",
          ],
        });
      }

      /*
      |--------------------------------------------------------------------------
      | CREATE INTERNAL IDs
      |--------------------------------------------------------------------------
      */

      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      /*
      |--------------------------------------------------------------------------
      | CREATE DATABASE PAYMENT
      |--------------------------------------------------------------------------
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
      |--------------------------------------------------------------------------
      | LIPILA URL
      |--------------------------------------------------------------------------
      */

      const lipilaUrl =
        `${LIPILA_API_BASE}/payments/mobile-money/${process.env.LIPILA_WALLET_ID}/`;

      /*
      |--------------------------------------------------------------------------
      | LIPILA PAYLOAD
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | LOG WHAT IS BEING SENT TO LIPILA
      |--------------------------------------------------------------------------
      */

      console.log(
        "========================================"
      );

      console.log(
        "🌐 LIPILA URL:"
      );

      console.log(
        lipilaUrl
      );

      console.log(
        "📤 LIPILA PAYLOAD:"
      );

      console.log(
        JSON.stringify(
          lipilaPayload,
          null,
          2
        )
      );

      console.log(
        "========================================"
      );

      /*
      |--------------------------------------------------------------------------
      | SEND TO LIPILA
      |--------------------------------------------------------------------------
      */

      let response;

      try {
        response =
          await fetch(
            lipilaUrl,
            {
              method: "POST",

              headers: {
                "X-API-KEY":
                  process.env
                    .LIPILA_API_KEY,

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
          "❌ LIPILA CONNECTION ERROR:"
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

      /*
      |--------------------------------------------------------------------------
      | READ RESPONSE
      |--------------------------------------------------------------------------
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
          raw:
            responseText,
        };
      }

      /*
      |--------------------------------------------------------------------------
      | LOG LIPILA RESPONSE
      |--------------------------------------------------------------------------
      */

      console.log(
        "========================================"
      );

      console.log(
        "📥 LIPILA HTTP STATUS:",
        response.status
      );

      console.log(
        "📥 LIPILA RESPONSE:"
      );

      console.log(
        data
      );

      console.log(
        "========================================"
      );

      /*
      |--------------------------------------------------------------------------
      | LIPILA ERROR
      |--------------------------------------------------------------------------
      */

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
            data?.message ||
            data?.detail ||
            data?.error ||
            "Lipila rejected the payment request.",

          lipilaStatus:
            response.status,

          lipilaResponse:
            data,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | SAVE LIPILA TRANSACTION ID
      |--------------------------------------------------------------------------
      */

      const externalId =
        data?.transaction_id ||
        data?.identifier ||
        data?.id ||
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

      /*
      |--------------------------------------------------------------------------
      | SUCCESS
      |--------------------------------------------------------------------------
      */

      console.log(
        "✅ PAYMENT SENT TO LIPILA"
      );

      return res.status(200).json({
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
          data?.message ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      /*
      |--------------------------------------------------------------------------
      | VALIDATION ERROR
      |--------------------------------------------------------------------------
      */

      if (
        error instanceof
        z.ZodError
      ) {
        console.error(
          "❌ VALIDATION ERROR:"
        );

        console.error(
          error.errors
        );

        return res.status(400).json({
          error:
            "Please provide a valid plan, phone number and mobile money provider.",

          details:
            error.errors,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | GENERAL ERROR
      |--------------------------------------------------------------------------
      */

      console.error(
        "❌ PAYMENT INITIATION ERROR:"
      );

      console.error(
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
| CHECK PAYMENT STATUS
|--------------------------------------------------------------------------
|
| GET /api/payments/status/:transactionId
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

      /*
      |--------------------------------------------------------------------------
      | TRY TO CHECK LIPILA DIRECTLY
      |--------------------------------------------------------------------------
      */

      if (
        payment.status ===
        "pending"
      ) {
        try {
          const lipilaStatusUrl =
            `${LIPILA_API_BASE}/payments/${encodeURIComponent(
              payment.referenceId
            )}/`;

          console.log(
            "🔎 Checking Lipila payment:",
            lipilaStatusUrl
          );

          const lipilaResponse =
            await fetch(
              lipilaStatusUrl,
              {
                method: "GET",

                headers: {
                  "X-API-KEY":
                    process.env
                      .LIPILA_API_KEY,

                  "x-api-key":
                    process.env
                      .LIPILA_API_KEY,

                  Accept:
                    "application/json",
                },
              }
            );

          if (
            lipilaResponse.ok
          ) {
            const lipilaData =
              await lipilaResponse
                .json()
                .catch(
                  () => ({})
                );

            const lipilaStatus =
              String(
                lipilaData?.status ||
                  ""
              ).toLowerCase();

            console.log(
              "📥 Lipila status response:",
              lipilaData
            );

            if (
              [
                "completed",
                "success",
                "paid",
              ].includes(
                lipilaStatus
              )
            ) {
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
                          lipilaData?.id ||
                          lipilaData?.transaction_id ||
                          payment.externalId,
                      },
                    });

                  if (
                    updated.count >
                    0
                  ) {
                    await activateSubscription(
                      tx,
                      payment
                    );
                  }
                }
              );

              payment.status =
                "completed";
            }

            if (
              [
                "failed",
                "cancelled",
                "expired",
              ].includes(
                lipilaStatus
              )
            ) {
              await prisma.payment.update({
                where: {
                  id:
                    payment.id,
                },

                data: {
                  status:
                    "failed",

                  externalId:
                    lipilaData?.id ||
                    lipilaData?.transaction_id ||
                    payment.externalId,
                },
              });

              payment.status =
                "failed";
            }
          }
        } catch (statusError) {
          console.error(
            "⚠️ Could not check Lipila status:",
            statusError
          );
        }
      }

      /*
      |--------------------------------------------------------------------------
      | USER
      |--------------------------------------------------------------------------
      */

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
        "❌ PAYMENT STATUS ERROR:",
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
| GET /api/payments/history
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
        "❌ PAYMENT HISTORY ERROR:",
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
| POST /api/payments/webhook
|
*/

router.post(
  "/webhook",
  async (req, res) => {
    try {
      const body =
        req.body || {};

      console.log(
        "========================================"
      );

      console.log(
        "📥 LIPILA WEBHOOK:"
      );

      console.log(
        JSON.stringify(
          body,
          null,
          2
        )
      );

      console.log(
        "========================================"
      );

      const event =
        body?.event;

      const data =
        body?.data ||
        body;

      const referenceId =
        data?.reference ||
        data?.referenceId;

      /*
      |--------------------------------------------------------------------------
      | NO REFERENCE
      |--------------------------------------------------------------------------
      */

      if (!referenceId) {
        return res.status(200).json({
          received: true,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | FIND PAYMENT
      |--------------------------------------------------------------------------
      */

      const payment =
        await prisma.payment.findUnique({
          where: {
            referenceId:
              referenceId,
          },
        });

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
      |--------------------------------------------------------------------------
      | ALREADY COMPLETED
      |--------------------------------------------------------------------------
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
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      const status =
        String(
          data?.status ||
            event ||
            ""
        ).toLowerCase();

      const completed =
        status ===
          "completed" ||
        status ===
          "success" ||
        status ===
          "paid" ||
        event ===
          "deposit.completed";

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
      |--------------------------------------------------------------------------
      | COMPLETED
      |--------------------------------------------------------------------------
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
                    data?.transaction_id ||
                    data?.id ||
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
                "✅ SUBSCRIPTION ACTIVATED"
              );

              console.log(
                "User:",
                payment.userId
              );

              console.log(
                "Plan:",
                payment.plan
              );
            }
          }
        );
      }

      /*
      |--------------------------------------------------------------------------
      | FAILED
      |--------------------------------------------------------------------------
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
              data?.transaction_id ||
              data?.id ||
              payment.externalId,
          },
        });

        console.log(
          "❌ PAYMENT FAILED:",
          payment.referenceId
        );
      }

      /*
      |--------------------------------------------------------------------------
      | ACKNOWLEDGE LIPILA
      |--------------------------------------------------------------------------
      */

      return res.status(200).json({
        received: true,
      });
    } catch (error) {
      console.error(
        "❌ LIPILA WEBHOOK ERROR:",
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

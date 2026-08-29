const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

/*
=========================================================
LIPILA CONFIGURATION
=========================================================
*/

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL ||
  "https://console.lipila.tech/api/v1";

/*
=========================================================
PLANS
=========================================================
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
=========================================================
LIPILA MOBILE MONEY PROVIDERS
=========================================================

Frontend:
MTN
AIRTEL
ZAMTEL

Lipila:
MTN_MOMO_ZMB
AIRTEL_OAPI_ZMB
ZAMTEL_ZMB
*/

const LIPILA_PROVIDERS = {
  MTN: "MTN_MOMO_ZMB",
  AIRTEL: "AIRTEL_OAPI_ZMB",
  ZAMTEL: "ZAMTEL_ZMB",
};

/*
=========================================================
VALIDATION
=========================================================
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
=========================================================
NORMALIZE PLAN
=========================================================
*/

function normalizePlan(plan) {
  return String(plan)
    .trim()
    .toLowerCase();
}

/*
=========================================================
NORMALIZE ZAMBIAN PHONE
=========================================================

0971234567
+260971234567
260971234567

All become:

260971234567
=========================================================
*/

function normalizePhone(phone) {
  let value = String(phone)
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (value.startsWith("+260")) {
    value = value.substring(1);
  }

  if (
    value.startsWith("0") &&
    value.length === 10
  ) {
    value =
      "260" +
      value.substring(1);
  }

  if (
    !/^260\d{9}$/.test(value)
  ) {
    throw new Error(
      "Enter a valid Zambian phone number."
    );
  }

  return value;
}

/*
=========================================================
ACTIVATE SUBSCRIPTION
=========================================================
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
    currentUser.subscriptionEndsAt >
      now
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
=========================================================
START PAYMENT
=========================================================
*/

router.post(
  "/initiate",
  authenticate,
  async (req, res) => {
    let payment = null;

    try {
      /*
      -----------------------------------------------
      LOG WHAT FRONTEND SENT
      -----------------------------------------------
      */

      console.log(
        "📥 PAYMENT REQUEST BODY:",
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      /*
      -----------------------------------------------
      VALIDATE
      -----------------------------------------------
      */

      const input =
        paymentSchema.parse(
          req.body
        );

      console.log(
        "✅ VALIDATED PAYMENT:",
        input
      );

      /*
      -----------------------------------------------
      CHECK LIPILA CONFIG
      -----------------------------------------------
      */

      if (
        !process.env
          .LIPILA_API_KEY ||
        !process.env
          .LIPILA_WALLET_ID
      ) {
        console.error(
          "❌ Lipila API key or wallet ID missing."
        );

        return res.status(503).json({
          success: false,

          error:
            "Lipila payments are not configured yet.",
        });
      }

      /*
      -----------------------------------------------
      PLAN
      -----------------------------------------------
      */

      const plan =
        normalizePlan(
          input.plan
        );

      const selectedPlan =
        pricing[plan];

      if (!selectedPlan) {
        return res.status(400).json({
          success: false,

          error:
            "Invalid payment plan.",
        });
      }

      /*
      -----------------------------------------------
      PHONE
      -----------------------------------------------
      */

      const payer =
        normalizePhone(
          input.phoneNumber
        );

      /*
      -----------------------------------------------
      PROVIDER
      -----------------------------------------------
      */

      const lipilaProvider =
        LIPILA_PROVIDERS[
          input.provider
        ];

      if (!lipilaProvider) {
        return res.status(400).json({
          success: false,

          error:
            "Invalid mobile money provider.",
        });
      }

      console.log(
        "🔄 PROVIDER CONVERSION:",
        {
          frontend:
            input.provider,

          lipila:
            lipilaProvider,
        }
      );

      /*
      -----------------------------------------------
      REFERENCES
      -----------------------------------------------
      */

      const referenceId =
        `MYTOOLBOX-${uuidv4()}`;

      const transactionId =
        `TX-${uuidv4()}`;

      /*
      -----------------------------------------------
      CREATE PENDING PAYMENT
      -----------------------------------------------
      */

      payment =
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
                  30 *
                    60 *
                    1000
              ),
          },
        });

      /*
      -----------------------------------------------
      LIPILA URL
      -----------------------------------------------
      */

      const lipilaUrl =
        `${LIPILA_API_BASE}` +
        `/payments/mobile-money/` +
        `${process.env.LIPILA_WALLET_ID}/`;

      /*
      -----------------------------------------------
      LIPILA PAYLOAD
      -----------------------------------------------
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
          transactionId:
            transactionId,

          userId:
            String(req.userId),

          plan:
            plan.toUpperCase(),
        },
      };

      /*
      -----------------------------------------------
      DEBUG LIPILA REQUEST
      -----------------------------------------------
      */

      console.log(
        "🚀 SENDING TO LIPILA:",
        {
          url:
            lipilaUrl,

          reference:
            lipilaPayload.reference,

          amount:
            lipilaPayload.amount,

          payer:
            lipilaPayload.payer,

          provider:
            lipilaPayload.provider,

          walletId:
            process.env
              .LIPILA_WALLET_ID,
        }
      );

      /*
      -----------------------------------------------
      CALL LIPILA
      -----------------------------------------------
      */

      const response =
        await fetch(
          lipilaUrl,
          {
            method:
              "POST",

            headers: {
              "x-api-key":
                process.env
                  .LIPILA_API_KEY,

              "Content-Type":
                "application/json",

              "Accept":
                "application/json",
            },

            body:
              JSON.stringify(
                lipilaPayload
              ),
          }
        );

      /*
      -----------------------------------------------
      READ RESPONSE
      -----------------------------------------------
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

      console.log(
        "📡 LIPILA RESPONSE:",
        {
          status:
            response.status,

          ok:
            response.ok,

          data,
        }
      );

      /*
      -----------------------------------------------
      LIPILA ERROR
      -----------------------------------------------
      */

      if (!response.ok) {
        console.error(
          "❌ LIPILA API ERROR:",
          data
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
          success: false,

          error:
            data?.message ||
            data?.detail ||
            data?.error ||
            "Lipila payment could not be started.",

          lipilaStatus:
            response.status,

          referenceId,
        });
      }

      /*
      -----------------------------------------------
      GET EXTERNAL ID
      -----------------------------------------------
      */

      const externalId =
        data?.transaction_id ||
        data?.identifier ||
        data?.id ||
        null;

      /*
      -----------------------------------------------
      SAVE EXTERNAL ID
      -----------------------------------------------
      */

      await prisma.payment.update({
        where: {
          id:
            payment.id,
        },

        data: {
          externalId,
        },
      });

      /*
      -----------------------------------------------
      SUCCESS
      -----------------------------------------------
      */

      console.log(
        "✅ LIPILA PAYMENT INITIATED:",
        {
          paymentId:
            payment.id,

          transactionId,

          referenceId,

          externalId,

          provider:
            lipilaProvider,
        }
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

        currency:
          "ZMW",

        plan:
          plan.toUpperCase(),

        provider:
          input.provider,

        lipilaProvider,

        status:
          "pending",

        instructions:
          data?.message ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      /*
      -----------------------------------------------
      VALIDATION ERROR
      -----------------------------------------------
      */

      if (
        error instanceof
        z.ZodError
      ) {
        console.error(
          "❌ VALIDATION ERROR:",
          error.errors
        );

        return res.status(400).json({
          success: false,

          error:
            "Please provide a valid plan, phone number and provider.",

          details:
            error.errors,
        });
      }

      /*
      -----------------------------------------------
      PHONE ERROR
      -----------------------------------------------
      */

      if (
        error?.message?.includes(
          "valid Zambian phone number"
        )
      ) {
        return res.status(400).json({
          success: false,

          error:
            error.message,
        });
      }

      /*
      -----------------------------------------------
      MARK PAYMENT FAILED
      -----------------------------------------------
      */

      if (payment?.id) {
        try {
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
        } catch (
          dbError
        ) {
          console.error(
            "❌ PAYMENT DB UPDATE ERROR:",
            dbError
          );
        }
      }

      console.error(
        "❌ PAYMENT INITIATION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "Payment initiation failed.",
      });
    }
  }
);

/*
=========================================================
PAYMENT STATUS
=========================================================
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
          [
            "PRO",
            "SCHOOL",
          ].includes(
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
=========================================================
PAYMENT HISTORY
=========================================================
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
=========================================================
LIPILA WEBHOOK
=========================================================
*/

router.post(
  "/webhook",
  async (req, res) => {
    try {
      const body =
        req.body || {};

      console.log(
        "📩 LIPILA WEBHOOK:",
        JSON.stringify(
          body,
          null,
          2
        )
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
      -----------------------------------------------
      ACKNOWLEDGE UNKNOWN WEBHOOK
      -----------------------------------------------
      */

      if (!referenceId) {
        return res.status(200).json({
          received: true,
        });
      }

      /*
      -----------------------------------------------
      FIND PAYMENT
      -----------------------------------------------
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
      -----------------------------------------------
      ALREADY COMPLETED
      -----------------------------------------------
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
      -----------------------------------------------
      STATUS
      -----------------------------------------------
      */

      const status =
        String(
          data.status ||
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
      -----------------------------------------------
      COMPLETED
      -----------------------------------------------
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

        console.log(
          "✅ PAYMENT COMPLETED:",
          referenceId
        );
      }

      /*
      -----------------------------------------------
      FAILED
      -----------------------------------------------
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
          "❌ PAYMENT FAILED:",
          referenceId
        );
      }

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

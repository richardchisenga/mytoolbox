const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const { authenticate } = require("../utils/auth");

const prisma = new PrismaClient();

const LIPILA_API_BASE =
  process.env.LIPILA_BASE_URL || "https://console.lipila.tech/api/v1";

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

const providers = {
  MTN: "MTN_MOMO_ZMB",
  AIRTEL: "AIRTEL_OAPI_ZMB",
  ZAMTEL: "ZAMTEL_ZMB",
};

const paymentSchema = z.object({
  plan: z.enum(["PRO", "SCHOOL", "pro", "school"]),
  phoneNumber: z.string().trim().min(9),
  provider: z.enum(["MTN", "AIRTEL", "ZAMTEL"]),
});

function normalizePlan(plan) {
  return String(plan).toLowerCase();
}

function normalizePhone(phone) {
  let value = String(phone).replace(/\s+/g, "").replace(/-/g, "");

  if (value.startsWith("+260")) {
    return value.substring(1);
  }

  if (value.startsWith("260")) {
    return value;
  }

  if (value.startsWith("0") && value.length === 10) {
    return `260${value.substring(1)}`;
  }

  throw new Error("Enter a valid Zambian phone number.");
}

async function activateSubscription(tx, payment) {
  const now = new Date();

  const currentUser = await tx.user.findUnique({
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

  const subscriptionEndsAt = new Date(baseDate);
  subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

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
 * START PAYMENT
 */
router.post("/initiate", authenticate, async (req, res) => {
  try {
    const input = paymentSchema.parse(req.body);

    if (
      !process.env.LIPILA_API_KEY ||
      !process.env.LIPILA_WALLET_ID
    ) {
      return res.status(503).json({
        error: "Lipila payments are not configured yet.",
      });
    }

    const plan = normalizePlan(input.plan);

    const selectedPlan = pricing[plan];

    if (!selectedPlan) {
      return res.status(400).json({
        error: "Invalid payment plan.",
      });
    }

    const payer = normalizePhone(input.phoneNumber);
    const lipilaProvider = providers[input.provider];

    const referenceId = `MYTOOLBOX-${uuidv4()}`;
    const transactionId = `TX-${uuidv4()}`;

    const payment = await prisma.payment.create({
      data: {
        userId: req.userId,
        amount: selectedPlan.amount,
        plan: plan.toUpperCase(),
        currency: "ZMW",
        provider: "lipila",
        phoneNumber: payer,
        referenceId,
        transactionId,
        status: "pending",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    try {
      const lipilaUrl =
        `${LIPILA_API_BASE}/payments/mobile-money/` +
        `${process.env.LIPILA_WALLET_ID}/`;

      const response = await fetch(lipilaUrl, {
        method: "POST",
        headers: {
          "x-api-key": process.env.LIPILA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference: referenceId,
          amount: String(selectedPlan.amount),
          payer,
          provider: lipilaProvider,
          payer_message: `MyToolbox ${selectedPlan.label}`,
          metadata: {
            transactionId,
            userId: req.userId,
            plan: plan.toUpperCase(),
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error("Lipila API error:", response.status, data);

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
            "Lipila payment could not be started.",
        });
      }

      await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          externalId:
            data.transaction_id ||
            data.identifier ||
            data.id ||
            null,
        },
      });

      return res.json({
        success: true,
        paymentId: payment.id,
        transactionId,
        referenceId,
        amount: selectedPlan.amount,
        plan: plan.toUpperCase(),
        provider: input.provider,
        status: "pending",
        instructions:
          data.message ||
          "Payment request sent. Please approve the payment on your phone.",
      });
    } catch (error) {
      console.error("Lipila initiation error:", error);

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Please provide a valid plan, phone number and provider.",
      });
    }

    console.error("Payment initiation error:", error);

    return res.status(500).json({
      error: "Payment initiation failed.",
    });
  }
});

/*
 * CHECK PAYMENT STATUS
 */
router.get("/status/:transactionId", authenticate, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: {
        transactionId: req.params.transactionId,
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: "Transaction not found.",
      });
    }

    if (payment.userId !== req.userId) {
      return res.status(403).json({
        error: "Unauthorized.",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: req.userId,
      },
      select: {
        role: true,
        subscriptionEndsAt: true,
      },
    });

    return res.json({
      transactionId: payment.transactionId,
      referenceId: payment.referenceId,
      status: payment.status,
      amount: payment.amount,
      plan: payment.plan,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt || null,
      userRole: user?.role || null,
      isUpgraded: ["PRO", "SCHOOL"].includes(user?.role),
      subscriptionEndsAt: user?.subscriptionEndsAt || null,
    });
  } catch (error) {
    console.error("Payment status error:", error);

    return res.status(500).json({
      error: "Failed to get payment status.",
    });
  }
});

/*
 * PAYMENT HISTORY
 */
router.get("/history", authenticate, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        userId: req.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      payments,
    });
  } catch (error) {
    console.error("Payment history error:", error);

    return res.status(500).json({
      error: "Failed to get payment history.",
    });
  }
});

/*
 * LIPILA WEBHOOK
 */
router.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};

    console.log("Lipila webhook received:", body);

    const event = body.event;
    const data = body.data || body;

    const referenceId =
      data.reference ||
      data.referenceId;

    if (!referenceId) {
      return res.status(200).json({
        received: true,
      });
    }

    const payment = await prisma.payment.findUnique({
      where: {
        referenceId,
      },
    });

    if (!payment) {
      return res.status(200).json({
        received: true,
      });
    }

    if (payment.status === "completed") {
      return res.status(200).json({
        received: true,
      });
    }

    const status = String(
      data.status || event || ""
    ).toLowerCase();

    const completed =
      status === "completed" ||
      status === "success" ||
      status === "paid" ||
      event === "deposit.completed";

    const failed =
      status === "failed" ||
      status === "cancelled" ||
      status === "expired" ||
      event === "deposit.failed";

    if (completed) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: "pending",
          },
          data: {
            status: "completed",
            completedAt: new Date(),
            externalId:
              data.transaction_id ||
              data.id ||
              payment.externalId,
          },
        });

        if (updated.count > 0) {
          await activateSubscription(tx, payment);
        }
      });
    } else if (failed) {
      await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: "failed",
          externalId:
            data.transaction_id ||
            data.id ||
            payment.externalId,
        },
      });
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Lipila webhook error:", error);

    return res.status(500).json({
      error: "Webhook processing failed.",
    });
  }
});

module.exports = router;

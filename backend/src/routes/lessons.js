// Check if user can generate more lessons
const checkLessonLimit = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, lessonsUsed: true, lessonsLimit: true }
  });

  if (user.role === 'free' && user.lessonsUsed >= user.lessonsLimit) {
    return {
      allowed: false,
      message: 'Free plan limit reached (5 lessons/month). Upgrade to Pro for unlimited lessons!',
      remaining: 0
    };
  }

  return {
    allowed: true,
    remaining: user.role === 'pro' ? 'Unlimited' : user.lessonsLimit - user.lessonsUsed
  };
};

// In the /generate route:
router.post('/generate', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  
  // Check limit
  if (user.role === 'free' && user.lessonsUsed >= user.lessonsLimit) {
    return res.status(403).json({
      error: 'Free plan limit reached. Upgrade to Pro for unlimited lessons!',
      upgradeUrl: '/pricing'
    });
  }

  // After generating lesson, increment count
  await prisma.user.update({
    where: { id: req.userId },
    data: { lessonsUsed: { increment: 1 } }
  });

  // ... rest of generation
});

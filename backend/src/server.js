// ✅ 6. Subscription routes
try {
  const subscriptionRoutes = require('./routes/subscription');
  app.use('/api/subscription', subscriptionRoutes);
  console.log('✅ Subscription routes loaded');
} catch (error) {
  console.log('⚠️ Subscription routes not loaded:', error.message);
}

// ✅ 7. Payment routes (NEW - Add this)
try {
  const paymentRoutes = require('./routes/payments');
  app.use('/api/payments', paymentRoutes);
  console.log('✅ Payment routes loaded');
} catch (error) {
  console.log('⚠️ Payment routes not loaded:', error.message);
}

// 8. 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// 9. Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

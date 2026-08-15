const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

// Just a simple route to test
app.get('/', (req, res) => {
  res.send('✅ mytoolbox backend is running!');
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

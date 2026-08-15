const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

// Simple routes
app.get('/', (req, res) => {
  res.send('✅ mytoolbox backend is running!');
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

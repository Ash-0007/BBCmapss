const express = require('express');
const router = express.Router();
const airCargoController = require('../controller/airCargoController');

// Error handling middleware
const handleErrors = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    console.error('Air Cargo API Error:', error);
    
    // Default to 500 Internal Server Error
    const statusCode = error.statusCode || 500;
    
    // Create a user-friendly error message
    const message = error.message || 'An unexpected error occurred';
    
    // Send the error response
    res.status(statusCode).json({
      error: message,
      timestamp: new Date().toISOString()
    });
  }
};

// Apply error handling middleware to all routes
// Get air cargo routes between airports
router.post('/air-cargo', handleErrors(airCargoController.getAirCargoRoutes));

// Health check endpoint to verify API connectivity
router.get('/air-cargo/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'Air Cargo API is operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 
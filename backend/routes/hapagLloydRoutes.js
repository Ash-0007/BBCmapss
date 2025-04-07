const express = require('express');
const router = express.Router();
const hapagLloydController = require('../controller/hapagLloydController');

// Add debug middleware for this router
router.use((req, res, next) => {
  console.log('===== HAPAG LLOYD ROUTES =====');
  console.log('Request URL:', req.originalUrl);
  console.log('Request Method:', req.method);
  console.log('Request Body:', req.body);
  next();
});

// Search for shipping routes on Hapag-Lloyd
router.post('/hapag-routes', (req, res, next) => {
  console.log('DEBUG: hapag-routes POST endpoint hit');
  hapagLloydController.hapagLloydController.searchHapagRoutes(req, res);
});

module.exports = router; 
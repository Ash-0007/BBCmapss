const express = require('express');
const router = express.Router();
const airCargoController = require('../controller/airCargoController');

// Get air cargo routes between airports
router.post('/air-cargo', airCargoController.getAirCargoRoutes);

module.exports = router; 
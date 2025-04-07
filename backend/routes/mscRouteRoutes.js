const express = require('express');
const router = express.Router();
const mscRouteController = require('../controller/mscRouteController');

// Search for sailing routes on MSC.com
router.post('/msc-routes', mscRouteController.searchMscRoutes);

// Get available port IDs for MSC search
router.get('/msc-ports', mscRouteController.getMscPorts);

module.exports = router; 
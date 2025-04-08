const express = require('express');
const router = express.Router();
const vesselController = require('../controller/vesselController');

// Get nearest airports and seaports to a location
router.get('/nearest', vesselController.getNearestLocations);

// Get vessel arrival info
router.post('/vessel-arrival', vesselController.getVesselArrival);

// Get vessel details
router.post('/vessel-detail', vesselController.getVesselDetail);

// Get port coordinates by port codes
router.get('/port-locations', vesselController.getPortCoordinates);

// Get intermediate ship routes between points in a path
router.post('/intermediate-ship-routes', vesselController.getIntermediateShipRoutes);

module.exports = router; 
const express = require('express');
const router = express.Router();
const routesCache = require('../utils/routesCache');

/**
 * @route POST /api/routes-data/sea-routes-graph
 * @description Store the sea routes graph data
 * @access Public
 */
router.post('/sea-routes-graph', (req, res) => {
  try {
    const data = req.body;
    const result = routesCache.storeSeaRoutesGraph(data);
    res.json({ success: result, message: 'Sea routes graph stored successfully' });
  } catch (error) {
    console.error('Error storing sea routes graph:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

/**
 * @route GET /api/routes-data/sea-routes-graph
 * @description Retrieve the sea routes graph data
 * @access Public
 */
router.get('/sea-routes-graph', (req, res) => {
  try {
    const data = routesCache.getSeaRoutesGraph();
    res.json(data);
  } catch (error) {
    console.error('Error retrieving sea routes graph:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/routes-data/intermediate-routes
 * @description Store the intermediate routes data
 * @access Public
 */
router.post('/intermediate-routes', (req, res) => {
  try {
    const data = req.body;
    const result = routesCache.storeIntermediateRoutes(data);
    res.json({ success: result, message: 'Intermediate routes data stored successfully' });
  } catch (error) {
    console.error('Error storing intermediate routes data:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

/**
 * @route GET /api/routes-data/intermediate-routes
 * @description Retrieve the intermediate routes data
 * @access Public
 */
router.get('/intermediate-routes', (req, res) => {
  try {
    const data = routesCache.getIntermediateRoutes();
    res.json(data);
  } catch (error) {
    console.error('Error retrieving intermediate routes data:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

module.exports = router; 
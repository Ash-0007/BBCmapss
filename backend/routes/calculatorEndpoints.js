const express = require('express');
const router = express.Router();
const { 
  calculateAirEmissionsByAirportCodes,
  getShippingLineEmissions,
  calculateTransferEmissions
} = require('../controller/emissionsCalc.js');

/**
 * @route POST /api/calculator/air
 * @description Direct calculation endpoint for air emissions
 * @access Public
 */
router.post('/air', async (req, res) => {
  try {
    const { fromAirport, toAirport, weight = 0.001 } = req.body;
    
    if (!fromAirport || !toAirport) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination airport codes are required' 
      });
    }
    
    const emissions = await calculateAirEmissionsByAirportCodes(
      fromAirport, 
      toAirport, 
      weight
    );
    
    if (emissions === null) {
      return res.status(500).json({ 
        error: 'Calculation Error', 
        message: 'Failed to calculate air emissions' 
      });
    }
    
    res.json({ 
      success: true, 
      emissions,
      units: 'metric tons',
      mode: 'air',
      fromAirport,
      toAirport,
      weight
    });
  } catch (error) {
    console.error('Error in /calculator/air endpoint:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/calculator/sea
 * @description Direct calculation endpoint for sea emissions
 * @access Public
 */
router.post('/sea', async (req, res) => {
  try {
    const { fromPort, toPort, shippingLine = 'HLCU' } = req.body;
    
    if (!fromPort || !toPort) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination port codes are required' 
      });
    }
    
    const emissionsData = await getShippingLineEmissions(
      fromPort, 
      toPort, 
      shippingLine
    );
    
    if (!emissionsData) {
      return res.status(500).json({ 
        error: 'Calculation Error', 
        message: 'Failed to calculate sea emissions' 
      });
    }
    
    // The emissionsData already contains the processed data for the shipping line
    res.json({ 
      success: true, 
      amount: emissionsData.totalCO2,
      units: emissionsData.units || 'metric tons',
      transitTime: emissionsData.transitTime,
      shippingLine: emissionsData.shippingLine
    });
  } catch (error) {
    console.error('Error in /calculator/sea endpoint:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/calculator/transfer
 * @description Direct calculation endpoint for transfer/road emissions
 * @access Public
 */
router.post('/transfer', async (req, res) => {
  try {
    const { distance, mode = 'road' } = req.body;
    
    if (!distance || isNaN(distance) || distance <= 0) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Valid distance in kilometers is required' 
      });
    }
    
    const emissions = calculateTransferEmissions(distance, mode);
    
    res.json({ 
      success: true, 
      emissions,
      units: 'metric tons',
      mode: 'transfer',
      distance,
      transportMode: mode
    });
  } catch (error) {
    console.error('Error in /calculator/transfer endpoint:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

module.exports = router; 
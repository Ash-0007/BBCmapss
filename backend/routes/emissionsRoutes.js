const express = require('express');
const router = express.Router();
const { 
  calculateAirEmissions, 
  calculateAirEmissionsByAirportCodes,
  getAirportCoordinates,
  getShippingLineEmissions, 
  calculateTransferEmissions 
} = require('../controller/emissionsCalc.js');

/**
 * @route POST /api/emissions/air
 * @description Calculate CO2 emissions for air transport between two points
 * @access Public
 * @body {Object} origin - Origin location with lat, lng properties
 * @body {Object} destination - Destination location with lat, lng properties
 * @body {number} weight - Optional weight parameter (default: 0.001)
 */
router.post('/emissions/air', async (req, res) => {
  try {
    const { origin, destination, weight = 0.001 } = req.body;
    
    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination with lat/lng are required' 
      });
    }
    
    const emissions = await calculateAirEmissions({
      latFrom: origin.lat,
      lngFrom: origin.lng,
      latTo: destination.lat,
      lngTo: destination.lng,
      weight
    });
    
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
      origin,
      destination,
      weight
    });
  } catch (error) {
    console.error('Error calculating air emissions:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/emissions/air/airports
 * @description Calculate CO2 emissions for air transport between two airports using IATA codes
 * @access Public
 * @body {string} fromAirport - IATA code of origin airport
 * @body {string} toAirport - IATA code of destination airport
 * @body {number} weight - Optional weight parameter (default: 0.001)
 */
router.post('/emissions/air/airports', async (req, res) => {
  try {
    const { fromAirport, toAirport, weight = 0.001 } = req.body;
    
    if (!fromAirport || !toAirport) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination airport codes are required' 
      });
    }
    
    // Get airport details first for the response
    const originAirport = await getAirportCoordinates(fromAirport);
    const destinationAirport = await getAirportCoordinates(toAirport);
    
    if (!originAirport || !destinationAirport) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Could not find airport coordinates for codes: ${!originAirport ? fromAirport : ''} ${!destinationAirport ? toAirport : ''}`.trim() 
      });
    }
    
    const emissions = await calculateAirEmissionsByAirportCodes(fromAirport, toAirport, weight);
    
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
      fromAirport: {
        code: originAirport.code,
        name: originAirport.name,
        latitude: originAirport.latitude,
        longitude: originAirport.longitude
      },
      toAirport: {
        code: destinationAirport.code,
        name: destinationAirport.name,
        latitude: destinationAirport.latitude,
        longitude: destinationAirport.longitude
      },
      weight
    });
  } catch (error) {
    console.error('Error calculating air emissions by airport codes:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route GET /api/emissions/airport
 * @description Get airport coordinates by IATA code
 * @access Public
 * @query {string} code - IATA airport code
 */
router.get('/emissions/airport', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Airport code is required' 
      });
    }
    
    const airport = await getAirportCoordinates(code);
    
    if (!airport) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Airport with code ${code} not found` 
      });
    }
    
    res.json({ 
      success: true, 
      airport
    });
  } catch (error) {
    console.error('Error fetching airport coordinates:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/emissions/sea
 * @description Calculate CO2 emissions for sea transport between two ports
 * @access Public
 * @body {string} fromPort - Origin port code
 * @body {string} toPort - Destination port code
 * @body {string} shippingLine - Optional shipping line code (default: 'HLCU' for Hapag-Lloyd)
 */
router.post('/emissions/sea', async (req, res) => {
  try {
    const { fromPort, toPort, shippingLine = 'HLCU' } = req.body;
    
    if (!fromPort || !toPort) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination port codes are required' 
      });
    }
    
    const emissionsData = await getShippingLineEmissions(fromPort, toPort, shippingLine);
    
    if (!emissionsData) {
      return res.status(500).json({ 
        error: 'Calculation Error', 
        message: 'Failed to calculate sea emissions' 
      });
    }
    
    res.json({ 
      success: true, 
      emissions: emissionsData.totalCO2,
      units: 'metric tons',
      shippingLine: emissionsData.shippingLine,
      transitTime: emissionsData.transitTime,
      routeDetails: emissionsData.routeDetails,
      mode: 'sea',
      fromPort,
      toPort
    });
  } catch (error) {
    console.error('Error calculating sea emissions:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route POST /api/emissions/transfer
 * @description Calculate CO2 emissions for transfer/road transport
 * @access Public
 * @body {number} distance - Distance in kilometers
 * @body {string} mode - Transport mode (default: 'road')
 */
router.post('/emissions/transfer', async (req, res) => {
  try {
    const { distance, mode = 'road' } = req.body;
    
    if (!distance || distance <= 0) {
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
    console.error('Error calculating transfer emissions:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message 
    });
  }
});

/**
 * @route GET /api/emissions/test/air
 * @description Test air emissions calculation with specific airport codes
 * @access Public
 * @query {string} fromAirport - IATA code of origin airport
 * @query {string} toAirport - IATA code of destination airport
 * @query {number} weight - Optional weight parameter (default: 0.001)
 */
router.get('/emissions/test/air', async (req, res) => {
  try {
    const { fromAirport, toAirport, weight = 0.001 } = req.query;
    
    if (!fromAirport || !toAirport) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Origin and destination airport codes are required' 
      });
    }
    
    console.log(`Testing air emissions calculation from ${fromAirport} to ${toAirport} with weight ${weight}`);
    
    // Get airport details first
    const originAirport = await getAirportCoordinates(fromAirport);
    const destinationAirport = await getAirportCoordinates(toAirport);
    
    if (!originAirport || !destinationAirport) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Could not find airport coordinates for codes: ${!originAirport ? fromAirport : ''} ${!destinationAirport ? toAirport : ''}`.trim() 
      });
    }
    
    // Calculate emissions
    const emissions = await calculateAirEmissionsByAirportCodes(fromAirport, toAirport, weight);
    
    // Return detailed response for debugging
    res.json({ 
      success: true, 
      emissions,
      units: 'metric tons',
      mode: 'air',
      fromAirport: {
        code: originAirport.code,
        name: originAirport.name,
        latitude: originAirport.latitude,
        longitude: originAirport.longitude
      },
      toAirport: {
        code: destinationAirport.code,
        name: destinationAirport.name,
        latitude: destinationAirport.latitude,
        longitude: destinationAirport.longitude
      },
      weight,
      debug: {
        originFound: !!originAirport,
        destinationFound: !!destinationAirport,
        emissionsCalculated: emissions !== null
      }
    });
  } catch (error) {
    console.error('Error testing air emissions calculation:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 
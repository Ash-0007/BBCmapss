const logger = require('../utils/logger');

/**
 * Map UN/LOCODE port codes to Hapag-Lloyd location codes if needed
 * @param {string} portCode - UN/LOCODE port code (e.g., INCOK)
 * @returns {string} - Hapag-Lloyd location code
 */
const mapToHapagLloydCode = (portCode) => {
  // Map some common codes that might differ between systems
  const codeMap = {
    // Add mappings if Hapag-Lloyd uses different codes
    // Format: 'UN/LOCODE': 'Hapag-Lloyd code'
  };
  
  return codeMap[portCode] || portCode;
};

/**
 * Search for shipping routes on Hapag-Lloyd API
 */
const searchHapagRoutes = async (req, res) => {
  console.log('===== HAPAG LLOYD CONTROLLER CALLED =====');
  console.log('Request body:', req.body);
  console.log('Request path:', req.path);
  console.log('Request method:', req.method);
  
  const { startLocation, endLocation, startDate, containerType } = req.body;
  
  if (!startLocation || !endLocation) {
    logger.error('HapagLloyd', 'Missing required parameters: ' + JSON.stringify({ startLocation, endLocation }));
    console.log('ERROR: Missing required parameters:', { startLocation, endLocation });
    return res.status(400).json({ error: 'Origin and destination locations are required.' });
  }

  // Map location codes if needed and set default values for optional parameters
  const mappedStartLocation = mapToHapagLloydCode(startLocation);
  const mappedEndLocation = mapToHapagLloydCode(endLocation);
  const searchDate = startDate || new Date().toISOString().split('T')[0];
  const container = containerType || "45GP";
  
  logger.info('HapagLloyd', `Searching routes from ${mappedStartLocation} to ${mappedEndLocation} on ${searchDate}`);
  console.log('DEBUG: Searching routes with params:', { 
    mappedStartLocation, 
    mappedEndLocation, 
    searchDate, 
    container 
  });
  
  try {
    const url = new URL("https://schedule.api.hlag.cloud/api/routes");

    // Set up query parameters
    const params = {
      startLocation: mappedStartLocation,
      endLocation: mappedEndLocation,
      startDate: searchDate,
      startHaulage: "MERCHANT",
      endHaulage: "MERCHANT",
      containerType: container
    };

    // Add the parameters to the URL
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    logger.info('HapagLloyd', `Sending request to Hapag-Lloyd API: ${url.toString()}`);
    console.log('DEBUG: Sending request to Hapag-Lloyd API:', url.toString());
    
    // Set up headers
    const headers = {
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://www.hapag-lloyd.com",
      "Referer": "https://www.hapag-lloyd.com/",
      "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      "x-token": "public"
    };

    // Make the request
    const response = await fetch(url, { 
      method: "GET", 
      headers 
    });
    
    logger.info('HapagLloyd', `Response status: ${response.status} ${response.statusText}`);
    console.log('DEBUG: Hapag-Lloyd API response status:', response.status, response.statusText);
    
    // Check if the request was successful
    if (!response.ok) {
      console.log('ERROR: Hapag-Lloyd API error:', response.status, response.statusText);
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    logger.info('HapagLloyd', 'Successfully retrieved shipping routes data');
    console.log('DEBUG: Successfully retrieved shipping routes data, routes:', data.routes?.length || 0);
    
    // Return the data
    res.status(200).json(data);
  } catch (error) {
    logger.error('HapagLloyd', `Error: ${error.message}`);
    console.log('ERROR in Hapag-Lloyd controller:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  hapagLloydController: {
    searchHapagRoutes
  }
}; 
const logger = require('../utils/logger');
const CathayCargo = require('../CathayCargoApiExtractor');

/**
 * Get air cargo flight schedules between two airports
 */
const getAirCargoRoutes = async (req, res) => {
  const { origin, destination, flightDate, debug } = req.body;

  // Create cargo client instance
  const cargo = new CathayCargo();

  // Check if token exists or refresh if needed
  if (!global.Token || global.Token === "") {
    logger.info('AirCargo', 'No token found, fetching new API token');
    const tokenData = await cargo.getApiToken();
    if (tokenData && tokenData["access_token"]) {
      global.Token = tokenData["access_token"];
      logger.info('AirCargo', 'New token fetched successfully');
    } else {
      logger.error('AirCargo', 'Failed to fetch API token');
      return res.status(500).json({ error: 'Failed to authenticate with Cathay Cargo API' });
    }
  }

  const url = "https://api.cathaypacific.com/cargo-flights/v1/flight-schedule/search";

  logger.info('AirCargo', `Searching flights from ${origin} to ${destination} on ${flightDate}`);
  
  const isDebugMode = debug || req.headers['x-debug-mode'] === 'true';
  if (isDebugMode) {
    logger.debug('AirCargo', 'Debug mode enabled');
    logger.debug('AirCargo', `Request details: ${JSON.stringify({ origin, destination, flightDate })}`);
  }

  const headers = {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    authorization: `Bearer ${global.Token}`,
    "content-type": "application/json; charset=UTF-8",
    origin: "https://www.cathaycargo.com",
    referer: "https://www.cathaycargo.com/",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
  };

  logger.info('AirCargo', `Origin: ${origin}, Destination: ${destination}`);
  const payload = {
    origin,
    destination,
    flightDate,
    type: "byRoute",
    aircraftCategories: ["Freighter", "Wide-Body", "Narrow-Body"],
  };

  try {
    logger.info('AirCargo', `Sending request to Cathay Pacific API: ${url}`);
    
    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // Handle token expiration - if 401, refresh the token and retry
    if (response.status === 401) {
      logger.warn('AirCargo', 'Authentication failed (401), refreshing token and retrying');
      
      // Force refresh cookies and token
      await cargo.refreshCookies();
      const tokenData = await cargo.getApiToken();
      
      if (tokenData && tokenData["access_token"]) {
        global.Token = tokenData["access_token"];
        logger.info('AirCargo', 'Token refreshed successfully, retrying request');
        
        // Update headers with new token
        headers.authorization = `Bearer ${global.Token}`;
        
        // Retry the request
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        throw new Error('Failed to refresh authentication token');
      }
    }

    logger.info('AirCargo', `Response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    
    let totalRoutes = 0;
    let totalSegments = 0;
    
    if (data.records && Array.isArray(data.records)) {
      totalRoutes = data.records.length;
      totalSegments = data.records.reduce((sum, route) => sum + route.length, 0);
    }
    
    logger.info('AirCargo', `Found ${totalRoutes} routes with ${totalSegments} total flight segments`);
    
    if (isDebugMode && totalRoutes > 0) {
      logger.debug('AirCargo', `Sample route: ${JSON.stringify(data.records[0], null, 2)}`);
    }
    
    res.status(200).json(data); 
  } catch (err) {
    logger.error('AirCargo', `ERROR: ${err.message}`);
    
    if (err.message.includes('401')) {
      logger.error('AirCargo', 'Authentication error - Token expired');
      // Reset token so it will be refreshed on next request
      global.Token = "";
    }
    
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAirCargoRoutes
}; 
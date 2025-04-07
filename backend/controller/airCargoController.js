const logger = require('../utils/logger');
const CathayCargo = require('../CathayCargoApiExtractor');

/**
 * Get air cargo flight schedules between two airports
 */
const getAirCargoRoutes = async (req, res) => {
  const { origin, destination, flightDate, debug } = req.body;

  if (global.Token === "") {
    logger.info('AirCargo', 'No token found, fetching new API token');
    const cargo = new CathayCargo();
    global.Token = await cargo.getApiToken();
    global.Token = global.Token["access_token"];
    logger.info('AirCargo', 'New token fetched successfully');
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
    
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

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
      logger.error('AirCargo', 'Authentication error - Token may be expired');
    }
    
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAirCargoRoutes
}; 
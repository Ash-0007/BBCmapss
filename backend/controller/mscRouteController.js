const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Search for sailing routes on MSC.com
 */
const searchMscRoutes = async (req, res) => {
  const { fromPortId, toPortId, fromDate } = req.body;
  
  if (!fromPortId || !toPortId) {
    logger.error('MSCRoutes', 'Missing required parameters: ' + JSON.stringify({ fromPortId, toPortId }));
    return res.status(400).json({ error: 'Origin and destination port IDs are required.' });
  }

  // Set default date to today if not provided
  const searchDate = fromDate || new Date().toISOString().split('T')[0];
  
  logger.info('MSCRoutes', `Searching sailing routes from ${fromPortId} to ${toPortId} on ${searchDate}`);
  
  // Set the base URL for the API
  const url = "https://www.msc.com/api/feature/tools/SearchSailingRoutes";
  
  // Prepare the payload (request body)
  const payload = {
    "FromDate": searchDate,
    "fromPortId": fromPortId,
    "toPortId": toPortId,
    "language": "en",
    "dataSourceId": "{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}"
  };
  
  // Set the headers
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    "Origin": "https://www.msc.com",
    "Referer": "https://www.msc.com/en/search-a-schedule",
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"'
  };
  
  // Add cookies from your browser session
  const cookies = {
    "currentLocation": "IN",
    "SC_ANALYTICS_GLOBAL_COOKIE": "bfbaef262c9744668e60e8ca97ee5d00|True",
    "OptanonAlertBoxClosed": "2025-04-04T19:20:57.084Z",
    "_gid": "GA1.2.98899307.1743794457",
    "_yjsu_yjad": "1743794457.38c4fb21-4076-48a9-93fe-43aad42a0994",
    "_cs_c": "1",
    "msccargo#lang": "en",
    "shell#lang": "en",
    "ASP.NET_SessionId": "pvyco1vm3sizetmlqiclbiwb",
    "currentAgency": "169",
    "AKA_A2": "A",
    "OptanonConsent": "isGpcEnabled=0&datestamp=Sat+Apr+05+2025+19%3A51%3A36+GMT%2B0530+(India+Standard+Time)&version=202408.1.0&browserGpcFlag=0&isIABGlobal=false&identifierType=Cookie+Unique+Id&hosts=&consentId=28fe71b7-4a12-41f7-be0b-1f161e8f8d8b&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0002%3A1%2CC0004%3A1%2CC0003%3A1%2CC0001%3A1&iType=1&intType=1&geolocation=IN%3BKL&AwaitingReconsent=false"
  };
  
  // Convert cookies object to cookie string for fetch
  const cookieString = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  
  try {
    logger.info('MSCRoutes', `Sending request to MSC API: ${url}`);
    
    // Send the POST request with cookies
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Cookie': cookieString
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    
    logger.info('MSCRoutes', `Response status: ${response.status} ${response.statusText}`);
    
    // Check if the request was successful
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    logger.info('MSCRoutes', 'Successfully retrieved sailing routes data');
    
    // Return the data
    res.status(200).json(data);
  } catch (error) {
    logger.error('MSCRoutes', `Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available port IDs for MSC search
 */
const getMscPorts = async (req, res) => {
  try {
    const dataFilePath = path.join(__dirname, '..', 'data', 'msc_ports.json');
    
    // Check if the file exists
    if (!fs.existsSync(dataFilePath)) {
      logger.warn('MSCPorts', 'MSC ports data file not found');
      return res.status(404).json({ error: 'Port data not available' });
    }
    
    // Read and parse the JSON file
    const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    
    logger.info('MSCPorts', `Successfully retrieved port data with ${Object.keys(data).length} ports`);
    
    res.status(200).json(data);
  } catch (error) {
    logger.error('MSCPorts', `Error retrieving port data: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve port data' });
  }
};

module.exports = {
  searchMscRoutes,
  getMscPorts
}; 
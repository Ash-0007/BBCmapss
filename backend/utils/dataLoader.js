const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Data paths for processed files
const PROCESSED_ROUTES_PATH = path.join(__dirname, '..', 'data', 'processed_routes.json');
const PROCESSED_SHIPPING_PATH = path.join(__dirname, '..', 'data', 'processed_shipping.json');

// Cache for processed data
let processedRoutesData = null;
let processedShippingData = null;

// Load processed data
function loadProcessedData() {
  try {
    if (fs.existsSync(PROCESSED_ROUTES_PATH)) {
      processedRoutesData = JSON.parse(fs.readFileSync(PROCESSED_ROUTES_PATH, 'utf8'));
      logger.info('DataLoader', `Loaded ${processedRoutesData.stats.unique_routes} unique flight routes and ${processedRoutesData.stats.total_airports} airports`);
    } else {
      logger.warn('DataLoader', 'Processed routes data file not found. API will use fallback data.');
    }
    
    if (fs.existsSync(PROCESSED_SHIPPING_PATH)) {
      processedShippingData = JSON.parse(fs.readFileSync(PROCESSED_SHIPPING_PATH, 'utf8'));
      logger.info('DataLoader', `Loaded ${processedShippingData.stats.total_routes} shipping routes and ${processedShippingData.stats.total_ports} ports`);
    } else {
      logger.warn('DataLoader', 'Processed shipping data file not found. API will use fallback data.');
    }
  } catch (err) {
    logger.error('DataLoader', `Error loading processed data: ${err.message}`);
  }
}

module.exports = {
  loadProcessedData,
  getProcessedRoutesData: () => processedRoutesData,
  getProcessedShippingData: () => processedShippingData
}; 
const fs = require('fs');
const path = require('path');

// Cache structure
let cache = {
  seaRoutesGraph: {},
  intermediateRoutes: {}
};

// Path to persistent cache file
const cacheFilePath = path.join(__dirname, '../data/routes-cache.json');

/**
 * Initialize the cache from disk if available
 */
function initCache() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const data = fs.readFileSync(cacheFilePath, 'utf8');
      cache = JSON.parse(data);
      console.log('Routes cache loaded from disk');
    } else {
      console.log('No routes cache file found, starting with empty cache');
      // Ensure the directory exists
      const dir = path.dirname(cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      saveCache(); // Create the file
    }
  } catch (error) {
    console.error('Error initializing routes cache:', error);
  }
}

/**
 * Save the current cache to disk
 */
function saveCache() {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
    console.log('Routes cache saved to disk');
  } catch (error) {
    console.error('Error saving routes cache:', error);
  }
}

/**
 * Store sea routes graph data
 * @param {Object} data - Sea routes graph data
 */
function storeSeaRoutesGraph(data) {
  cache.seaRoutesGraph = data;
  saveCache();
  return true;
}

/**
 * Retrieve sea routes graph data
 * @returns {Object} The sea routes graph data
 */
function getSeaRoutesGraph() {
  return cache.seaRoutesGraph;
}

/**
 * Store intermediate routes data
 * @param {Object} data - Intermediate routes data
 */
function storeIntermediateRoutes(data) {
  cache.intermediateRoutes = data;
  saveCache();
  return true;
}

/**
 * Retrieve intermediate routes data
 * @returns {Object} The intermediate routes data
 */
function getIntermediateRoutes() {
  return cache.intermediateRoutes;
}

// Initialize cache when module is loaded
initCache();

module.exports = {
  storeSeaRoutesGraph,
  getSeaRoutesGraph,
  storeIntermediateRoutes,
  getIntermediateRoutes
}; 
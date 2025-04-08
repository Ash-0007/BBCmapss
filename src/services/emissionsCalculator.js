const API_BASE_URL = 'http://localhost:3000';

/**
 * Calculate air emissions between two airports
 * @param {string} fromAirport - IATA code of origin airport
 * @param {string} toAirport - IATA code of destination airport  
 * @param {number} weight - Cargo weight in tons (default: 0.001)
 * @returns {Promise<Object>} Emissions calculation result
 */
export const calculateAirEmissions = async (fromAirport, toAirport, weight = 0.001) => {
  try {
    console.log('Calculating air emissions:', { fromAirport, toAirport, weight });
    
    const response = await fetch(`${API_BASE_URL}/api/calculator/air`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromAirport,
        toAirport,
        weight
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to calculate air emissions');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Air emissions calculation error:', error);
    throw error;
  }
};

/**
 * Calculate sea emissions between two ports
 * @param {string} fromPort - Origin port code
 * @param {string} toPort - Destination port code
 * @param {string} shippingLine - Shipping line code (default: 'HLCU')
 * @returns {Promise<Object>} Emissions calculation result
 */
export const calculateSeaEmissions = async (fromPort, toPort, shippingLine = 'HLCU') => {
  try {
    console.log('Calculating sea emissions:', { fromPort, toPort, shippingLine });
    
    const response = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPort,
        toPort,
        shippingLine
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to calculate sea emissions');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Sea emissions calculation error:', error);
    throw error;
  }
};

/**
 * Calculate transfer/road emissions
 * @param {number} distance - Distance in kilometers
 * @param {string} mode - Transport mode (default: 'road')
 * @returns {Promise<Object>} Emissions calculation result
 */
export const calculateTransferEmissions = async (distance, mode = 'road') => {
  try {
    console.log('Calculating transfer emissions:', { distance, mode });
    
    const response = await fetch(`${API_BASE_URL}/api/calculator/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distance,
        mode
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to calculate transfer emissions');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Transfer emissions calculation error:', error);
    throw error;
  }
}; 
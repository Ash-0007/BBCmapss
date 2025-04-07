const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Mock for pool since we're using the API functions instead
const mockPool = {
  connect: () => Promise.resolve({ query: () => {}, release: () => {} }),
  end: () => Promise.resolve()
};

// Define the actual API endpoints
const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  
  return distance;
}

/**
 * Get the nearest seaports to a location using the API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of nearby seaports
 */
async function getNearestSeaports(lat, lon, limit = 3) {
  try {
    // Make a direct API call to the nearest endpoint with type=seaport
    const response = await axios.get(`${API_BASE_URL}/nearest`, {
      params: { lat, lng: lon, type: 'seaport', limit }
    });
    
    // Return the seaports data
    if (response.data && response.data.ports) {
      return response.data.ports.map(port => ({
        code: port.code,
        name: port.name,
        latitude_dd: parseFloat(port.latitude_dd),
        longitude_dd: parseFloat(port.longitude_dd),
        distance: port.distance,
        type: 'seaport'
      }));
    }
    
    throw new Error('Invalid API response format for seaports');
  } catch (err) {
    console.error('Error fetching nearest seaports from API:', err.message);
    throw err;
  }
}

/**
 * Get the nearest airports to a location using the API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of nearby airports
 */
async function getNearestAirports(lat, lon, limit = 3) {
  try {
    // Make a direct API call to the nearest endpoint with type=airport
    const response = await axios.get(`${API_BASE_URL}/nearest`, {
      params: { lat, lng: lon, type: 'airport', limit }
    });
    
    // Return the airports data
    if (response.data && response.data.airports) {
      return response.data.airports.map(airport => ({
        code: airport.code,
        name: airport.name,
        latitude_dd: parseFloat(airport.latitude_dd),
        longitude_dd: parseFloat(airport.longitude_dd),
        distance: airport.distance,
        type: 'airport'
      }));
    }
    
    throw new Error('Invalid API response format for airports');
  } catch (err) {
    console.error('Error fetching nearest airports from API:', err.message);
    throw err;
  }
}

/**
 * Get ship schedules between two ports using the API
 * @param {string} fromPort - Origin port code
 * @param {string} toPort - Destination port code
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of ship schedules
 */
async function getShipSchedules(fromPort, toPort, startDate) {
  try {
    // Use the ship routes API endpoint
    const formattedDate = startDate.replace(/-/g, ''); // API might need YYYYMMDD format
    const response = await axios.get(`${API_BASE_URL}/ship-routes`, {
      params: { startPort: fromPort, endPort: toPort, startDate: formattedDate }
    });
    
    if (!response.data || !response.data.routes) {
      throw new Error('Invalid API response format for ship schedules');
    }
    
    // Transform the API response to the required format
    return response.data.routes.map(route => ({
      voyage: route.voyageCode || route.scheduleVoyageNumber || route.voyage,
      shipName: route.vesselName || route.shipName || 'Unknown Vessel',
      fromPort,
      toPort,
      departureTime: route.departureDate || route.departureDateTime,
      arrivalTime: route.arrivalDate || route.arrivalDateTime,
      schedule: Array.isArray(route.stops) ? route.stops.map(stop => ({
        port: stop.portCode,
        portName: stop.portName,
        eta: stop.arrivalDate || stop.arrivalDateTime,
        etd: stop.departureDate || stop.departureDateTime
      })) : []
    }));
  } catch (err) {
    console.error('Error fetching ship schedules from API:', err.message);
    throw err;
  }
}

/**
 * Get flight schedules between two airports using the API
 * @param {string} fromAirport - Origin airport code
 * @param {string} toAirport - Destination airport code
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of flight schedules
 */
async function getFlightSchedules(fromAirport, toAirport, startDate) {
  try {
    // Use the air routes API endpoint
    const response = await axios.get(`${API_BASE_URL}/air-routes`, {
      params: { 
        originAirport: fromAirport, 
        destinationAirport: toAirport, 
        flightDate: startDate 
      }
    });
    
    if (!response.data || !response.data.flights) {
      throw new Error('Invalid API response format for flight schedules');
    }
    
    // Transform the API response to the required format
    return response.data.flights.map(flight => ({
      flightNo: flight.flightNumber || flight.flightNo,
      fromAirport,
      fromAirportName: flight.departureAirport || fromAirport,
      toAirport,
      toAirportName: flight.arrivalAirport || toAirport,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      distance: flight.distance || calculateFlightDistance(fromAirport, toAirport),
      duration: flight.duration || calculateFlightDuration(flight.departureTime, flight.arrivalTime),
      type: 'flight'
    }));
  } catch (err) {
    console.error('Error fetching flight schedules from API:', err.message);
    throw err;
  }
}

/**
 * Get airport details by IATA code using the API
 * @param {string} iataCode - IATA airport code
 * @returns {Promise<Object>} Airport details
 */
async function getAirportDetails(iataCode) {
  try {
    // Use the airport details API endpoint
    const response = await axios.get(`${API_BASE_URL}/airports/${iataCode}`);
    
    if (!response.data || !response.data.airport) {
      throw new Error('Invalid API response format for airport details');
    }
    
    const airport = response.data.airport;
    return {
      code: airport.code,
      name: airport.name,
      latitude_dd: parseFloat(airport.latitude_dd),
      longitude_dd: parseFloat(airport.longitude_dd),
      type: 'airport'
    };
  } catch (err) {
    console.error(`Error fetching airport details for ${iataCode} from API:`, err.message);
    throw err;
  }
}

/**
 * Get seaport details by port code using the API
 * @param {string} portCode - Port code
 * @returns {Promise<Object>} Seaport details
 */
async function getSeaportDetails(portCode) {
  try {
    // Use the seaport details API endpoint
    const response = await axios.get(`${API_BASE_URL}/seaports/${portCode}`);
    
    if (!response.data || !response.data.port) {
      throw new Error('Invalid API response format for seaport details');
    }
    
    const port = response.data.port;
    return {
      code: port.code,
      name: port.name,
      latitude_dd: parseFloat(port.latitude_dd),
      longitude_dd: parseFloat(port.longitude_dd),
      type: 'seaport'
    };
  } catch (err) {
    console.error(`Error fetching seaport details for ${portCode} from API:`, err.message);
    throw err;
  }
}

/**
 * Calculate distance between two airports
 * @param {string} fromAirport - Origin airport code
 * @param {string} toAirport - Destination airport code
 * @returns {number} Distance in kilometers
 */
function calculateFlightDistance(fromAirport, toAirport) {
  // This is a placeholder. In a real implementation, you would use airport coordinates
  // from a database or another API call to calculate distance
  return 1000; // Returning a default value of 1000 km
}

/**
 * Calculate flight duration based on departure and arrival times
 * @param {string} departureTime - Departure time
 * @param {string} arrivalTime - Arrival time
 * @returns {number} Duration in hours
 */
function calculateFlightDuration(departureTime, arrivalTime) {
  try {
    const departure = new Date(departureTime);
    const arrival = new Date(arrivalTime);
    
    // Calculate duration in hours
    return (arrival - departure) / (1000 * 60 * 60);
  } catch (err) {
    console.error('Error calculating flight duration:', err.message);
    return 5; // Default to 5 hours if there's an error
  }
}

module.exports = {
  mockPool,
  calculateDistance,
  getNearestSeaports,
  getNearestAirports,
  getShipSchedules,
  getFlightSchedules,
  getAirportDetails,
  getSeaportDetails
}; 
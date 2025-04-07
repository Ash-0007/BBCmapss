/**
 * Service for vessel-related API calls
 */

const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Fetch vessel arrival time information for a specific port and date range
 * @param {string} port - Port code
 * @param {string} startDate - Start date in YYYYMMDD format
 * @param {string} endDate - End date in YYYYMMDD format
 * @returns {Promise<Object>} Vessel arrival data
 */
export const fetchVesselArrivalTime = async (port, startDate, endDate) => {
  try {
    console.log('Fetching vessel arrival time for:', { port, startDate, endDate });
    
    const response = await fetch(`${API_BASE_URL}/vessel-arrival`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ port, startDate, endDate })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API response not OK:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Received vessel arrival data:', data);
    return data;
  } catch (error) {
    console.error('Fetch vessel arrival time error:', error);
    throw error;
  }
};

/**
 * Fetch all vessel schedules for a specific port and date range
 * @param {string} port - Port code
 * @param {string} startDate - Start date in YYYYMMDD format
 * @param {string} endDate - End date in YYYYMMDD format
 * @returns {Promise<Array>} Array of vessel schedule objects
 */
export const fetchAllVesselSchedules = async (port, startDate, endDate) => {
  try {
    console.log('Fetching all vessel schedules for:', { port, startDate, endDate });
    
    // First, get the arrival time data
    const arrivalData = await fetchVesselArrivalTime(port, startDate, endDate);
    
    // Extract vessel schedules from the arrival data
    // This is a placeholder - you'll need to transform the data based on the actual response format
    const schedules = Array.isArray(arrivalData) ? arrivalData : [];
    
    if (schedules.length === 0 && arrivalData) {
      // If no array was returned but we have data, it might be in a different format
      // Parse the HTML or extract the data as needed
      console.log('Parsing vessel data from non-array response');
      
      // Here you would implement any parsing logic needed for the specific API response
      // This is just a placeholder example
      return [{
        vesselName: 'Data format not supported',
        voyage: 'N/A',
        line: 'N/A',
        schedule: []
      }];
    }
    
    return schedules.map(schedule => ({
      vesselName: schedule.vesselName || schedule.vessel_name || 'Unknown',
      voyage: schedule.voyage || 'N/A',
      line: schedule.line || 'N/A',
      schedule: Array.isArray(schedule.schedule) ? schedule.schedule : []
    }));
  } catch (error) {
    console.error('Fetch all vessel schedules error:', error);
    // Return an empty array on error
    return [];
  }
}; 
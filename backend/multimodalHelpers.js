const axios = require('axios');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'freight_db',
  password: process.env.PGPASSWORD || 'postgres',
  port: process.env.PGPORT || 5432,
});

/**
 * Find the closest transportation port of a specific type near a location
 * @param {Object} location - Location object with lat, lng properties
 * @param {string} mode - Mode of transport ('air' or 'sea')
 * @returns {Promise<Object>} The closest port
 */
async function findClosestPort(location, mode) {
  try {
    if (mode === 'air') {
      const airports = await getNearestAirports(location.lat, location.lng, 1);
      return airports.length > 0 ? airports[0] : null;
    } else if (mode === 'sea') {
      const seaports = await getNearestSeaports(location.lat, location.lng, 1);
      return seaports.length > 0 ? seaports[0] : null;
    }
    return null;
  } catch (error) {
    console.error(`Error finding closest ${mode} port:`, error);
    return null;
  }
}

/**
 * Log the details of each leg of a journey
 * @param {Object} leg - The journey leg
 * @returns {Object} The formatted leg info
 */
function logJourneyLeg(leg) {
  return {
    source: leg.source,
    target: leg.target,
    mode: leg.mode,
    distance: leg.distance,
    duration: leg.duration,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    ...(leg.flightNo ? { flightNo: leg.flightNo } : {}),
    ...(leg.voyageCode ? { voyageCode: leg.voyageCode, shipName: leg.shipName } : {})
  };
}

/**
 * Find alternative transportation from a layover port
 * @param {Object} graph - The multimodal graph
 * @param {Object} layoverNode - The layover node
 * @param {Array} destinations - Array of destination nodes
 * @param {string} arrivalTime - Arrival time at the layover in ISO format
 * @param {string} oppositeMode - The opposite mode of transport ('air' if at seaport, 'sea' if at airport)
 * @returns {Promise<Array>} Array of new edges
 */
async function findAlternativeTransport(graph, layoverNode, destinations, arrivalTime, oppositeMode) {
  const newEdges = [];
  
  try {
    // Get the closest port of the opposite mode
    const oppositePortType = oppositeMode === 'air' ? 'airport' : 'seaport';
    const getClosestFunc = oppositeMode === 'air' ? getNearestAirports : getNearestSeaports;
    
    const nearbyPorts = await getClosestFunc(layoverNode.lat, layoverNode.lng, 3);
    
    if (!nearbyPorts || nearbyPorts.length === 0) {
      console.log(`No ${oppositePortType}s found near layover at ${layoverNode.id}`);
      return newEdges;
    }
    
    // Add road connections to the nearby ports
    for (const nearbyPort of nearbyPorts) {
      const nearbyPortId = `${oppositePortType}_${nearbyPort.code}`;
      
      // Add port to graph if not already there
      if (!graph.nodes[nearbyPortId]) {
        graph.nodes[nearbyPortId] = {
          id: nearbyPortId,
          code: nearbyPort.code,
          name: nearbyPort.name,
          type: oppositePortType,
          lat: nearbyPort.latitude_dd,
          lng: nearbyPort.longitude_dd
        };
      }
      
      // Add road connection from layover to nearby port
      const roadDistance = calculateDistance(
        layoverNode.lat, layoverNode.lng,
        nearbyPort.latitude_dd, nearbyPort.longitude_dd
      );
      const roadDuration = calculateRoadTravelTime(roadDistance);
      
      const roadDepartureTime = new Date(arrivalTime);
      const roadArrivalTime = new Date(roadDepartureTime.getTime() + roadDuration * 60 * 60 * 1000);
      
      const roadEdge = {
        id: `road_${layoverNode.id}_to_${nearbyPortId}`,
        source: layoverNode.id,
        target: nearbyPortId,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
        departureTime: roadDepartureTime.toISOString(),
        arrivalTime: roadArrivalTime.toISOString()
      };
      
      newEdges.push(roadEdge);
      
      // Find connections from this nearby port to destinations
      for (const destNode of destinations) {
        // Skip if the destination is of the same type as the nearby port
        if (destNode.type === oppositePortType) {
          const getSchedulesFunc = oppositeMode === 'air' 
            ? getFlightSchedules 
            : getShipSchedules;
          
          const schedules = await getSchedulesFunc(
            nearbyPort.code,
            destNode.code,
            roadArrivalTime.toISOString().split('T')[0]
          );
          
          if (schedules.length > 0) {
            // Add connection to graph
            const schedule = schedules[0];
            const distance = calculateDistance(
              nearbyPort.latitude_dd, nearbyPort.longitude_dd,
              destNode.lat, destNode.lng
            );
            
            let edge;
            if (oppositeMode === 'air') {
              edge = {
                id: `flight_${nearbyPortId}_to_${destNode.id}_${schedule.flightNo}`,
                source: nearbyPortId,
                target: destNode.id,
                mode: 'air',
                flightNo: schedule.flightNo,
                distance: distance,
                duration: schedule.duration,
                emissions: distance * 0.25, // 250g CO2 per km for flights
                departureTime: schedule.departureTime,
                arrivalTime: schedule.arrivalTime
              };
            } else {
              edge = {
                id: `ship_${nearbyPortId}_to_${destNode.id}_${schedule.voyage}`,
                source: nearbyPortId,
                target: destNode.id,
                mode: 'ship',
                voyageCode: schedule.voyage,
                shipName: schedule.shipName,
                distance: distance,
                duration: (new Date(schedule.arrivalTime) - new Date(schedule.departureTime)) / (1000 * 60 * 60),
                emissions: distance * 0.04, // 40g CO2 per km for ships
                departureTime: schedule.departureTime,
                arrivalTime: schedule.arrivalTime
              };
            }
            
            newEdges.push(edge);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error finding alternative transport:', error);
  }
  
  return newEdges;
}

/**
 * Add road connections between all nodes in the graph
 * @param {Object} graph - The multimodal graph
 * @returns {Array} The new road edges
 */
function addRoadConnectionsBetweenAllNodes(graph) {
  const newEdges = [];
  const allNodes = Object.values(graph.nodes);
  
  console.log('Adding road connections between ALL nodes (no distance limit)...');
  
  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const nodeA = allNodes[i];
      const nodeB = allNodes[j];
      
      // Calculate road distance and duration
      const roadDistance = calculateDistance(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);
      const roadDuration = calculateRoadTravelTime(roadDistance);
      
      // Add bidirectional road connection
      newEdges.push({
        id: `road_${nodeA.id}_to_${nodeB.id}`,
        source: nodeA.id,
        target: nodeB.id,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12 // 120g CO2 per km for trucks
      });
      
      newEdges.push({
        id: `road_${nodeB.id}_to_${nodeA.id}`,
        source: nodeB.id,
        target: nodeA.id,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12 // 120g CO2 per km for trucks
      });
    }
  }
  
  return newEdges;
}

// Re-export required functions from multimodal_graph.js
const {
  calculateDistance,
  calculateRoadTravelTime,
  getNearestAirports,
  getNearestSeaports,
  getShipSchedules,
  getFlightSchedules,
  getAirportDetails,
  getSeaportDetails
} = require('./multimodal_graph');

module.exports = {
  findClosestPort,
  logJourneyLeg,
  findAlternativeTransport,
  addRoadConnectionsBetweenAllNodes,
  calculateDistance,
  calculateRoadTravelTime,
  getNearestAirports,
  getNearestSeaports,
  getShipSchedules,
  getFlightSchedules,
  getAirportDetails,
  getSeaportDetails
}; 
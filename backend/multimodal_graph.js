const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import the data provider that will use API functions or fallbacks
const dataProvider = require('./mockDataProvider');

// Use the mock pool from the data provider
const pool = dataProvider.mockPool;

// Cache for reducing API calls
const portCache = {
  airports: new Map(),
  seaports: new Map()
};

/**
 * Safely convert a date to ISO string format
 * @param {Date|string|number} date - Date object, string or timestamp
 * @param {string} fallbackFormat - Fallback string if conversion fails
 * @returns {string} ISO formatted date string
 */
function safeToISOString(date, fallbackFormat = null) {
  try {
    // If it's already a string that looks like an ISO date, return it
    if (typeof date === 'string' && date.includes('T') && date.includes('Z')) {
      return date;
    }
    
    // Convert to Date if it's not already
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString();
  } catch (e) {
    console.warn('Date conversion error:', e.message);
    if (fallbackFormat) {
      return fallbackFormat;
    }
    // Generate a fallback date that's valid (current date)
    return new Date().toISOString();
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  return dataProvider.calculateDistance(lat1, lon1, lat2, lon2);
}

/**
 * Calculate travel time between two points by road
 * @param {number} distance - Distance in kilometers
 * @returns {number} Time in hours
 */
function calculateRoadTravelTime(distance) {
  const averageSpeed = 60; // km/h
  return distance / averageSpeed;
}

/**
 * Get the nearest seaports to a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of nearby seaports
 */
async function getNearestSeaports(lat, lon, limit = 3) {
  return dataProvider.getNearestSeaports(lat, lon, limit);
}

/**
 * Get the nearest airports to a location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of nearby airports
 */
async function getNearestAirports(lat, lon, limit = 3) {
  return dataProvider.getNearestAirports(lat, lon, limit);
}

/**
 * Get ship schedules between two ports
 * @param {string} fromPort - Origin port code
 * @param {string} toPort - Destination port code
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of ship schedules
 */
async function getShipSchedules(fromPort, toPort, startDate) {
  console.log(`Fetching ship schedules from ${fromPort} to ${toPort} starting ${startDate}`);
  return dataProvider.getShipSchedules(fromPort, toPort, startDate);
}

/**
 * Calculate air travel time between two airports
 * @param {number} distance - Distance in kilometers
 * @returns {Object} Object containing duration in hours and transit details
 */
function calculateAirTravelTime(distance) {
  // Average cruising speed of 800 km/h plus 2 hours for boarding, taxiing, etc.
  const flightTime = distance / 800;
  const totalTime = flightTime + 2;
  
  return {
    duration: totalTime,
    transit: {
      boarding: 1,
      flight: flightTime,
      deboarding: 1
    }
  };
}

/**
 * Get flight schedules between two airports
 * @param {string} fromAirport - Origin airport code
 * @param {string} toAirport - Destination airport code
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of flight schedules
 */
async function getFlightSchedules(fromAirport, toAirport, startDate) {
  console.log(`Fetching flight schedules from ${fromAirport} to ${toAirport} on ${startDate}`);
  return dataProvider.getFlightSchedules(fromAirport, toAirport, startDate);
}

/**
 * Get airport details by IATA code
 * @param {string} iataCode - IATA airport code
 * @returns {Promise<Object>} Airport details
 */
async function getAirportDetails(iataCode) {
  // Check cache first
  if (portCache.airports.has(iataCode)) {
    return portCache.airports.get(iataCode);
  }
  
  const airport = await dataProvider.getAirportDetails(iataCode);
  
  // Save to cache
  if (airport) {
    portCache.airports.set(iataCode, airport);
  }
  
  return airport;
}

/**
 * Get seaport details by port code
 * @param {string} portCode - Port code
 * @returns {Promise<Object>} Seaport details
 */
async function getSeaportDetails(portCode) {
  // Check cache first
  if (portCache.seaports.has(portCode)) {
    return portCache.seaports.get(portCode);
  }
  
  const seaport = await dataProvider.getSeaportDetails(portCode);
  
  // Save to cache
  if (seaport) {
    portCache.seaports.set(portCode, seaport);
  }
  
  return seaport;
}

/**
 * Build a multimodal transportation graph between two locations
 * @param {Object} origin - Origin location with lat, lng properties
 * @param {Object} destination - Destination location with lat, lng properties
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Object>} Multimodal graph
 */
async function buildMultimodalGraph(origin, destination, startDate) {
  console.log(`Building enhanced multimodal graph from ${JSON.stringify(origin)} to ${JSON.stringify(destination)}`);
  
  const graph = {
    nodes: {},
    edges: [],
    journeys: [],
    legDetails: []  // Store detailed information about each leg
  };
  
  // Step 1: Add origin and destination to the graph
  graph.nodes['origin'] = {
    id: 'origin',
    name: 'Origin',
    type: 'location',
    lat: origin.lat,
    lng: origin.lng
  };
  
  graph.nodes['destination'] = {
    id: 'destination',
    name: 'Destination',
    type: 'location',
    lat: destination.lat,
    lng: destination.lng
  };
  
  // Step 2: Find the three nearest airports and seaports to origin and destination
  console.log('Finding nearest transportation hubs...');
  
  const [originSeaports, originAirports, destSeaports, destAirports] = await Promise.all([
    getNearestSeaports(origin.lat, origin.lng, 3),
    getNearestAirports(origin.lat, origin.lng, 3),
    getNearestSeaports(destination.lat, destination.lng, 3),
    getNearestAirports(destination.lat, destination.lng, 3)
  ]);
  
  console.log(`Found ${originSeaports.length} origin seaports, ${originAirports.length} origin airports`);
  console.log(`Found ${destSeaports.length} destination seaports, ${destAirports.length} destination airports`);
  
  // Step 3: Add all transportation hubs to the graph
  [...originSeaports, ...originAirports, ...destSeaports, ...destAirports].forEach(hub => {
    const hubId = hub.code;
    
    // Skip if already in the graph
    if (graph.nodes[hubId]) return;
    
    graph.nodes[hubId] = {
      id: hubId,
      name: hub.name,
      type: hub.type,
      lat: parseFloat(hub.latitude_dd),
      lng: parseFloat(hub.longitude_dd)
    };
    
    // Add road connection from origin to origin hubs or from destination hubs to destination
    if (originSeaports.includes(hub) || originAirports.includes(hub)) {
      const roadDistance = calculateDistance(origin.lat, origin.lng, hub.latitude_dd, hub.longitude_dd);
      const roadDuration = calculateRoadTravelTime(roadDistance);
      
      const departureTime = new Date(startDate);
      const arrivalTime = new Date(departureTime.getTime() + roadDuration * 60 * 60 * 1000);
      
      const roadEdge = {
        id: `road_origin_to_${hubId}`,
        source: 'origin',
        target: hubId,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
        departureTime: safeToISOString(departureTime, startDate + 'T00:00:00.000Z'),
        arrivalTime: safeToISOString(arrivalTime)
      };
      
      graph.edges.push(roadEdge);
      
      // Log leg details
      graph.legDetails.push({
        legId: roadEdge.id,
        origin: 'Origin Location',
        destination: hub.name,
        mode: 'road',
        departureLocation: { lat: origin.lat, lng: origin.lng },
        arrivalLocation: { lat: parseFloat(hub.latitude_dd), lng: parseFloat(hub.longitude_dd) },
        departureTime: safeToISOString(departureTime, startDate + 'T00:00:00.000Z'),
        arrivalTime: safeToISOString(arrivalTime),
        duration: roadDuration
      });
    }
    
    if (destSeaports.includes(hub) || destAirports.includes(hub)) {
      const roadDistance = calculateDistance(destination.lat, destination.lng, hub.latitude_dd, hub.longitude_dd);
      const roadDuration = calculateRoadTravelTime(roadDistance);
      
      const roadEdge = {
        id: `road_${hubId}_to_destination`,
        source: hubId,
        target: 'destination',
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12 // 120g CO2 per km for trucks
      };
      
      graph.edges.push(roadEdge);
      
      // Since we don't know arrival time yet (depends on preceding legs), we'll update this later
      graph.legDetails.push({
        legId: roadEdge.id,
        origin: hub.name,
        destination: 'Destination Location',
        mode: 'road',
        departureLocation: { lat: parseFloat(hub.latitude_dd), lng: parseFloat(hub.longitude_dd) },
        arrivalLocation: { lat: destination.lat, lng: destination.lng },
        duration: roadDuration
        // departureTime and arrivalTime will be added when we have concrete journeys
      });
    }
  });
  
  // Step 4: Find ship schedules between ALL combinations of seaports
  console.log('Finding ship schedules between seaports...');
  
  // Get all unique seaports from both origin and destination
  const allSeaports = [...originSeaports, ...destSeaports];
  const uniqueSeaportCodes = [...new Set(allSeaports.map(port => port.code))];
  
  // Create a map for quick lookup
  const seaportMap = allSeaports.reduce((map, port) => {
    map[port.code] = port;
    return map;
  }, {});
  
  // Attempt to find ship schedules between all combinations
  for (const fromPortCode of uniqueSeaportCodes) {
    for (const toPortCode of uniqueSeaportCodes) {
      // Skip same port
      if (fromPortCode === toPortCode) continue;
      
      // Skip if either origin seaports doesn't include fromPort or destination seaports doesn't include toPort
      // (we want routes from origin ports to destination ports)
      const isOriginToDestRoute = 
        originSeaports.some(port => port.code === fromPortCode) && 
        destSeaports.some(port => port.code === toPortCode);
      
      // Also check all possible combinations for layover alternatives
      if (!isOriginToDestRoute) {
        // We will check these later for layover alternatives
        continue;
      }
      
      console.log(`Checking ship routes from ${fromPortCode} to ${toPortCode}`);
      
      try {
        const shipSchedules = await getShipSchedules(fromPortCode, toPortCode, startDate);
        console.log(`Found ${shipSchedules.length} ship routes from ${fromPortCode} to ${toPortCode}`);
        
        // Process each schedule with its stops
        for (const schedule of shipSchedules) {
          let prevPortCode = null;
          let prevPortTime = null;
          let prevPortId = null;
          let journeySegments = [];
          
          // Look at each stop in the schedule
          for (const stop of schedule.schedule) {
            const stopPortCode = stop.port;
            const stopPortId = stopPortCode;
            
            // Make sure port is in the graph
            if (!graph.nodes[stopPortId]) {
              try {
                const portDetails = await getSeaportDetails(stopPortCode);
                graph.nodes[stopPortId] = {
                  id: stopPortId,
                  name: portDetails.name,
                  type: 'seaport',
                  lat: portDetails.latitude_dd,
                  lng: portDetails.longitude_dd
                };
              } catch (error) {
                console.error(`Error fetching details for port ${stopPortCode}:`, error);
                continue; // Skip this port
              }
            }
            
            // Connect previous port to this port
            if (prevPortCode && prevPortTime && prevPortId) {
              const shipDistance = calculateDistance(
                graph.nodes[prevPortId].lat, graph.nodes[prevPortId].lng,
                graph.nodes[stopPortId].lat, graph.nodes[stopPortId].lng
              );
              
              const departureTime = new Date(prevPortTime);
              const arrivalTime = new Date(stop.eta || stop.etd);
              const durationHours = (arrivalTime - departureTime) / (1000 * 60 * 60);
              
              const shipEdge = {
                id: `ship_${prevPortId}_to_${stopPortId}_${schedule.voyage}`,
                source: prevPortId,
                target: stopPortId,
                mode: 'ship',
                voyageCode: schedule.voyage,
                shipName: schedule.shipName,
                distance: shipDistance,
                duration: durationHours,
                emissions: shipDistance * 0.04, // 40g CO2 per km for ships
                departureTime: prevPortTime,
                arrivalTime: stop.eta || stop.etd
              };
              
              graph.edges.push(shipEdge);
              
              // Log leg details
              const legDetail = {
                legId: shipEdge.id,
                origin: graph.nodes[prevPortId].name,
                destination: graph.nodes[stopPortId].name,
                mode: 'ship',
                voyageCode: schedule.voyage,
                shipName: schedule.shipName,
                departureLocation: { 
                  lat: graph.nodes[prevPortId].lat, 
                  lng: graph.nodes[prevPortId].lng 
                },
                arrivalLocation: { 
                  lat: graph.nodes[stopPortId].lat, 
                  lng: graph.nodes[stopPortId].lng 
                },
                departureTime: prevPortTime,
                arrivalTime: stop.eta || stop.etd,
                duration: durationHours
              };
              
              graph.legDetails.push(legDetail);
              journeySegments.push(legDetail);
            }
            
            // Update previous port for the next iteration
            prevPortCode = stopPortCode;
            prevPortId = stopPortId;
            prevPortTime = stop.etd;
          }
          
          // Add the complete ship journey to journeys list if it has segments
          if (journeySegments.length > 0) {
            const shipJourney = {
              type: 'ship',
              voyageCode: schedule.voyage,
              shipName: schedule.shipName,
              fromPort: fromPortCode,
              toPort: toPortCode,
              departureTime: journeySegments[0].departureTime,
              arrivalTime: journeySegments[journeySegments.length - 1].arrivalTime,
              segments: journeySegments,
              totalDuration: journeySegments.reduce((sum, segment) => sum + segment.duration, 0)
            };
            
            graph.journeys.push(shipJourney);
            
            // For each leg in the journey, find alternative transportation modes at the stop
            // This is for requirement #3: Find alternative transport mode at layover stops
            for (let i = 0; i < journeySegments.length; i++) {
              const segment = journeySegments[i];
              
              // Skip first and last segments - we only want intermediate stops (layovers)
              if (i === 0 || i === journeySegments.length - 1) continue;
              
              const layoverPortId = segment.departureLocation ? 
                Object.keys(graph.nodes).find(nodeId => 
                  graph.nodes[nodeId].type === 'seaport' && 
                  Math.abs(graph.nodes[nodeId].lat - segment.departureLocation.lat) < 0.01 &&
                  Math.abs(graph.nodes[nodeId].lng - segment.departureLocation.lng) < 0.01
                ) : null;
                
              if (!layoverPortId) continue;
              
              console.log(`Finding alternative transport from layover port ${graph.nodes[layoverPortId].name}`);
              
              // Find the nearest airports to this layover port
              const layoverPort = graph.nodes[layoverPortId];
              const nearbyAirports = await getNearestAirports(layoverPort.lat, layoverPort.lng, 3);
              
              // For each nearby airport, try to find flights to destination seaports/airports
              for (const nearbyAirport of nearbyAirports) {
                const airportId = nearbyAirport.code;
                
                // Add airport to graph if not already there
                if (!graph.nodes[airportId]) {
                  graph.nodes[airportId] = {
                    id: airportId,
                    name: nearbyAirport.name,
                    type: 'airport',
                    lat: parseFloat(nearbyAirport.latitude_dd),
                    lng: parseFloat(nearbyAirport.longitude_dd)
                  };
                }
                
                // Add road connection from layover port to nearby airport
                const roadDistance = calculateDistance(
                  layoverPort.lat, layoverPort.lng,
                  parseFloat(nearbyAirport.latitude_dd), parseFloat(nearbyAirport.longitude_dd)
                );
                const roadDuration = calculateRoadTravelTime(roadDistance);
                
                // Use the segment's arrival time as base for road departure
                const portArrivalTime = new Date(segment.arrivalTime);
                const roadDepartureTime = new Date(portArrivalTime.getTime() + 3 * 60 * 60 * 1000); // 3 hour buffer
                const roadArrivalTime = new Date(roadDepartureTime.getTime() + roadDuration * 60 * 60 * 1000);
                
                const roadEdge = {
                  id: `road_${layoverPortId}_to_${airportId}`,
                  source: layoverPortId,
                  target: airportId,
                  mode: 'road',
                  distance: roadDistance,
                  duration: roadDuration,
                  emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                  departureTime: safeToISOString(roadDepartureTime),
                  arrivalTime: safeToISOString(roadArrivalTime)
                };
                
                graph.edges.push(roadEdge);
                
                // Log leg details for the road connection
                const roadLegDetail = {
                  legId: roadEdge.id,
                  origin: layoverPort.name,
                  destination: nearbyAirport.name,
                  mode: 'road',
                  departureLocation: { lat: layoverPort.lat, lng: layoverPort.lng },
                  arrivalLocation: { 
                    lat: parseFloat(nearbyAirport.latitude_dd), 
                    lng: parseFloat(nearbyAirport.longitude_dd) 
                  },
                  departureTime: safeToISOString(roadDepartureTime),
                  arrivalTime: safeToISOString(roadArrivalTime),
                  duration: roadDuration
                };
                
                graph.legDetails.push(roadLegDetail);
                
                // Try to find flights from this airport to all destination airports
                for (const destAirport of destAirports) {
                  const destAirportId = destAirport.code;
                  
                  const flightDate = safeToISOString(roadArrivalTime).split('T')[0];
                  console.log(`Checking flights from ${airportId} to ${destAirportId} on ${flightDate}`);
                  
                  try {
                    const flightSchedules = await getFlightSchedules(airportId, destAirportId, flightDate);
                    
                    if (flightSchedules.length > 0) {
                      console.log(`Found ${flightSchedules.length} flights from ${airportId} to ${destAirportId}`);
                      
                      // Add flight to graph
                      const flight = flightSchedules[0];
                      const flightEdge = {
                        id: `flight_${airportId}_to_${destAirportId}_${flight.flightNo}`,
                        source: airportId,
                        target: destAirportId,
                        mode: 'air',
                        flightNo: flight.flightNo,
                        distance: flight.distance,
                        duration: flight.duration,
                        emissions: flight.distance * 0.25, // 250g CO2 per km for flights
                        departureTime: flight.departureTime,
                        arrivalTime: flight.arrivalTime
                      };
                      
                      graph.edges.push(flightEdge);
                      
                      // Log leg details for the flight
                      const flightLegDetail = {
                        legId: flightEdge.id,
                        origin: nearbyAirport.name,
                        destination: destAirport.name,
                        mode: 'air',
                        flightNo: flight.flightNo,
                        departureLocation: { 
                          lat: parseFloat(nearbyAirport.latitude_dd), 
                          lng: parseFloat(nearbyAirport.longitude_dd) 
                        },
                        arrivalLocation: { 
                          lat: parseFloat(destAirport.latitude_dd), 
                          lng: parseFloat(destAirport.longitude_dd) 
                        },
                        departureTime: flight.departureTime,
                        arrivalTime: flight.arrivalTime,
                        duration: flight.duration
                      };
                      
                      graph.legDetails.push(flightLegDetail);
                      
                      // Create multimodal journey segments including:
                      // 1. Ship segments up to the layover
                      // 2. Road transfer to airport
                      // 3. Flight to destination
                      const initialShipSegments = journeySegments.slice(0, i + 1);
                      
                      // Add a complete multimodal journey
                      const multimodalJourney = {
                        type: 'multimodal',
                        modes: ['ship', 'road', 'air'],
                        departureTime: initialShipSegments[0].departureTime,
                        arrivalTime: flight.arrivalTime,
                        segments: [...initialShipSegments, roadLegDetail, flightLegDetail],
                        totalDuration: calculateTotalDuration(
                          initialShipSegments[0].departureTime,
                          flight.arrivalTime
                        )
                      };
                      
                      graph.journeys.push(multimodalJourney);
                      
                      // Now consider the final road connection to destination if needed
                      if (destAirport) {
                        const finalRoadDistance = calculateDistance(
                          parseFloat(destAirport.latitude_dd), parseFloat(destAirport.longitude_dd),
                          destination.lat, destination.lng
                        );
                        const finalRoadDuration = calculateRoadTravelTime(finalRoadDistance);
                        
                        const flightArrivalTime = new Date(flight.arrivalTime);
                        const finalRoadDepartureTime = new Date(flightArrivalTime.getTime() + 2 * 60 * 60 * 1000); // 2 hour buffer
                        const finalRoadArrivalTime = new Date(finalRoadDepartureTime.getTime() + finalRoadDuration * 60 * 60 * 1000);
                        
                        const finalRoadEdge = {
                          id: `road_${destAirportId}_to_destination_${flight.flightNo}`,
                          source: destAirportId,
                          target: 'destination',
                          mode: 'road',
                          distance: finalRoadDistance,
                          duration: finalRoadDuration,
                          emissions: finalRoadDistance * 0.12,
                          departureTime: safeToISOString(finalRoadDepartureTime),
                          arrivalTime: safeToISOString(finalRoadArrivalTime)
                        };
                        
                        // Only add if not already in graph
                        if (!graph.edges.some(edge => edge.id === finalRoadEdge.id)) {
                          graph.edges.push(finalRoadEdge);
                          
                          // Log final road leg details
                          const finalRoadLegDetail = {
                            legId: finalRoadEdge.id,
                            origin: destAirport.name,
                            destination: 'Destination',
                            mode: 'road',
                            departureLocation: { 
                              lat: parseFloat(destAirport.latitude_dd), 
                              lng: parseFloat(destAirport.longitude_dd) 
                            },
                            arrivalLocation: { lat: destination.lat, lng: destination.lng },
                            departureTime: safeToISOString(finalRoadDepartureTime),
                            arrivalTime: safeToISOString(finalRoadArrivalTime),
                            duration: finalRoadDuration
                          };
                          
                          graph.legDetails.push(finalRoadLegDetail);
                          
                          // Add this complete journey with final road segment
                          const completeMultimodalJourney = {
                            type: 'multimodal',
                            modes: ['ship', 'road', 'air', 'road'],
                            departureTime: initialShipSegments[0].departureTime,
                            arrivalTime: safeToISOString(finalRoadArrivalTime),
                            segments: [...initialShipSegments, roadLegDetail, flightLegDetail, finalRoadLegDetail],
                            totalDuration: calculateTotalDuration(
                              initialShipSegments[0].departureTime,
                              safeToISOString(finalRoadArrivalTime)
                            )
                          };
                          
                          graph.journeys.push(completeMultimodalJourney);
                        }
                      }
                    }
                  } catch (error) {
                    console.error(`Error checking flights from ${airportId} to ${destAirportId}:`, error);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching ship schedules from ${fromPortCode} to ${toPortCode}:`, error);
      }
    }
  }
  
  // Step 5: Find flight schedules between all combinations of airports (air connections)
  console.log('Finding flight schedules between airports...');
  
  for (const originAirport of originAirports) {
    for (const destAirport of destAirports) {
      // Skip same airport
      if (originAirport.code === destAirport.code) continue;
      
      const originAirportId = originAirport.code;
      const destAirportId = destAirport.code;
      
      console.log(`Checking flights from ${originAirport.code} to ${destAirport.code}`);
      
      try {
        const flightSchedules = await getFlightSchedules(originAirport.code, destAirport.code, startDate);
        console.log(`Found ${flightSchedules.length} flights from ${originAirport.code} to ${destAirport.code}`);
        
        if (flightSchedules.length === 0) continue;
        
        // Add each flight to the graph
        for (const flight of flightSchedules) {
          const flightEdge = {
            id: `flight_${originAirportId}_to_${destAirportId}_${flight.flightNo}`,
            source: originAirportId,
            target: destAirportId,
            mode: 'air',
            flightNo: flight.flightNo,
            distance: flight.distance,
            duration: flight.duration,
            emissions: flight.distance * 0.25, // 250g CO2 per km for flights
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime
          };
          
          graph.edges.push(flightEdge);
          
          // Log leg details
          const flightLegDetail = {
            legId: flightEdge.id,
            origin: originAirport.name,
            destination: destAirport.name,
            mode: 'air',
            flightNo: flight.flightNo,
            departureLocation: { 
              lat: parseFloat(originAirport.latitude_dd), 
              lng: parseFloat(originAirport.longitude_dd) 
            },
            arrivalLocation: { 
              lat: parseFloat(destAirport.latitude_dd), 
              lng: parseFloat(destAirport.longitude_dd) 
            },
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            duration: flight.duration
          };
          
          graph.legDetails.push(flightLegDetail);
          
          // Add this journey to the list
          graph.journeys.push({
            type: 'air',
            flightNo: flight.flightNo,
            fromAirport: originAirport.code,
            toAirport: destAirport.code,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            segments: [flightLegDetail],
            totalDuration: flight.duration
          });
        }
      } catch (error) {
        console.error(`Error fetching flight schedules from ${originAirport.code} to ${destAirport.code}:`, error);
      }
    }
  }
  
  // Step 6: Find ship alternatives for air journeys with layovers (reverse of step 4)
  console.log('Finding ship alternatives for air journeys with layovers...');
  
  // This would be similar to the code for finding air alternatives for ship journeys,
  // but in reverse - looking for nearby seaports from airports
  
  // Step 7: Find road routes between ALL nodes (no distance limit)
  console.log('Adding road connections between ALL nodes...');
  
  const allNodes = Object.values(graph.nodes);
  
  for (let i = 0; i < allNodes.length; i++) {
    for (let j = i + 1; j < allNodes.length; j++) {
      const nodeA = allNodes[i];
      const nodeB = allNodes[j];
      
      // Skip if either node is origin or destination (already connected)
      // or if they're the same node
      if (nodeA.id === nodeB.id || 
          nodeA.id === 'origin' || nodeA.id === 'destination' || 
          nodeB.id === 'origin' || nodeB.id === 'destination') {
        continue;
      }
      
      // Skip if there's already a direct connection between these nodes
      const existingEdge = graph.edges.find(edge => 
        (edge.source === nodeA.id && edge.target === nodeB.id) || 
        (edge.source === nodeB.id && edge.target === nodeA.id)
      );
      
      if (existingEdge) continue;
      
      // Calculate road distance and duration
      const roadDistance = calculateDistance(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);
      const roadDuration = calculateRoadTravelTime(roadDistance);
      
      // Add bidirectional road connection
      const roadEdgeAB = {
        id: `road_${nodeA.id}_to_${nodeB.id}`,
        source: nodeA.id,
        target: nodeB.id,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12 // 120g CO2 per km for trucks
      };
      
      const roadEdgeBA = {
        id: `road_${nodeB.id}_to_${nodeA.id}`,
        source: nodeB.id,
        target: nodeA.id,
        mode: 'road',
        distance: roadDistance,
        duration: roadDuration,
        emissions: roadDistance * 0.12 // 120g CO2 per km for trucks
      };
      
      graph.edges.push(roadEdgeAB);
      graph.edges.push(roadEdgeBA);
      
      // Log leg details for road connections
      graph.legDetails.push({
        legId: roadEdgeAB.id,
        origin: nodeA.name,
        destination: nodeB.name,
        mode: 'road',
        departureLocation: { lat: nodeA.lat, lng: nodeA.lng },
        arrivalLocation: { lat: nodeB.lat, lng: nodeB.lng },
        duration: roadDuration
        // No departure/arrival times since these are generic connections
      });
      
      graph.legDetails.push({
        legId: roadEdgeBA.id,
        origin: nodeB.name,
        destination: nodeA.name,
        mode: 'road',
        departureLocation: { lat: nodeB.lat, lng: nodeB.lng },
        arrivalLocation: { lat: nodeA.lat, lng: nodeA.lng },
        duration: roadDuration
        // No departure/arrival times since these are generic connections
      });
    }
  }
  
  console.log(`Enhanced multimodal graph built with:`);
  console.log(`- ${Object.keys(graph.nodes).length} nodes`);
  console.log(`- ${graph.edges.length} edges`);
  console.log(`- ${graph.journeys.length} journeys`);
  console.log(`- ${graph.legDetails.length} leg details`);
  
  return graph;
}

/**
 * Calculate total duration in hours between two timestamps
 * @param {string} startTime - Start time in ISO format
 * @param {string} endTime - End time in ISO format
 * @returns {number} Duration in hours
 */
function calculateTotalDuration(startTime, endTime) {
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end - start) / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    console.error('Error calculating duration:', error);
    return 0;
  }
}

// If this script is run directly
if (require.main === module) {
  const origin = { lat: 9.931233, lng: 76.267304 }; // Cochin
  const destination = { lat: 52.370216, lng: 4.895168 }; // Amsterdam
  const startDate = '2025-05-01';
  
  buildMultimodalGraph(origin, destination, startDate)
    .then(graph => {
      // Save graph to a file
      fs.writeFileSync(
        path.join(__dirname, 'multimodal-graph.json'),
        JSON.stringify(graph, null, 2)
      );
      console.log('Multimodal graph saved to multimodal-graph.json');
    })
    .catch(err => {
      console.error('Error building multimodal graph:', err);
    })
    .finally(() => {
      // Close pool
      pool.end();
    });
}

module.exports = {
  buildMultimodalGraph,
  calculateDistance,
  calculateRoadTravelTime,
  getNearestAirports,
  getNearestSeaports,
  getShipSchedules,
  getFlightSchedules
}; 
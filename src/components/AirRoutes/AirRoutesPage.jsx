import React, { useState, useEffect, useCallback } from 'react';
import { 
  fetchAirRoutes, 
  fetchHapagShipRoutesGraph,
  dataStore 
} from '../../services/api';
import styles from './AirRoutesPage.module.scss';

const App = ({ origin, destination, flightDate }) => {
  const [flightData, setFlightData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [maxConnectionHours, setMaxConnectionHours] = useState(48); // Default to 48 hours for cargo
  
  // Add state for intermediate stops and enhanced graph
  const [intermediateStops, setIntermediateStops] = useState([]);
  const [intermediateRoutes, setIntermediateRoutes] = useState({});
  const [loadingIntermediates, setLoadingIntermediates] = useState(false);
  const [showEnhancedGraph, setShowEnhancedGraph] = useState(false);
  
  // Add states for multimodal transport
  const [nearestSeaports, setNearestSeaports] = useState({});
  const [seaRoutesData, setSeaRoutesData] = useState({});
  const [loadingSeaRoutes, setLoadingSeaRoutes] = useState(false);
  const [multimodalGraph, setMultimodalGraph] = useState(null);

  // Add a state variable for tracking graph storage status
  const [graphStorageStatus, setGraphStorageStatus] = useState('pending');

  const fetchFlightData = async () => {
    if (!flightDate) {
        setError("Flight date is required.");
        return;
    }
    
    if (!origin || !destination) {
        setError("Origin and destination airports are required.");
        return;
    }
    
    setLoading(true);
    setError(null);
    setFlightData(null);
    setIntermediateStops([]);
    setIntermediateRoutes({});

    try {
      console.log("======= STARTING FLIGHT DATA FETCH =======");
      console.log(`Fetching flights from ${origin} to ${destination} on ${flightDate}`);
      
      const res = await fetch("http://localhost:3000/api/air-cargo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          flightDate,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();
      
      // Log the full API response for debugging
      console.log("======= COMPLETE API RESPONSE =======");
      console.log(JSON.stringify(data, null, 2));
      console.log("=====================================");
      
      console.log(`Received flight data with ${data?.records?.length || 0} routes`);
      
      // For each route, log its key details
      if (data?.records?.length > 0) {
        console.log("======= ROUTE DETAILS =======");
        data.records.forEach((route, i) => {
          console.log(`Route ${i + 1} (${route.length} segments):`);
          route.forEach((segment, j) => {
            console.log(`  Segment ${j + 1}: ${segment.origin} → ${segment.destination}`);
            console.log(`    Flight: ${segment.carrierCode} ${segment.flightNo}`);
            console.log(`    Departure: ${segment.deptDateTimesLocal[0]}`);
            console.log(`    Arrival: ${segment.arrDateTimesLocal[0]}`);
            console.log(`    Aircraft: ${segment.aircraftType}`);
          });
        });
      }
      
      setFlightData(data);

      // After we get flight data, extract intermediate stops
      if (data?.records?.length > 0) {
        extractIntermediateStops(data.records);
      }
    } catch (err) {
      console.error("Error in fetchFlightData:", err);
      setError(`Failed to fetch flight data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Extract all unique intermediate stops from the routes
  const extractIntermediateStops = (routes) => {
    console.log("Extracting intermediate stops...");
    
    const intermediateStopsMap = {};
    
    routes.forEach((route, routeIndex) => {
      // Skip routes with only one segment (no intermediate stops)
      if (route.length <= 1) return;
      
      // Process each segment of the route
      for (let i = 0; i < route.length; i++) {
        const segment = route[i];
        
        // Check if the destination of this segment is an intermediate stop
        // (not the final destination and not the origin)
        if (segment.destination !== destination && segment.destination !== origin) {
          console.log(`Found intermediate stop: ${segment.destination} in route ${routeIndex}`);
          
          const stopAirport = segment.destination;
          const arrivalTime = segment.arrDateTimesLocal[0];
          
          // Skip if missing time information
          if (!arrivalTime) continue;
          
          // Create a key for this intermediate stop
          const key = stopAirport;
          
          if (!intermediateStopsMap[key]) {
            intermediateStopsMap[key] = {
              airport: stopAirport,
              arrivals: []
            };
          }
          
          // Find the next departure from this stop (if any)
          const nextSegment = i < route.length - 1 ? route[i + 1] : null;
          const departureTime = nextSegment?.deptDateTimesLocal?.[0] || null;
          
          // Add this arrival to the stop
          intermediateStopsMap[key].arrivals.push({
            arrivalTime,
            departureTime,
            routeIndex,
            segmentIndex: i,
            inboundFlight: {
              carrierCode: segment.carrierCode,
              flightNo: segment.flightNo,
              fromAirport: segment.origin
            },
            outboundFlight: nextSegment ? {
              carrierCode: nextSegment.carrierCode,
              flightNo: nextSegment.flightNo,
              toAirport: nextSegment.destination
            } : null
          });
        }
      }
    });
    
    // Convert to array and sort by airport code
    const intermediateStopsArray = Object.values(intermediateStopsMap).sort((a, b) => 
      a.airport.localeCompare(b.airport)
    );
    
    console.log(`Found ${intermediateStopsArray.length} intermediate stops:`, 
      intermediateStopsArray.map(stop => stop.airport).join(', '));
      
    // Log detailed information about each intermediate stop
    intermediateStopsArray.forEach(stop => {
      console.log(`Intermediate stop ${stop.airport} has ${stop.arrivals.length} arrivals:`);
      stop.arrivals.forEach((arrival, i) => {
        console.log(`  Arrival ${i+1}: from ${arrival.inboundFlight.fromAirport} at ${arrival.arrivalTime}`);
        if (arrival.departureTime) {
          console.log(`    Departs at ${arrival.departureTime}`);
        }
      });
    });
    
    setIntermediateStops(intermediateStopsArray);
    
    // If we have intermediate stops, fetch routes from them
    if (intermediateStopsArray.length > 0) {
      fetchIntermediateRoutes(intermediateStopsArray);
    } else {
      console.log("No intermediate stops found to explore alternative routes");
    }
  };
  
  // Fetch routes from each intermediate stop to the final destination
  const fetchIntermediateRoutes = async (stops) => {
    console.log("Fetching routes from intermediate stops to final destination...");
    setLoadingIntermediates(true);
    
    const intermediateRoutesData = {};
    
    // Track processed queries to avoid duplicates
    const processedQueries = new Set();
    
    // Prepare all requests to be run in parallel
    const fetchPromises = [];
    
    // For each intermediate stop
    stops.forEach(stop => {
      console.log(`Processing intermediate stop: ${stop.airport}`);
      
      // For each arrival at this stop
      stop.arrivals.forEach(arrival => {
          // Use the arrival time as the basis for the new departure date
        const arrivalDate = new Date(arrival.arrivalTime);
          const departureDate = formatDateForApi(arrivalDate);
        
          // Create a buffer (e.g., 2 hours) for the minimum connection time
        const minDepartureTime = new Date(arrivalDate);
        minDepartureTime.setHours(minDepartureTime.getHours() + 2);
        
        // Create a unique query ID to avoid duplicates
        const queryId = `${stop.airport}-${destination}-${departureDate}`;
        
        // Skip if we've already processed this exact query
        if (processedQueries.has(queryId)) {
          console.log(`Skipping duplicate query: ${queryId}`);
          return;
        }
        
        // Mark this query as processed
        processedQueries.add(queryId);
        
        console.log(`Preparing request for routes from ${stop.airport} to ${destination} on ${departureDate}`);
          console.log(`Arrival at ${stop.airport}: ${arrival.arrivalTime}`);
          console.log(`Minimum departure time: ${minDepartureTime.toISOString()}`);
          
        // Create a promise for this fetch operation
        const fetchPromise = fetch("http://localhost:3000/api/air-cargo", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              origin: stop.airport,
              destination,
              flightDate: departureDate,
            }),
        }).then(async res => {
          if (!res.ok) {
            console.error(`Error fetching routes: ${res.status}`);
            return { error: true, status: res.status, stop, arrival };
          }
          
          const data = await res.json();
          console.log(`Found ${data?.records?.length || 0} routes from ${stop.airport} to ${destination}`);
          
          // Filter routes to only include those that depart after the minimum connection time
          const validRoutes = data?.records?.filter(route => {
            if (!route[0]?.deptDateTimesLocal?.[0]) return false;
            const departureTime = new Date(route[0].deptDateTimesLocal[0]);
            return departureTime > minDepartureTime;
          }) || [];
          
          console.log(`After filtering: ${validRoutes.length} valid routes`);
          
          return {
            error: false,
            stop,
            arrival,
            validRoutes,
            minDepartureTime
          };
        }).catch(error => {
          console.error(`Error fetching routes from ${stop.airport}:`, error);
          return { error: true, message: error.message, stop, arrival };
        });
        
        fetchPromises.push(fetchPromise);
      });
    });
    
    try {
      // Run all fetch operations in parallel
      console.log(`Executing ${fetchPromises.length} parallel requests...`);
      const results = await Promise.all(fetchPromises);
      
      // Process the results
      results.forEach(result => {
        if (result.error) {
          console.log(`Skipping result due to error: ${result.message || result.status}`);
          return;
        }
        
        const { stop, arrival, validRoutes, minDepartureTime } = result;
          
          // Store these valid routes
          if (validRoutes.length > 0) {
            const key = `${stop.airport}-${formatDateForDisplay(arrival.arrivalTime)}`;
            intermediateRoutesData[key] = {
              fromStop: stop.airport,
              toDestination: destination,
              arrivalTime: arrival.arrivalTime,
              minDepartureTime: minDepartureTime.toISOString(),
              inboundFlight: arrival.inboundFlight,
              routes: validRoutes
            };
          }
      });
      
      console.log("Intermediate routes data:", intermediateRoutesData);
      setIntermediateRoutes(intermediateRoutesData);
      
      // Automatically build and store the enhanced air graph without requiring user interaction
      if (Object.keys(intermediateRoutesData).length > 0) {
        console.log("Automatically building and storing enhanced air graph...");
        
        try {
          // Set storage status to indicate we're processing
          setGraphStorageStatus('storing');
          
          // Build the enhanced graph
          const enhancedGraph = buildEnhancedGraph(intermediateRoutesData);
          
          // Store it in the dataStore
          if (typeof dataStore !== 'undefined') {
            dataStore.enhancedAirGraph = enhancedGraph;
            console.log("Enhanced air graph automatically stored in dataStore.enhancedAirGraph");
          }
          
          // Also make it available in the window object
          window.enhancedAirGraph = enhancedGraph;
          console.log("Enhanced air graph available at window.enhancedAirGraph");
          
          // If we also have an airRoutesGraph, update it to include this data
          if (typeof dataStore !== 'undefined' && dataStore.airRoutesGraph) {
            // Merge the new graph data into the existing airRoutesGraph
            const mergedGraph = { ...dataStore.airRoutesGraph };
            
            // Add nodes and connections from the enhanced graph
            Object.keys(enhancedGraph.nodes || {}).forEach(nodeKey => {
              if (!mergedGraph[nodeKey]) {
                mergedGraph[nodeKey] = [];
              }
              
              // Add any new connections (edges)
              (enhancedGraph.edges || []).forEach(edge => {
                if (edge.from === nodeKey) {
                  // Format the edge into the expected format for the air routes graph
                  const edgeInfo = {
                    shipId: edge.id || `flight_${edge.flight}`,
                    shipName: edge.flight,
                    voyage: edge.flight.split(' ')[1], // Assumes format "XX 1234"
                    fromPort: edge.from,
                    fromPortName: edge.from,
                    toPort: edge.to,
                    toPortName: edge.to,
                    departureTime: edge.departure,
                    arrivalTime: edge.arrival,
                    type: 'air',
                    aircraft: edge.aircraft || 'Unknown',
                    carrier: edge.flight.split(' ')[0]
                  };
                  
                  // Check if this edge already exists to avoid duplicates
                  const edgeExists = mergedGraph[nodeKey].some(
                    existing => existing.shipId === edgeInfo.shipId
                  );
                  
                  if (!edgeExists) {
                    mergedGraph[nodeKey].push(edgeInfo);
                  }
                }
              });
            });
            
            // Update the dataStore with the merged graph
            dataStore.airRoutesGraph = mergedGraph;
            console.log("Merged enhanced graph data into dataStore.airRoutesGraph");
            
            // Also update the window object
            window.airRoutesGraph = mergedGraph;
          }
          
          // Update the storage status to success
          setGraphStorageStatus('stored');
          console.log("Enhanced graph storing complete");
        } catch (error) {
          console.error("Error automatically storing enhanced graph:", error);
          setGraphStorageStatus('error');
        }
      }
    } catch (error) {
      console.error("Error in fetchIntermediateRoutes:", error);
    } finally {
    setLoadingIntermediates(false);
    }
  };
  
  // Format date for API (YYYY-MM-DD)
  const formatDateForApi = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  
  // Format date for display
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (e) {
      console.error("Error formatting date for display:", e);
      return dateStr;
    }
  };

  useEffect(() => {
    if (origin && destination && flightDate) {
      fetchFlightData();
    }
  }, [origin, destination, flightDate]);

  // Filter routes by connection time
  const filterRoutes = (routes) => {
    if (!routes || !Array.isArray(routes)) return [];
    if (showAllRoutes) return routes;
    
    return routes.filter(route => {
      // Check for unreasonable connection times between flights
      for (let i = 0; i < route.length - 1; i++) {
        const currentFlight = route[i];
        const nextFlight = route[i + 1];
        
        if (!currentFlight.arrDateTimesLocal[0] || !nextFlight.deptDateTimesLocal[0]) {
          continue; // Skip if missing time data
        }
        
        const arrivalTime = new Date(currentFlight.arrDateTimesLocal[0]);
        const departureTime = new Date(nextFlight.deptDateTimesLocal[0]);
        const connectionHours = (departureTime - arrivalTime) / (1000 * 60 * 60);
        
        // Filter out connections with more than maxConnectionHours wait time
        if (connectionHours > maxConnectionHours) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Calculate total journey time from first departure to last arrival
  const calculateTotalJourneyTime = (route) => {
    if (!route || route.length === 0) return "";
    
    const firstDeparture = new Date(route[0].deptDateTimesLocal[0]);
    const lastArrival = new Date(route[route.length - 1].arrDateTimesLocal[0]);
    const totalHours = (lastArrival - firstDeparture) / (1000 * 60 * 60);
    
    const days = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    
    return days > 0 ? 
      `${days}d ${hours}h total journey` : 
      `${hours}h total journey`;
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    try {
      const date = new Date(dateTimeStr);
      
      const day = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
      
      const time = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
      
      return (
        <div>
          <div className={styles.day}>{day}</div>
          <div className={styles.time}>{time}</div>
        </div>
      );
    } catch (e) {
      console.error("Error formatting date time:", e);
      return dateTimeStr;
    }
  };

  // Calculate connection time between flights
  const getConnectionTime = (arrivalTime, departureTime) => {
    if (!arrivalTime || !departureTime) return "";
    
    const arrival = new Date(arrivalTime);
    const departure = new Date(departureTime);
    const timeDiff = departure - arrival;
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h connection`;
    }
    
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m connection`;
  };

  const renderFlightRoute = (route, routeIndex) => {
    return (
      <div className={styles.flightRoute} key={`route-${routeIndex}`}>
        <h3 className={styles.flightRouteHeader}>
          Route Option {routeIndex + 1}
          {route.length > 1 && (
            <span className={styles.connectionIndicator}>
              {route.length - 1} {route.length - 1 === 1 ? 'Connection' : 'Connections'}
            </span>
          )}
          <span className={styles.totalJourneyTime}>{calculateTotalJourneyTime(route)}</span>
        </h3>
        
        {route.map((flight, flightIndex) => (
          <React.Fragment key={`flight-${flightIndex}`}>
            <div className={styles.flightSegment}>
              <div className={styles.flightHeader}>
                <span className={styles.flightNumber}>
                {flight.carrierCode} {flight.flightNo}
              </span>
                <span className={styles.aircraftType}>
                {flight.aircraftType}
              </span>
            </div>
            
              <div className={styles.flightRoute}>
                <div className={styles.routePoint}>
                  <div className={styles.airportCode}>{flight.origin}</div>
                  <div className={styles.flightDateTime}>
                  {formatDateTime(flight.deptDateTimesLocal[0])}
                </div>
              </div>
              
                <div className={styles.routeDivider}>
                  <div className={styles.routeLine}></div>
                  <div className={styles.flightDuration}>
                    {calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0])}
                  </div>
                </div>
                
                <div className={styles.routePoint}>
                  <div className={styles.airportCode}>{flight.destination}</div>
                  <div className={styles.flightDateTime}>
                    {formatDateTime(flight.arrDateTimesLocal[0])}
                  </div>
                </div>
              </div>
              
              <div className={styles.flightInfo}>
                <span className={styles.flightSequence}>
                  Flight {flightIndex + 1} of {route.length}
                </span>
                <span className={styles.stopInfo}>
                  {flight.numberOfStop > 0 ? `Stops: ${flight.numberOfStop}` : 'Direct Flight'}
                </span>
                {flight.flightCancelled && (
                  <span className={styles.flightCancelled}>CANCELLED</span>
                )}
              </div>
            </div>
            
            {/* Show connection time between flights */}
            {flightIndex < route.length - 1 && (
              <div className={styles.connectionTime}>
                {getConnectionTime(
                  flight.arrDateTimesLocal[0],
                  route[flightIndex + 1].deptDateTimesLocal[0]
              )}
            </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const calculateDuration = (departureTime, arrivalTime) => {
    if (!departureTime || !arrivalTime) return "";
    
    const departure = new Date(departureTime);
    const arrival = new Date(arrivalTime);
    const durationMs = arrival - departure;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const toggleRawData = () => {
    setShowRawData(!showRawData);
  };
  
  const toggleAllRoutes = () => {
    setShowAllRoutes(!showAllRoutes);
  };
  
  const toggleEnhancedGraph = () => {
    // Toggle the display state
    setShowEnhancedGraph(!showEnhancedGraph);
    
    // If we're turning on the enhanced graph, make sure it's stored properly
    if (!showEnhancedGraph) { // This means we're about to show it
      try {
        setGraphStorageStatus('storing');
        console.log("Preparing enhanced air routes graph for display and storage...");
        
        // Build the enhanced graph
        const enhancedGraph = buildEnhancedGraph();
        
        // Store it in the dataStore
        if (typeof dataStore !== 'undefined') {
          dataStore.enhancedAirGraph = enhancedGraph;
          console.log("Enhanced air graph stored in dataStore.enhancedAirGraph");
        }
        
        // Also make it available in the window object
        window.enhancedAirGraph = enhancedGraph;
        console.log("Enhanced air graph available at window.enhancedAirGraph");
        
        // If we also have an airRoutesGraph, update it to include this data
        if (typeof dataStore !== 'undefined' && dataStore.airRoutesGraph) {
          // Merge the new graph data into the existing airRoutesGraph
          const mergedGraph = { ...dataStore.airRoutesGraph };
          
          // Add nodes and connections from the enhanced graph
          Object.keys(enhancedGraph.nodes || {}).forEach(nodeKey => {
            if (!mergedGraph[nodeKey]) {
              mergedGraph[nodeKey] = [];
            }
            
            // Add any new connections (edges)
            (enhancedGraph.edges || []).forEach(edge => {
              if (edge.from === nodeKey) {
                // Format the edge into the expected format for the air routes graph
                const edgeInfo = {
                  shipId: edge.id || `flight_${edge.flight}`,
                  shipName: edge.flight,
                  voyage: edge.flight.split(' ')[1], // Assumes format "XX 1234"
                  fromPort: edge.from,
                  fromPortName: edge.from,
                  toPort: edge.to,
                  toPortName: edge.to,
                  departureTime: edge.departure,
                  arrivalTime: edge.arrival,
                  type: 'air',
                  aircraft: edge.aircraft || 'Unknown',
                  carrier: edge.flight.split(' ')[0]
                };
                
                // Check if this edge already exists to avoid duplicates
                const edgeExists = mergedGraph[nodeKey].some(
                  existing => existing.shipId === edgeInfo.shipId
                );
                
                if (!edgeExists) {
                  mergedGraph[nodeKey].push(edgeInfo);
                }
              }
            });
          });
          
          // Update the dataStore with the merged graph
          dataStore.airRoutesGraph = mergedGraph;
          console.log("Merged enhanced graph data into dataStore.airRoutesGraph");
          
          // Also update the window object
          window.airRoutesGraph = mergedGraph;
        }
        
        // Update the storage status to success
        setGraphStorageStatus('stored');
        
        // Remove the alert notification - no need to interrupt user experience
      } catch (error) {
        console.error("Error storing enhanced graph:", error);
        setGraphStorageStatus('error');
      }
    }
  };
  
  // Helper function to build the enhanced graph structure
  const buildEnhancedGraph = (routesData = null) => {
    // Use provided routes data or fall back to the state
    const intermediateRoutesData = routesData || intermediateRoutes;
    
    const nodes = {};
    const edges = [];
    const addedEdgeKeys = new Set(); // Keep track of unique edges added
    
    // Helper to generate a unique key for an edge
    const generateEdgeKey = (flight) => {
      const departureTime = flight.deptDateTimesLocal?.[0] || flight.departure || '';
      return `${flight.carrierCode}${flight.flightNo}_${flight.origin}_${flight.destination}_${departureTime}`;
    };

    // Add nodes and edges from direct routes
    if (flightData?.records) {
      flightData.records.forEach((route, routeIndex) => {
        route.forEach((flight, flightIndex) => {
          // Add nodes for each airport
          if (!nodes[flight.origin]) {
            nodes[flight.origin] = { id: flight.origin, name: flight.origin, type: 'airport' };
          }
          if (!nodes[flight.destination]) {
            nodes[flight.destination] = { id: flight.destination, name: flight.destination, type: 'airport' };
          }
          
          // Generate unique key for this flight segment
          const edgeKey = generateEdgeKey(flight);

          // Add edge only if this key hasn't been added
          if (!addedEdgeKeys.has(edgeKey)) {
            edges.push({
              id: `${flight.carrierCode}${flight.flightNo}_${routeIndex}_${flightIndex}`,
              from: flight.origin,
              to: flight.destination,
              flight: `${flight.carrierCode} ${flight.flightNo}`,
              departure: flight.deptDateTimesLocal[0],
              arrival: flight.arrDateTimesLocal[0],
              duration: calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0]),
              aircraft: flight.aircraftType,
              isDirectRoute: true,
              routeIndex,
              flightIndex
            });
            addedEdgeKeys.add(edgeKey); // Mark this edge key as added
          }
        });
      });
    }
    
    // Add edges from intermediate routes
    Object.entries(intermediateRoutesData).forEach(([key, data]) => {
      if (!data.routes) return;
      
      data.routes.forEach((route, routeIndex) => {
        route.forEach((flight, flightIndex) => {
          // Add nodes for each airport
          if (!nodes[flight.origin]) {
            nodes[flight.origin] = { id: flight.origin, name: flight.origin, type: 'airport' };
          }
          if (!nodes[flight.destination]) {
            nodes[flight.destination] = { id: flight.destination, name: flight.destination, type: 'airport' };
          }
          
          // Generate unique key for this flight segment
          const edgeKey = generateEdgeKey(flight);
          
          // Add edge only if this key hasn't been added
          if (!addedEdgeKeys.has(edgeKey)) {
             edges.push({
               id: `${flight.carrierCode}${flight.flightNo}_${key}_${routeIndex}_${flightIndex}`,
               from: flight.origin,
               to: flight.destination,
               flight: `${flight.carrierCode} ${flight.flightNo}`,
               departure: flight.deptDateTimesLocal[0],
               arrival: flight.arrDateTimesLocal[0],
               duration: calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0]),
               aircraft: flight.aircraftType,
               isIntermediateRoute: true,
               intermediateKey: key,
               routeIndex,
               flightIndex
             });
             addedEdgeKeys.add(edgeKey); // Mark this edge key as added
          }
        });
      });
    });
    
    console.log(`buildEnhancedGraph: Added ${addedEdgeKeys.size} unique edges.`);
    return { nodes, edges };
  };

  // Add back the connection hours handler
  const handleConnectionHoursChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setMaxConnectionHours(value);
    }
  };
  
  // Render the air routes graph visualization
  const renderEnhancedGraph = () => {
    // Build the graph just for visualization
    const nodes = new Set();
    const edges = [];
    
    // Add nodes and edges from direct routes
    if (flightData?.records) {
      flightData.records.forEach((route, routeIndex) => {
        route.forEach((flight, flightIndex) => {
          // Add nodes for each airport
          nodes.add(flight.origin);
          nodes.add(flight.destination);
          
          // Add edge for this flight
          edges.push({
            from: flight.origin,
            to: flight.destination,
            flight: `${flight.carrierCode} ${flight.flightNo}`,
            departure: flight.deptDateTimesLocal[0],
            arrival: flight.arrDateTimesLocal[0],
            duration: calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0]),
            aircraft: flight.aircraftType,
            isDirectRoute: true,
            routeIndex,
            flightIndex
          });
        });
      });
    }
    
    // Add edges from intermediate routes
    Object.entries(intermediateRoutes).forEach(([key, data]) => {
      data.routes.forEach((route, routeIndex) => {
        route.forEach((flight, flightIndex) => {
          // Add nodes for each airport
          nodes.add(flight.origin);
          nodes.add(flight.destination);
          
          // Add edge for this flight
          edges.push({
            from: flight.origin,
            to: flight.destination,
            flight: `${flight.carrierCode} ${flight.flightNo}`,
            departure: flight.deptDateTimesLocal[0],
            arrival: flight.arrDateTimesLocal[0],
            duration: calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0]),
            aircraft: flight.aircraftType,
            isIntermediateRoute: true,
            intermediateKey: key,
            routeIndex,
            flightIndex
          });
        });
      });
    });
    
    return (
      <div className={styles.enhancedGraph}>
        <h3 className={styles.graphTitle}>Air Routes Network Visualization</h3>
        
        <div className={styles.graphStats}>
          <div className={styles.graphStat}>
            <span className={styles.statValue}>{nodes.size}</span>
            <span className={styles.statLabel}>Airports</span>
          </div>
          <div className={styles.graphStat}>
            <span className={styles.statValue}>{edges.length}</span>
            <span className={styles.statLabel}>Flight Connections</span>
          </div>
          <div className={styles.graphStat}>
            <span className={styles.statValue}>{Object.keys(intermediateRoutes).length}</span>
            <span className={styles.statLabel}>Enhanced Connections</span>
          </div>
        </div>
        
        <div className={styles.graphContainer}>
          {/* This would typically use a visualization library like d3.js or vis.js */}
          <div className={styles.graphPlaceholder}>
            <p>Air Routes Network Graph would render here.</p>
            <p>Nodes: {Array.from(nodes).join(', ')}</p>
            <div className={styles.edgesList}>
              <h4>Flight Connections:</h4>
              <div className={styles.edgesTable}>
                <table>
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Flight</th>
                      <th>Departure</th>
                      <th>Arrival</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((edge, i) => (
                      <tr key={i} className={edge.isIntermediateRoute ? styles.intermediateRoute : ''}>
                        <td>{edge.from}</td>
                        <td>{edge.to}</td>
                        <td>{edge.flight}</td>
                        <td>{formatDateForDisplay(edge.departure)}</td>
                        <td>{formatDateForDisplay(edge.arrival)}</td>
                        <td>{edge.isDirectRoute ? 'Direct' : 'Enhanced'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Render intermediate stops
  const renderIntermediateStops = () => {
    if (intermediateStops.length === 0) return null;
    
    return (
      <div className={styles.intermediateStopsContainer}>
        <h3 className={styles.intermediateStopsTitle}>Intermediate Stops</h3>
        <p className={styles.intermediateStopsDescription}>
          Airports visited during connections between {origin} and {destination}
        </p>
        
        <div className={styles.intermediateStopsList}>
          {intermediateStops.map((stop, index) => (
            <div key={index} className={styles.intermediateStop}>
              <div className={styles.stopHeader}>
                <span className={styles.stopAirport}>{stop.airport}</span>
                <span className={styles.arrivalCount}>{stop.arrivals.length} arrivals</span>
              </div>
              
              <div className={styles.stopArrivals}>
                {stop.arrivals.map((arrival, i) => (
                  <div key={i} className={styles.stopArrival}>
                    <div className={styles.arrivalInfo}>
                      <span className={styles.arrivalTime}>
                        Arrives: {formatDateForDisplay(arrival.arrivalTime)}
                      </span>
                      <span className={styles.arrivalFlight}>
                        Via: {arrival.inboundFlight.carrierCode} {arrival.inboundFlight.flightNo} from {arrival.inboundFlight.fromAirport}
                      </span>
                    </div>
                    {arrival.departureTime && (
                      <div className={styles.departureInfo}>
                        <span className={styles.departureTime}>
                          Departs: {formatDateForDisplay(arrival.departureTime)}
                        </span>
                        {arrival.outboundFlight && (
                          <span className={styles.departureFlight}>
                            Via: {arrival.outboundFlight.carrierCode} {arrival.outboundFlight.flightNo} to {arrival.outboundFlight.toAirport}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
          </div>
        ))}
        </div>
      </div>
    );
  };
  
  // Render intermediate routes
  const renderIntermediateRoutesSection = () => {
    const intermediateKeys = Object.keys(intermediateRoutes);
    if (intermediateKeys.length === 0) return null;
    
    return (
      <div className={styles.intermediateRoutesContainer}>
        <h3 className={styles.intermediateRoutesTitle}>Enhanced Connections</h3>
        <p className={styles.intermediateRoutesDescription}>
          Alternative routes through intermediate stops to reach {destination}
        </p>
        
        <div className={styles.intermediateRoutesList}>
          {intermediateKeys.map((key, index) => {
            const data = intermediateRoutes[key];
            return (
              <div key={index} className={styles.intermediateRouteItem}>
                <div className={styles.routeHeader}>
                  <h4 className={styles.routeTitle}>
                    From {data.fromStop} to {destination} 
                    <span className={styles.routeInfo}>
                      (Arrived at {data.fromStop} at {formatDateForDisplay(data.arrivalTime)})
                    </span>
                  </h4>
                </div>
                
                <div className={styles.routeConnections}>
                  {data.routes.length > 0 ? (
                    <>
                      <div className={styles.connectionsHeader}>
                        <span className={styles.connectionsCount}>
                          {data.routes.length} connections available
                        </span>
                        <span className={styles.connectionsDepartAfter}>
                          (Departing after {formatDateForDisplay(data.minDepartureTime)})
              </span>
            </div>
            
                      {/* Use the same card style as the main routes */}
                      {data.routes.map((route, routeIndex) => (
                        <div key={routeIndex} className={styles.flightRoute}>
                          <h3 className={styles.flightRouteHeader}>
                            Alternative Route {routeIndex + 1}
                            {route.length > 1 && (
                              <span className={styles.connectionIndicator}>
                                {route.length - 1} {route.length - 1 === 1 ? 'Connection' : 'Connections'}
                              </span>
                            )}
                            <span className={styles.totalJourneyTime}>{calculateTotalJourneyTime(route)}</span>
                          </h3>
                          
                          {route.map((flight, flightIndex) => (
                            <React.Fragment key={`flight-${flightIndex}`}>
                              <div className={styles.flightSegment}>
                                <div className={styles.flightHeader}>
                                  <span className={styles.flightNumber}>
                                    {flight.carrierCode} {flight.flightNo}
                                  </span>
                                  <span className={styles.aircraftType}>
                                    {flight.aircraftType}
              </span>
            </div>
            
                                <div className={styles.flightRoute}>
                                  <div className={styles.routePoint}>
                                    <div className={styles.airportCode}>{flight.origin}</div>
                                    <div className={styles.flightDateTime}>
                                      {formatDateTime(flight.deptDateTimesLocal[0])}
                                    </div>
                                  </div>
                                  
                                  <div className={styles.routeDivider}>
                                    <div className={styles.routeLine}></div>
                                    <div className={styles.flightDuration}>
                                      {calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0])}
                                    </div>
                                  </div>
                                  
                                  <div className={styles.routePoint}>
                                    <div className={styles.airportCode}>{flight.destination}</div>
                                    <div className={styles.flightDateTime}>
                                      {formatDateTime(flight.arrDateTimesLocal[0])}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className={styles.flightInfo}>
                                  <span className={styles.flightSequence}>
                                    Flight {flightIndex + 1} of {route.length}
                      </span>
                                  <span className={styles.stopInfo}>
                                    {flight.numberOfStop > 0 ? `Stops: ${flight.numberOfStop}` : 'Direct Flight'}
                      </span>
                                  {flight.flightCancelled && (
                                    <span className={styles.flightCancelled}>CANCELLED</span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Show connection time between flights */}
                              {flightIndex < route.length - 1 && (
                                <div className={styles.connectionTime}>
                                  {getConnectionTime(
                                    flight.arrDateTimesLocal[0],
                                    route[flightIndex + 1].deptDateTimesLocal[0]
                                  )}
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className={styles.noConnections}>
                      No valid connections found
                    </div>
                  )}
                </div>
            </div>
            );
          })}
          </div>
      </div>
    );
  };

  return (
    <div className={styles.airRoutesContent}>
      <div className={styles.contentContainer}>
        <div className={styles.contentHeader}>
          <h2 className={styles.sectionTitle}>Cargo Flight Search</h2>
          <p className={styles.sectionDescription}>Find available cargo routes and schedules for the selected date</p>
        </div>
        
        {loading && (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p className={styles.loadingText}>Searching for flights...</p>
          </div>
        )}
        
        {loadingIntermediates && (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p className={styles.loadingText}>Building enhanced route graph...</p>
          </div>
        )}
        
        {error && (
          <div className={styles.errorContainer}>
            <div className={styles.errorMessage}>{error}</div>
          </div>
        )}
        
        {flightData && flightData.records && flightData.records.length > 0 && (
          <div className={styles.resultsContainer}>
            <div className={styles.resultsHeader}>
              <h2 className={styles.resultsTitle}>Available Routes for {flightDate}</h2>
              <div className={styles.routeOptions}>
                <div className={styles.filterOption}>
                  <label htmlFor="connectionHours">Max Connection Hours:</label>
                  <input 
                    type="number" 
                    id="connectionHours"
                    value={maxConnectionHours}
                    onChange={handleConnectionHoursChange}
                    min="1"
                    max="240"
                  />
                </div>
                <button 
                  className={styles.showAllButton} 
                  onClick={toggleAllRoutes}
                >
                  {showAllRoutes ? 'Filter Routes' : 'Show All Routes'}
                </button>
                <button 
                  className={styles.debugButton} 
                  onClick={toggleRawData}
                >
                  {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
                </button>
                <button 
                  className={`${styles.showAllButton} ${styles.graphButton || ''}`} 
                  onClick={toggleEnhancedGraph}
                >
                  {showEnhancedGraph ? 'Hide Enhanced Graph' : 'Show Enhanced Graph'}
                  {graphStorageStatus === 'stored' && (
                    <span style={{ 
                      display: 'inline-block', 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      background: '#4caf50',
                      marginLeft: '5px' 
                    }} title="Graph stored in dataStore and window"></span>
                  )}
                  {graphStorageStatus === 'storing' && (
                    <span style={{ 
                      display: 'inline-block', 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      background: '#ff9800',
                      marginLeft: '5px' 
                    }} title="Storing graph..."></span>
                  )}
                  {graphStorageStatus === 'error' && (
                    <span style={{ 
                      display: 'inline-block', 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      background: '#f44336',
                      marginLeft: '5px' 
                    }} title="Error storing graph"></span>
                  )}
                </button>
              </div>
            </div>
            
            {showRawData && (
              <div className={styles.rawDataContainer}>
                <h3>Raw API Response Data</h3>
                <pre className={styles.rawData}>
                  {JSON.stringify(flightData, null, 2)}
                </pre>
              </div>
            )}
            
            {/* Show enhanced graph if available and enabled */}
            {showEnhancedGraph && (
              <>
                {renderEnhancedGraph()}
            {renderIntermediateStops()}
                {renderIntermediateRoutesSection()}
              </>
            )}
            
            <div className={styles.filterSummary}>
              Showing {filterRoutes(flightData.records).length} of {flightData.records.length} routes
              {!showAllRoutes && ` (filtered by max ${maxConnectionHours}h connection time)`}
            </div>
            
            {filterRoutes(flightData.records).length > 0 ? (
              filterRoutes(flightData.records).map((route, index) => 
                renderFlightRoute(route, index)
              )
            ) : (
              <div className={styles.noFilteredRoutes}>
                <p>No routes match your filter criteria.</p>
                <button 
                  className={styles.showAllButton}
                  onClick={() => setShowAllRoutes(true)}
                >
                  Show All Routes
                </button>
              </div>
            )}
          </div>
        )}

        {flightData && (!flightData.records || flightData.records.length === 0) && !loading && !error && (
          <div className={styles.emptyResultsContainer}>
            No direct routes found for {origin} to {destination} on {flightDate}.
          </div>
        )}
        
        {!loading && !error && !flightData && (
          <div className={styles.emptyResultsContainer}>
            Searching for flights from {origin} to {destination} on {flightDate}...
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
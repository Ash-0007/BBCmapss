import React, { useState, useEffect } from 'react';
import { 
    fetchHapagShipRoutesGraph, 
    fetchIntermediateShipRoutes, 
    storeSeaRoutesGraph, 
    storeIntermediateRoutes,
    transformIntermediateAirRoutesToGraph,
    buildMultimodalGraph,
    dataStore 
} from '../../services/api';
import styles from '../../assets/MapComponent.module.scss';

const ShipRoutesDisplay = ({ startSeaport, endSeaport, dateRange }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [apiErrors, setApiErrors] = useState([]);
    const [showMultimodal, setShowMultimodal] = useState(false);
    const [shipRoutes, setShipRoutes] = useState([]);
    const [intermediateRoutes, setIntermediateRoutes] = useState(null);
    const [enhancedGraph, setEnhancedGraph] = useState(null);
    const [processedPorts, setProcessedPorts] = useState(new Set()); // Track processed ports to avoid duplicates
    const [showDebugInfo, setShowDebugInfo] = useState(false);
    const [showDebugDetails, setShowDebugDetails] = useState(false);
    
    // Watch for changes to the enhanced graph and automatically store it
    useEffect(() => {
        if (enhancedGraph && Object.keys(enhancedGraph).length > 0) {
            console.log("Enhanced graph is ready, storing it...");
            storeSeaRoutesGraph(enhancedGraph)
                .then(() => {
                    console.log("Enhanced graph stored successfully in memory");
                    // Store it in window for global access if needed
                    window.seaRoutesGraph = enhancedGraph;
                    console.log("Enhanced graph also available at window.seaRoutesGraph");
                })
                .catch(err => console.error("Error storing enhanced graph:", err));
        }
    }, [enhancedGraph]);
    
    // Watch for changes to intermediate routes and automatically store them
    useEffect(() => {
        if (intermediateRoutes && Object.keys(intermediateRoutes).length > 0) {
            console.log("==== INTERMEDIATE ROUTES READY FOR PROCESSING ====");
            console.log("Keys in intermediate routes:", Object.keys(intermediateRoutes).join(', '));
            console.log("Total entries:", Object.keys(intermediateRoutes).length);
            
            // Log the current state of the air routes graph before storing
            console.log("BEFORE STORAGE - Air routes graph status:", 
                dataStore.airRoutesGraph ? 
                `Exists with ${Object.keys(dataStore.airRoutesGraph).length} airports` : 
                'Not initialized'
            );
            
            // Store intermediate routes which will also transform to air routes
            storeIntermediateRoutes(intermediateRoutes)
                .then((result) => {
                    console.log("==== STORAGE RESULT ====", result);
                    
                    // Store it in window for global access if needed
                    window.intermediateRoutes = intermediateRoutes;
                    console.log("Intermediate routes also available at window.intermediateRoutes");
                    
                    // Verify air routes graph exists after storage
                    console.log("AFTER STORAGE - Air routes graph status:", 
                        dataStore.airRoutesGraph ? 
                        `Exists with ${Object.keys(dataStore.airRoutesGraph).length} airports and ${
                            Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)
                        } routes` : 
                        'Not created'
                    );
                    
                    // Display specific information about each airport
                    if (dataStore.airRoutesGraph) {
                        Object.entries(dataStore.airRoutesGraph).forEach(([airport, routes]) => {
                            console.log(`Airport ${airport}: ${routes.length} routes`);
                        });
                    }
                })
                .catch(err => {
                    console.error("Error storing intermediate routes:", err);
                    // Try direct transformation as fallback
                    console.log("Attempting direct transformation as fallback...");
                    const airGraph = transformIntermediateAirRoutesToGraph(intermediateRoutes);
                    console.log("Fallback transformation result:", 
                        airGraph ? `Success - ${Object.keys(airGraph).length} airports` : "Failed"
                    );
                });
        }
    }, [intermediateRoutes]);
    
    // Function to get formatted date for API request
    const getFormattedDate = () => {
        const today = new Date();
        const year = today.getFullYear();
        // Add 1 to month because getMonth() returns 0-11
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Handle toggling between ship routes and multimodal graph
    const toggleMultimodal = () => {
        setShowMultimodal(prev => !prev);
    };

    // Add a function to verify the air routes graph and synchronize if needed
    const syncAirRoutesGraph = () => {
      console.log("Synchronizing air routes graph data...");
      
      // Check if we have enhancedAirGraph but empty or missing airRoutesGraph
      if (
        dataStore.enhancedAirGraph && 
        dataStore.enhancedAirGraph.nodes && 
        dataStore.enhancedAirGraph.edges && 
        (!dataStore.airRoutesGraph || Object.keys(dataStore.airRoutesGraph).length === 0)
      ) {
        console.log("Found enhancedAirGraph but airRoutesGraph is empty or missing - synchronizing data");
        
        try {
          // Use the transformation function to convert enhancedAirGraph to airRoutesGraph format
          transformIntermediateAirRoutesToGraph(dataStore.enhancedAirGraph);
          console.log("Synchronized enhancedAirGraph to airRoutesGraph format");
          
          // Report on the synchronized data
          const airportCount = Object.keys(dataStore.airRoutesGraph).length;
          const routeCount = Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0);
          console.log(`Synchronized airRoutesGraph now has ${airportCount} airports and ${routeCount} routes`);
          
          return true;
        } catch (error) {
          console.error("Error synchronizing enhancedAirGraph to airRoutesGraph:", error);
          return false;
        }
      } else if (dataStore.airRoutesGraph && Object.keys(dataStore.airRoutesGraph).length > 0) {
        const airportCount = Object.keys(dataStore.airRoutesGraph).length;
        const routeCount = Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0);
        console.log(`airRoutesGraph already exists with ${airportCount} airports and ${routeCount} routes`);
        return true;
      }
      
      console.log("No air routes data available to synchronize");
      return false;
    };

    // Add useEffect hook for data loading
    useEffect(() => {
      // Immediately verify and synchronize air routes graph data
      syncAirRoutesGraph();
      
      // Fetch ship routes data
      fetchShipRoutesData();
    }, [startSeaport, endSeaport, dateRange]);

    // Function to fetch ship routes data
    const fetchShipRoutesData = async () => {
        if (!startSeaport || !endSeaport) {
            setError("Please select both start and end ports");
            setIsLoading(false);
            return;
        }

        const startPortCode = startSeaport.code;
        const endPortCode = endSeaport.code;
        
        if (!startPortCode || !endPortCode) {
            setError("Invalid port codes detected");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        
        try {
            // Format the date properly - extract only YYYY-MM-DD part
            let formattedDate = getFormattedDate();
            
            // If dateRange is provided, use it instead
            if (dateRange && dateRange.startDate) {
                // Extract only the YYYY-MM-DD part from the date string
                const dateStr = dateRange.startDate;
                if (dateStr.includes('T')) {
                    // If it has a timestamp, extract just the date part
                    formattedDate = dateStr.split('T')[0];
                } else if (dateStr.includes('+')) {
                    // If it has timezone, extract just the date part
                    formattedDate = dateStr.split('+')[0];
                } else {
                    // Otherwise use as is
                    formattedDate = dateStr;
                }
            }
            
            console.log("Using formatted date for API call:", formattedDate);
            
            const routesData = await fetchHapagShipRoutesGraph(startPortCode, endPortCode, formattedDate);
            console.log("Routes data received:", routesData);
            
            if (!routesData) {
                setError("No response received from shipping routes API");
                setShipRoutes([]);
                return;
            }
            
            if (routesData.error) {
                setError(`API Error: ${routesData.error}`);
                setShipRoutes([]);
                return;
            }
            
            // Check if we have complete routes
            if (routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                setShipRoutes(routesData.completeRoutes);
                
                // Store the initial graph
                setEnhancedGraph(routesData.graph);
                
                // Add start port to processed ports
                setProcessedPorts(prev => new Set([...prev, startPortCode]));
                
                // First, check if we can fetch direct air routes between these locations
                // This ensures we have the primary air route calculated before intermediates
                fetchDirectAirRoutes(startPortCode, endPortCode, formattedDate);
                
                // After getting the initial routes, fetch intermediate routes in batches
                fetchIntermediateRoutesData(routesData.completeRoutes, formattedDate);
                
                // Use optimized graph enhancement with batching and caching
                enhanceGraphWithIntermediateRoutes(routesData.graph, endPortCode);
                
                // Calculate all routes from starting port to intermediate ports
                if (routesData.graph) {
                    calculateRoutesToIntermediatePorts(routesData.graph, startPortCode, endPortCode, formattedDate);
                }
            } else if (routesData.routes && routesData.routes.length > 0) {
                // Fallback to simple routes if available
                setShipRoutes(routesData.routes);
            } else {
                setShipRoutes([]);
                setError("No ship routes found between these ports for the selected date");
            }
        } catch (error) {
            console.error("Error fetching ship routes:", error);
            
            let errorMessage = "Failed to fetch shipping routes";
            if (error.response) {
                // Server responded with a non-2xx status
                errorMessage = `Server error (${error.response.status}): ${error.response.data?.message || 'Unknown error'}`;
            } else if (error.request) {
                // Request was made but no response received
                errorMessage = "No response received from server. Please check your network connection.";
            } else if (error.message) {
                // Something else went wrong
                errorMessage = `Error: ${error.message}`;
            }
            
            setError(errorMessage);
            setShipRoutes([]);
        } finally {
            setIsLoading(false);
        }
    };
    
    // Function to enhance the graph with intermediate routes, optimized with batching
    const enhanceGraphWithIntermediateRoutes = async (graph, endPortCode) => {
        if (!graph) return;
        
        console.log("Enhancing graph with intermediate routes");
        
        try {
            // Create a copy of the graph to avoid modifying the original
            const enhancedGraphCopy = { ...graph };
            
            // Get all port codes from the graph excluding the end port
            const portCodes = Object.keys(graph).filter(code => code !== endPortCode);
            console.log(`Found ${portCodes.length} ports to process for intermediate routes`);
            
            // Skip already processed ports
            const portsToProcess = portCodes.filter(code => !processedPorts.has(code));
            console.log(`Processing ${portsToProcess.length} ports (${portCodes.length - portsToProcess.length} already processed)`);
            
            // If no ports to process, we're done
            if (portsToProcess.length === 0) {
                console.log("No new ports to process, using existing enhanced graph");
                dataStore.seaRoutesGraph = enhancedGraphCopy;
                setEnhancedGraph(enhancedGraphCopy);
                return;
            }
            
            // Process ports in smaller batches to avoid too many parallel requests
            const batchSize = 2; // Process 2 ports at a time
            
            for (let i = 0; i < portsToProcess.length; i += batchSize) {
                const batch = portsToProcess.slice(i, i + batchSize);
                console.log(`Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.join(', ')}`);
                
                // Keep track of processing errors
                const batchErrors = [];
                
                // Process each port in this batch in parallel
                const batchResults = await Promise.allSettled(batch.map(async (portCode) => {
                    try {
                        // Mark this port as processed
                        setProcessedPorts(prev => new Set([...prev, portCode]));
                        
                        // Get the first route for this port (to avoid redundant API calls)
                        const routes = graph[portCode] || [];
                        if (routes.length === 0) return null;
                        
                        // Process multiple routes for this port to find more connections
                        // but limit to 2 routes to avoid excessive API calls
                        const routesToProcess = routes.slice(0, 2);
                        
                        // Results for this port
                        const portResults = [];
                        
                        // Process each route to find connections
                        for (const route of routesToProcess) {
                            // Extract the arrival date from this route
                            const arrivalDate = route.arrivalTime;
                            
                            if (!arrivalDate) {
                                console.log(`No arrival date found for route from ${portCode}`);
                                continue;
                            }
                            
                            // Format the arrival date to YYYY-MM-DD
                            const formattedArrivalDate = arrivalDate.split('T')[0];
                            console.log(`Using formatted arrival date ${formattedArrivalDate} for route from ${portCode} to ${endPortCode}`);
                            
                            try {
                                // Fetch routes from this port to the end port using the formatted arrival date
                                const intermediateRoutes = await fetchHapagShipRoutesGraph(portCode, endPortCode, formattedArrivalDate);
                                
                                if (intermediateRoutes && !intermediateRoutes.error) {
                                    console.log(`Found ${intermediateRoutes.completeRoutes?.length || 0} routes from ${portCode} to ${endPortCode}`);
                                    
                                    portResults.push({
                                        portCode,
                                        intermediateRoutes,
                                        arrivalDate: formattedArrivalDate
                                    });
                                }
                            } catch (error) {
                                console.error(`Error fetching intermediate routes from ${portCode} to ${endPortCode}:`, error);
                                batchErrors.push({
                                    portCode,
                                    error: error.message || "Unknown error",
                                    arrival: formattedArrivalDate
                                });
                            }
                        }
                        
                        return portResults;
                    } catch (error) {
                        console.error(`Error processing port ${portCode}:`, error);
                        batchErrors.push({
                            portCode,
                            error: error.message || "Unknown error"
                        });
                        return null;
                    }
                }));
                
                // Process successful results to update the enhanced graph
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        result.value.forEach(portResult => {
                            if (!portResult) return;
                            
                            const { portCode, intermediateRoutes } = portResult;
                            
                            // Add the new routes to the enhanced graph
                            if (!enhancedGraphCopy[portCode]) {
                                enhancedGraphCopy[portCode] = [];
                            }
                            
                            // Add each new route to the graph
                            if (intermediateRoutes.completeRoutes) {
                                for (const newRoute of intermediateRoutes.completeRoutes) {
                                    // Check if this route already exists in the graph
                                    const routeExists = enhancedGraphCopy[portCode].some(
                                        existingRoute => 
                                            existingRoute.shipId === newRoute.voyages[0].shipId && 
                                            existingRoute.voyage === newRoute.voyages[0].voyage
                                    );
                                    
                                    if (!routeExists) {
                                        // Add the new route to the graph
                                        enhancedGraphCopy[portCode].push(newRoute.voyages[0]);
                                    }
                                }
                            }
                        });
                    }
                });
                
                // Log any errors that occurred during this batch
                if (batchErrors.length > 0) {
                    console.warn(`Completed batch with ${batchErrors.length} errors:`, batchErrors);
                }
                
                // Update the enhanced graph after each batch
                dataStore.seaRoutesGraph = enhancedGraphCopy;
                setEnhancedGraph(enhancedGraphCopy);
            }
            
            // Final update after all batches are processed
            dataStore.seaRoutesGraph = enhancedGraphCopy;
            setEnhancedGraph(enhancedGraphCopy);
            console.log("Enhanced graph:", enhancedGraphCopy);
        } catch (error) {
            console.error("Error in enhanceGraphWithIntermediateRoutes:", error);
            
            // Make sure we still update the graph with what we have
            if (enhancedGraphCopy && Object.keys(enhancedGraphCopy).length > 0) {
                dataStore.seaRoutesGraph = enhancedGraphCopy;
                setEnhancedGraph(enhancedGraphCopy);
                console.log("Enhanced graph updated despite errors");
            }
        }
    };
    
    // Function to fetch intermediate routes data
    const fetchIntermediateRoutesData = async (routes, formattedDate) => {
        try {
            console.log("Fetching intermediate routes for the found routes");
            
            // Clear previous API errors
            setApiErrors([]);
            
            // Extract paths from the routes
            const paths = routes.map(route => route.path);
            console.log("Paths to process:", paths);
            
            // Get unique paths to avoid duplicate API calls
            const uniquePaths = [...new Set(paths.map(path => path.join('->')))]
                .map(pathStr => pathStr.split('->'));
            console.log(`Processing ${uniquePaths.length} unique paths out of ${paths.length} total paths`);
            
            // Process each path to find intermediate routes
            const newIntermediateRoutes = {};
            
            // Keep track of processed queries to avoid duplicates
            const processedQueries = new Set();
            
            // Keep track of failed paths to report later
            const failedPaths = [];
            
            // Prepare all requests to be run in parallel
            const fetchPromises = [];
            
            // Generate all fetch promises upfront
            uniquePaths.forEach(path => {
                if (path.length < 3) return; // Skip paths that are too short for intermediate routes
                
                const pathKey = path.join('->');
                
                // Create a unique query ID to avoid duplicates
                const queryId = `path-${pathKey}-${formattedDate}`;
                
                // Skip if we've already processed this exact query
                if (processedQueries.has(queryId)) {
                    console.log(`Skipping duplicate path query: ${queryId}`);
                    return;
                }
                
                // Mark this query as processed
                processedQueries.add(queryId);
                
                        console.log(`Processing path: ${path.join(' -> ')}`);
                        
                // Create a promise for this fetch operation
                const fetchPromise = Promise.resolve().then(async () => {
                        try {
                            // Fetch intermediate routes for this path
                            const intermediateData = await fetchIntermediateShipRoutes(path, formattedDate);
                            
                            // Check if we got valid data or fallback data
                            if (intermediateData.isGeneratedFallback) {
                            console.warn(`Using fallback data for path ${pathKey}`);
                            failedPaths.push(pathKey);
                                
                                // Add to API errors list to display to user
                                setApiErrors(prev => [...prev, {
                                    type: 'intermediate-routes',
                                path: pathKey,
                                message: `Could not fetch intermediate routes for path ${pathKey}`,
                                    time: new Date().toISOString()
                                }]);
                            } else {
                            console.log("Intermediate routes data received for path", pathKey);
                            }
                            
                            return { 
                            key: pathKey,
                                data: intermediateData,
                                status: intermediateData.isGeneratedFallback ? 'fallback' : 'success'
                            };
                        } catch (error) {
                        console.error(`Error fetching intermediate routes for path ${pathKey}:`, error);
                        failedPaths.push(pathKey);
                            
                            // Add to API errors list to display to user
                            setApiErrors(prev => [...prev, {
                                type: 'intermediate-routes',
                            path: pathKey,
                                message: `Error: ${error.message || "Unknown error"}`,
                                time: new Date().toISOString()
                            }]);
                            
                            // Return a minimal fallback structure for this path
                            return { 
                            key: pathKey, 
                                data: {
                                    path: path,
                                    isGeneratedFallback: true,
                                    error: error.message || "Unknown error"
                                },
                                status: 'error'
                            };
                        }
                });
                
                fetchPromises.push(fetchPromise);
            });
            
            try {
                // Execute all fetch operations in parallel
                console.log(`Executing ${fetchPromises.length} parallel path requests...`);
                const startTime = performance.now();
                
                const results = await Promise.all(fetchPromises);
                
                const endTime = performance.now();
                console.log(`All parallel requests completed in ${(endTime - startTime).toFixed(2)}ms`);
                
                // Process the results
                results.forEach(result => {
                    if (!result) return;
                    
                    const { key, data, status } = result;
                    if (status !== 'error') {
                        newIntermediateRoutes[key] = data;
                    }
                });
                
                // First create the updated object with new routes
                const rawUpdated = {
                    ...intermediateRoutes || {},
                        ...newIntermediateRoutes
                    };
                
                // Now deduplicate and limit the routes before storing
                console.log("Deduplicating and limiting intermediate routes...");
                const updated = deduplicateAndLimitIntermediateRoutes(rawUpdated);
                    
                    // Add metadata about the import process
                    updated._metadata = {
                        lastUpdated: new Date().toISOString(),
                        processedPaths: Object.keys(newIntermediateRoutes).length,
                        failedPaths: failedPaths,
                    hadErrors: failedPaths.length > 0,
                    deduplicationApplied: true
                    };
                    
                    // Make the data instantly available in the dataStore
                    dataStore.intermediateRoutes = updated;
                    console.log("Intermediate routes updated in dataStore", {
                        totalPaths: Object.keys(updated).length - 1, // Subtract 1 for _metadata
                        failedPaths: failedPaths.length
                    });
                    
                // After updating intermediate routes, transform them to air routes graph
                try {
                    console.log("Transforming updated intermediate routes to air routes graph");
                    // First deduplicate the routes before transformation
                    const deduplicatedRoutes = deduplicateAndLimitIntermediateRoutes(updated);
                    const airRoutesGraph = transformIntermediateAirRoutesToGraph(deduplicatedRoutes);
                    
                    // Now incorporate the air routes into the enhanced graph
                    if (airRoutesGraph && Object.keys(airRoutesGraph).length > 0) {
                        // Update the enhanced graph with air routes
                        setEnhancedGraph(prevGraph => {
                            const combinedGraph = { ...prevGraph };
                            
                            // Add airports as nodes in the enhanced graph
                            Object.entries(airRoutesGraph).forEach(([airportCode, routes]) => {
                                if (!combinedGraph[airportCode]) {
                                    combinedGraph[airportCode] = [];
                                }
                                
                                // Add air routes that don't already exist
                                routes.forEach(route => {
                                    const routeExists = combinedGraph[airportCode].some(
                                        existingRoute => 
                                            existingRoute.type === 'air' && 
                                            existingRoute.shipId === route.shipId
                                    );
                                    
                                    if (!routeExists) {
                                        combinedGraph[airportCode].push(route);
                                    }
                                });
                            });
                            
                            console.log(`Enhanced graph updated with air routes: ${
                                Object.keys(combinedGraph).length
                            } total nodes (seaports and airports combined)`);
                            
                            return combinedGraph;
                        });
                    }
                } catch (error) {
                    console.error("Error incorporating air routes into enhanced graph:", error);
                }
                
                // Update the state with all the processed intermediate routes
                setIntermediateRoutes(updated);
            
            // Log a summary of the processing
            if (failedPaths.length > 0) {
                console.warn(`Completed intermediate routes processing with ${failedPaths.length} failed paths:`, failedPaths);
            } else {
                console.log("Successfully processed all intermediate routes without errors");
            }
        } catch (error) {
                console.error("Error processing parallel requests:", error);
            
            // Add to API errors list to display to user
            setApiErrors(prev => [...prev, {
                    type: 'intermediate-routes-parallel',
                    message: `Error in parallel processing: ${error.message || "Unknown error"}`,
                time: new Date().toISOString()
            }]);
            
                // Even if we have an error in parallel processing, still update with what we have
            if (Object.keys(newIntermediateRoutes).length > 0) {
                    const updated = {
                        ...intermediateRoutes || {},
                        ...newIntermediateRoutes,
                        _metadata: {
                            lastUpdated: new Date().toISOString(),
                            processedPaths: Object.keys(newIntermediateRoutes).length,
                            hadErrors: true,
                            parallelError: error.message
                        }
                    };
                    
                    // Make the data instantly available in the dataStore
                    dataStore.intermediateRoutes = updated;
                    setIntermediateRoutes(updated);
                    console.log("Intermediate routes updated in dataStore despite parallel processing error");
                }
            }
        } catch (error) {
            console.error("Error in fetchIntermediateRoutesData:", error);
            
            // Add to API errors list to display to user
            setApiErrors(prev => [...prev, {
                type: 'intermediate-routes-general',
                message: `General error: ${error.message || "Unknown error"}`,
                time: new Date().toISOString()
            }]);
        }
    };
    
    // Function to calculate routes from starting port to all intermediate ports
    // and from all intermediate ports to the destination port
    const calculateRoutesToIntermediatePorts = async (graph, startPortCode, endPortCode, formattedDate) => {
        console.log("Calculating routes between all ports in the graph...");
        
        try {
            // Get all port codes from the graph except the starting port and end port
            const intermediatePorts = Object.keys(graph).filter(portCode => 
                portCode !== startPortCode && portCode !== endPortCode
            );
            
            console.log(`Found ${intermediatePorts.length} intermediate ports: ${intermediatePorts.join(", ")}`);
            
            // Create a container for all the routes
            const allRoutes = {};
            
            // Create a copy of the enhanced graph to update
            const enhancedGraphCopy = { ...enhancedGraph || graph };
            
            // Track processing errors
            const processingErrors = [];
            
            // Track processed route-date pairs to avoid duplicate API calls
            const processedRouteDatePairs = new Set();
            
            // Initialize sea-air and air-sea graphs in the dataStore
            if (!dataStore.seaAirGraph) {
                dataStore.seaAirGraph = {};
            }
            if (!dataStore.airSeaGraph) {
                dataStore.airSeaGraph = {};
            }
            
            // 1. FIRST: Calculate routes from starting port to all intermediate ports
            console.log(`Calculating routes from starting port ${startPortCode} to all intermediate ports`);
            
            // Check if we have the seaRoutesGraph available
            if (dataStore.seaRoutesGraph && Object.keys(dataStore.seaRoutesGraph).length > 0) {
                console.log("Using existing seaRoutesGraph for route calculations");
                
                // Get routes from start port to intermediate ports
                for (const portCode of intermediatePorts) {
                    // Create a unique key for this route
                    const routeKey = `${startPortCode}-${portCode}`;
                    
                    // Check if we have routes in the seaRoutesGraph
                    if (dataStore.seaRoutesGraph[startPortCode]) {
                        // Filter routes that go to this intermediate port
                        const routesToPort = dataStore.seaRoutesGraph[startPortCode].filter(route => 
                            route.toPort === portCode
                        );
                        
                        if (routesToPort.length > 0) {
                            console.log(`Found ${routesToPort.length} routes from ${startPortCode} to ${portCode} in seaRoutesGraph`);
                            allRoutes[routeKey] = routesToPort;
                            
                            // Add these routes to the enhanced graph
                            if (!enhancedGraphCopy[startPortCode]) {
                                enhancedGraphCopy[startPortCode] = [];
                            }
                            
                            // Add each route to the graph
                            routesToPort.forEach(route => {
                                // Check if this route already exists in the graph
                                const routeExists = enhancedGraphCopy[startPortCode].some(
                                    existingRoute => 
                                        existingRoute.shipId === route.shipId && 
                                        existingRoute.voyage === route.voyage
                                );
                                
                                if (!routeExists) {
                                    enhancedGraphCopy[startPortCode].push(route);
                                }
                            });
                        } else {
                            console.log(`No routes found from ${startPortCode} to ${portCode} in seaRoutesGraph`);
                            allRoutes[routeKey] = [];
                        }
                    } else {
                        console.log(`No routes found from ${startPortCode} to ${portCode} in seaRoutesGraph`);
                        allRoutes[routeKey] = [];
                    }
                }
            } else {
                console.log("seaRoutesGraph not available, falling back to API calls");
                
                // Prepare all fetch promises for routes from start to intermediate ports
                const startToIntermediatePromises = intermediatePorts.map(portCode => {
                    // Create a unique key for this route-date pair
                    const routeDateKey = `${startPortCode}-${portCode}-${formattedDate}`;
                    
                    // Check if we've already processed this route-date pair
                    if (processedRouteDatePairs.has(routeDateKey)) {
                        console.log(`Already processed route from ${startPortCode} to ${portCode} for date ${formattedDate}, skipping`);
                        return {
                            from: startPortCode,
                            to: portCode,
                            promise: Promise.resolve({
                                portCode,
                                routesData: null,
                                routeType: 'start-to-intermediate',
                                alreadyProcessed: true
                            })
                        };
                    }
                    
                    // Mark this route-date pair as processed before the API call
                    processedRouteDatePairs.add(routeDateKey);
                    
                    return {
                        from: startPortCode,
                        to: portCode,
                        promise: fetchHapagShipRoutesGraph(startPortCode, portCode, formattedDate)
                            .then(routesData => {
                        if (routesData && !routesData.error && routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                            console.log(`Found ${routesData.completeRoutes.length} routes from ${startPortCode} to ${portCode}`);
                            return {
                                portCode,
                                routesData,
                                routeType: 'start-to-intermediate'
                            };
                        } else {
                            console.log(`No routes found from ${startPortCode} to ${portCode}`);
                            return {
                                portCode,
                                routesData: null,
                                routeType: 'start-to-intermediate',
                                noRoutesFound: true
                            };
                        }
                            })
                            .catch(error => {
                        console.error(`Error fetching routes from ${startPortCode} to ${portCode}:`, error);
                                processingErrors.push({
                            from: startPortCode,
                            to: portCode,
                            error: error.message || "Unknown error"
                        });
                        return null;
                            })
                    };
                });
                
                // Execute all start to intermediate promises in parallel
                const startToIntermediateResults = await Promise.all(
                    startToIntermediatePromises.map(item => item.promise)
                );
                
                // Process start to intermediate results
                startToIntermediateResults.forEach(result => {
                    if (result) {
                        const { portCode, routesData, noRoutesFound } = result;
                        
                        if (noRoutesFound) {
                            allRoutes[`${startPortCode}-${portCode}`] = [];
                            return;
                        }
                        
                        if (routesData && routesData.completeRoutes) {
                            allRoutes[`${startPortCode}-${portCode}`] = routesData.completeRoutes;
                            
                            // Add these routes to the enhanced graph
                            if (!enhancedGraphCopy[startPortCode]) {
                                enhancedGraphCopy[startPortCode] = [];
                            }
                            
                            // Add each voyage to the graph
                            routesData.completeRoutes.forEach(route => {
                                if (route.voyages && route.voyages.length > 0) {
                                    const voyage = route.voyages[0];
                                    
                                    // Check if this voyage already exists in the graph
                                    const voyageExists = enhancedGraphCopy[startPortCode].some(
                                        existingVoyage => 
                                            existingVoyage.shipId === voyage.shipId && 
                                            existingVoyage.voyage === voyage.voyage
                                    );
                                    
                                    if (!voyageExists) {
                                        enhancedGraphCopy[startPortCode].push(voyage);
                                    }
                                }
                            });
                        }
                    }
                });
            }
            
            // 2. SECOND: Calculate routes from all intermediate ports to the destination port
            console.log(`Calculating routes from all intermediate ports to destination port ${endPortCode}`);
            
            // Check if we have the seaRoutesGraph available
            if (dataStore.seaRoutesGraph && Object.keys(dataStore.seaRoutesGraph).length > 0) {
                console.log("Using existing seaRoutesGraph for route calculations");
                
                // Get routes from intermediate ports to end port
                for (const portCode of intermediatePorts) {
                    // Create a unique key for this route
                    const routeKey = `${portCode}-${endPortCode}`;
                    
                    // Check if we have routes in the seaRoutesGraph
                    if (dataStore.seaRoutesGraph[portCode]) {
                        // Filter routes that go to the end port
                        const routesToEnd = dataStore.seaRoutesGraph[portCode].filter(route => 
                            route.toPort === endPortCode
                        );
                        
                        if (routesToEnd.length > 0) {
                            console.log(`Found ${routesToEnd.length} routes from ${portCode} to ${endPortCode} in seaRoutesGraph`);
                            allRoutes[routeKey] = routesToEnd;
                            
                            // Add these routes to the enhanced graph
                            if (!enhancedGraphCopy[portCode]) {
                                enhancedGraphCopy[portCode] = [];
                            }
                            
                            // Add each route to the graph
                            routesToEnd.forEach(route => {
                                // Check if this route already exists in the graph
                                const routeExists = enhancedGraphCopy[portCode].some(
                                    existingRoute => 
                                        existingRoute.shipId === route.shipId && 
                                        existingRoute.voyage === route.voyage
                                );
                                
                                if (!routeExists) {
                                    enhancedGraphCopy[portCode].push(route);
                                }
                            });
                        } else {
                            console.log(`No routes found from ${portCode} to ${endPortCode} in seaRoutesGraph`);
                            allRoutes[routeKey] = [];
                        }
                    } else {
                        console.log(`No routes found from ${portCode} to ${endPortCode} in seaRoutesGraph`);
                        allRoutes[routeKey] = [];
                    }
                }
            } else {
                console.log("seaRoutesGraph not available, falling back to API calls");
                
                // Prepare all fetch promises for routes from intermediate ports to end
                const intermediateToEndPromises = intermediatePorts.map(portCode => {
                    // Create a unique key for this route-date pair
                    const routeDateKey = `${portCode}-${endPortCode}-${formattedDate}`;
                    
                    // Check if we've already processed this route-date pair
                    if (processedRouteDatePairs.has(routeDateKey)) {
                        console.log(`Already processed route from ${portCode} to ${endPortCode} for date ${formattedDate}, skipping`);
                        return {
                            from: portCode,
                            to: endPortCode,
                            promise: Promise.resolve({
                                portCode,
                                routesData: null,
                                routeType: 'intermediate-to-end',
                                alreadyProcessed: true
                            })
                        };
                    }
                    
                    // Mark this route-date pair as processed before the API call
                    processedRouteDatePairs.add(routeDateKey);
                    
                    return {
                        from: portCode,
                        to: endPortCode,
                        promise: fetchHapagShipRoutesGraph(portCode, endPortCode, formattedDate)
                            .then(routesData => {
                        if (routesData && !routesData.error && routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                            console.log(`Found ${routesData.completeRoutes.length} routes from ${portCode} to ${endPortCode}`);
                            return {
                                portCode,
                                routesData,
                                routeType: 'intermediate-to-end'
                            };
                        } else {
                            console.log(`No routes found from ${portCode} to ${endPortCode}`);
                            return {
                                portCode,
                                routesData: null,
                                routeType: 'intermediate-to-end',
                                noRoutesFound: true
                            };
                        }
                            })
                            .catch(error => {
                        console.error(`Error fetching routes from ${portCode} to ${endPortCode}:`, error);
                                processingErrors.push({
                            from: portCode,
                            to: endPortCode,
                            error: error.message || "Unknown error"
                        });
                        return null;
                            })
                    };
                });
                
                // Execute all intermediate to end promises in parallel
                const intermediateToEndResults = await Promise.all(
                    intermediateToEndPromises.map(item => item.promise)
                );
                
                // Process intermediate to end results
                intermediateToEndResults.forEach(result => {
                    if (result) {
                        const { portCode, routesData, noRoutesFound } = result;
                        
                        if (noRoutesFound) {
                            allRoutes[`${portCode}-${endPortCode}`] = [];
                            return;
                        }
                        
                        if (routesData && routesData.completeRoutes) {
                            allRoutes[`${portCode}-${endPortCode}`] = routesData.completeRoutes;
                            
                            // Add these routes to the enhanced graph
                            if (!enhancedGraphCopy[portCode]) {
                                enhancedGraphCopy[portCode] = [];
                            }
                            
                            // Add each voyage to the graph
                            routesData.completeRoutes.forEach(route => {
                                if (route.voyages && route.voyages.length > 0) {
                                    const voyage = route.voyages[0];
                                    
                                    // Check if this voyage already exists in the graph
                                    const voyageExists = enhancedGraphCopy[portCode].some(
                                        existingVoyage => 
                                            existingVoyage.shipId === voyage.shipId && 
                                            existingVoyage.voyage === voyage.voyage
                                    );
                                    
                                    if (!voyageExists) {
                                        enhancedGraphCopy[portCode].push(voyage);
                                    }
                                }
                            });
                        }
                    }
                });
            }
            
            // 3. THIRD: Build the sea-air graph using the enhancedAirGraph
            console.log("Building sea-air graph using enhancedAirGraph...");
            
            // Check if we have the enhancedAirGraph available
            if (dataStore.enhancedAirGraph && dataStore.enhancedAirGraph.nodes && dataStore.enhancedAirGraph.edges) {
                console.log("Using existing enhancedAirGraph for sea-air connections");
                
                // Get all seaports from the enhanced graph
                const allSeaports = Object.keys(enhancedGraphCopy);
                console.log(`Found ${allSeaports.length} seaports to process for sea-air connections`);
                
                // Get all airports from the enhancedAirGraph
                const allAirports = Object.keys(dataStore.enhancedAirGraph.nodes).filter(
                    nodeId => dataStore.enhancedAirGraph.nodes[nodeId].type === 'airport'
                );
                console.log(`Found ${allAirports.length} airports in enhancedAirGraph`);
                
                // Process seaports in batches to avoid overloading
                const batchSize = 5;
                for (let i = 0; i < allSeaports.length; i += batchSize) {
                    const batch = allSeaports.slice(i, i + batchSize);
                    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of seaports: ${batch.join(', ')}`);
                    
                    // Process each seaport in this batch
                    for (const seaport of batch) {
                        try {
                            // Get the seaport location
                            const seaportLocations = await fetchPortLocationsByCode([seaport]);
                            const seaportLocation = seaportLocations[0];
                            
                            if (!seaportLocation || !seaportLocation.latitude_dd || !seaportLocation.longitude_dd) {
                                console.log(`Could not find location data for seaport ${seaport}`);
                                continue;
                            }
                            
                            const seaportLat = parseFloat(seaportLocation.latitude_dd);
                            const seaportLng = parseFloat(seaportLocation.longitude_dd);
                            
                            // Find the nearest airports to this seaport
                            const nearestAirports = await getNearestAirports(seaportLat, seaportLng, 3);
                            
                            if (!nearestAirports || nearestAirports.length === 0) {
                                console.log(`No nearby airports found for seaport ${seaport}`);
                                continue;
                            }
                            
                            console.log(`Found ${nearestAirports.length} airports near ${seaport}: ${nearestAirports.map(a => a.code).join(', ')}`);
                            
                            // Initialize sea-air connections for this seaport
                            dataStore.seaAirGraph[seaport] = [];
                            
                            // Process each nearby airport
                            for (const nearbyAirport of nearestAirports) {
                                const airportCode = nearbyAirport.code;
                                
                                if (!airportCode) {
                                    console.log('Invalid airport data, missing code');
                                    continue;
                                }
                                
                                // Calculate distance between seaport and airport
                                const distance = calculateDistance(
                                    seaportLat, 
                                    seaportLng, 
                                    nearbyAirport.latitude_dd, 
                                    nearbyAirport.longitude_dd
                                );
                                
                                // Add a connection from seaport to airport
                                const seaToAirConnection = {
                                    from: seaport,
                                    to: airportCode,
                                    type: 'sea_to_air',
                                    distance: distance,
                                    travelTime: distance / 60, // Approximate travel time at 60 km/h
                                    mode: 'truck'  // Assuming truck transport between seaport and airport
                                };
                                
                                dataStore.seaAirGraph[seaport].push(seaToAirConnection);
                                
                                // Now find air routes from this airport to the destination airport
                                // First, find the destination airport (nearest to the end port)
                                const endPortLocations = await fetchPortLocationsByCode([endPortCode]);
                                const endPortLocation = endPortLocations[0];
                                
                                if (!endPortLocation || !endPortLocation.latitude_dd || !endPortLocation.longitude_dd) {
                                    console.log(`Could not find location data for end port ${endPortCode}`);
                                    continue;
                                }
                                
                                const endPortLat = parseFloat(endPortLocation.latitude_dd);
                                const endPortLng = parseFloat(endPortLocation.longitude_dd);
                                
                                // Find the nearest airports to the end port
                                const endAirports = await getNearestAirports(endPortLat, endPortLng, 3);
                                
                                if (!endAirports || endAirports.length === 0) {
                                    console.log(`No nearby airports found for end port ${endPortCode}`);
                                    continue;
                                }
                                
                                // For each destination airport, find air routes in the enhancedAirGraph
                                for (const destAirport of endAirports) {
                                    const destAirportCode = destAirport.code;
                                    
                                    if (!destAirportCode) {
                                        console.log('Invalid destination airport data, missing code');
                                        continue;
                                    }
                                    
                                    // Skip if it's the same airport
                                    if (airportCode === destAirportCode) continue;
                                    
                                    // Find air routes in the enhancedAirGraph
                                    const airRoutes = dataStore.enhancedAirGraph.edges.filter(edge => 
                                        edge.from === airportCode && edge.to === destAirportCode
                                    );
                                    
                                    if (airRoutes.length > 0) {
                                        console.log(`Found ${airRoutes.length} air routes from ${airportCode} to ${destAirportCode} in enhancedAirGraph`);
                                        
                                        // Create a multimodal connection record
                                        const multimodalConnection = {
                                            from: seaport,
                                            via: {
                                                seaport: seaport,
                                                connectingAirport: airportCode,
                                                destinationAirport: destAirportCode,
                                                seaToAirDistance: distance,
                                                seaToAirTime: distance / 60, // hours
                                                airRoutes: airRoutes
                                            },
                                            to: endPortCode,
                                            type: 'sea_air_connection',
                                            estimatedTotalDistance: distance + (airRoutes[0]?.distance || 1000), // estimate
                                            estimatedTotalTime: (distance / 60) + (airRoutes[0]?.duration || 2.5) // hours
                                        };
                                        
                                        // Add this multimodal connection to the graph
                                        if (!enhancedGraphCopy[seaport]) {
                                            enhancedGraphCopy[seaport] = [];
                                        }
                                        
                                        // Add the multimodal connection to the enhanced graph
                                        enhancedGraphCopy[seaport].push({
                                            shipId: `AIR-${airportCode}-${destAirportCode}`,
                                            shipName: `Air Route ${airportCode}-${destAirportCode}`,
                                            voyage: `AIR-${airportCode}-${destAirportCode}`,
                                            fromPort: seaport,
                                            fromPortName: seaport,
                                            toPort: endPortCode,
                                            toPortName: endPortCode,
                                            departureTime: null, // Would be calculated based on sea arrival
                                            arrivalTime: null, // Would be calculated based on air arrival
                                            schedule: [],
                                            type: 'multimodal',
                                            multimodalConnection: multimodalConnection
                                        });
                                    } else {
                                        console.log(`No air routes found from ${airportCode} to ${destAirportCode} in enhancedAirGraph`);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing seaport ${seaport}:`, error);
                            processingErrors.push({
                                seaport,
                                error: error.message || "Unknown error",
                                type: 'sea-air'
                            });
                        }
                    }
                    
                    // Log progress after each batch
                    console.log(`Processed batch ${Math.floor(i/batchSize) + 1}, sea-air graph now has ${Object.keys(dataStore.seaAirGraph).length} seaports`);
                }
            } else {
                console.log("enhancedAirGraph not available, skipping sea-air connections");
            }
            
            // 4. FOURTH: Build the air-sea graph using the enhancedAirGraph
            console.log("Building air-sea graph using enhancedAirGraph...");
            
            // Check if we have the enhancedAirGraph available
            if (dataStore.enhancedAirGraph && dataStore.enhancedAirGraph.nodes && dataStore.enhancedAirGraph.edges) {
                console.log("Using existing enhancedAirGraph for air-sea connections");
                
                // Get all airports from the enhancedAirGraph
                const allAirports = Object.keys(dataStore.enhancedAirGraph.nodes).filter(
                    nodeId => dataStore.enhancedAirGraph.nodes[nodeId].type === 'airport'
                );
                console.log(`Found ${allAirports.length} airports to process for air-sea connections`);
                
                // Get all seaports from the enhanced graph
                const allSeaports = Object.keys(enhancedGraphCopy);
                
                // Process airports in batches
                for (let i = 0; i < allAirports.length; i += batchSize) {
                    const batch = allAirports.slice(i, i + batchSize);
                    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of airports: ${batch.join(', ')}`);
                    
                    // Process each airport in this batch
                    for (const airport of batch) {
                        try {
                            // Get the airport location
                            const airportDetails = await getAirportDetails(airport);
                            
                            if (!airportDetails || !airportDetails.latitude_dd || !airportDetails.longitude_dd) {
                                console.log(`Could not find location data for airport ${airport}`);
                                continue;
                            }
                            
                            const airportLat = parseFloat(airportDetails.latitude_dd);
                            const airportLng = parseFloat(airportDetails.longitude_dd);
                            
                            // Find the nearest seaports to this airport
                            // Since we don't have a direct getNearestSeaports function, we'll use the existing seaports
                            // and calculate distances manually
                            const seaportsWithDistance = allSeaports.map(seaport => {
                                // Get the seaport location from the enhanced graph
                                const seaportLocation = enhancedGraphCopy[seaport] && enhancedGraphCopy[seaport][0] ? {
                                    latitude_dd: enhancedGraphCopy[seaport][0].fromPortLat || null,
                                    longitude_dd: enhancedGraphCopy[seaport][0].fromPortLng || null
                                } : null;
                                
                                if (!seaportLocation || !seaportLocation.latitude_dd || !seaportLocation.longitude_dd) {
                                    return null;
                                }
                                
                                const distance = calculateDistance(
                                    airportLat,
                                    airportLng,
                                    seaportLocation.latitude_dd,
                                    seaportLocation.longitude_dd
                                );
                                
                                return {
                                    code: seaport,
                                    distance
                                };
                            }).filter(seaport => seaport !== null);
                            
                            // Sort by distance and get the nearest ones
                            const nearestSeaports = seaportsWithDistance
                                .sort((a, b) => a.distance - b.distance)
                                .slice(0, 3);
                            
                            if (nearestSeaports.length === 0) {
                                console.log(`No nearby seaports found for airport ${airport}`);
                                continue;
                            }
                            
                            console.log(`Found ${nearestSeaports.length} seaports near ${airport}: ${nearestSeaports.map(s => s.code).join(', ')}`);
                            
                            // Initialize air-sea connections for this airport
                            dataStore.airSeaGraph[airport] = [];
                            
                            // Process each nearby seaport
                            for (const nearbySeaport of nearestSeaports) {
                                const seaportCode = nearbySeaport.code;
                                const distance = nearbySeaport.distance;
                                
                                // Add a connection from airport to seaport
                                const airToSeaConnection = {
                                    from: airport,
                                    to: seaportCode,
                                    type: 'air_to_sea',
                                    distance: distance,
                                    travelTime: distance / 60, // Approximate travel time at 60 km/h
                                    mode: 'truck'  // Assuming truck transport between airport and seaport
                                };
                                
                                dataStore.airSeaGraph[airport].push(airToSeaConnection);
                                
                                // Now find sea routes from this seaport to the destination port
                                // Check if we have routes in the seaRoutesGraph
                                if (dataStore.seaRoutesGraph && dataStore.seaRoutesGraph[seaportCode]) {
                                    // Filter routes that go to the end port
                                    const routesToEnd = dataStore.seaRoutesGraph[seaportCode].filter(route => 
                                        route.toPort === endPortCode
                                    );
                                    
                                    if (routesToEnd.length > 0) {
                                        console.log(`Found ${routesToEnd.length} sea routes from ${seaportCode} to ${endPortCode} in seaRoutesGraph`);
                                        
                                        // Get the first route
                                        const route = routesToEnd[0];
                                        
                                        // Create a multimodal connection record
                                        const multimodalConnection = {
                                            from: airport,
                                            via: {
                                                airport: airport,
                                                connectingSeaport: seaportCode,
                                                destinationPort: endPortCode,
                                                airToSeaDistance: distance,
                                                airToSeaTime: distance / 60, // hours
                                                seaVoyage: route
                                            },
                                            to: endPortCode,
                                            type: 'air_sea_connection',
                                            estimatedTotalDistance: distance + (route.distance || 1000), // estimate
                                            estimatedTotalTime: (distance / 60) + (route.duration || 48) // hours
                                        };
                                        
                                        // Add this multimodal connection to the graph
                                        if (!enhancedGraphCopy[airport]) {
                                            enhancedGraphCopy[airport] = [];
                                        }
                                        
                                        // Add the multimodal connection to the enhanced graph
                                        enhancedGraphCopy[airport].push({
                                            shipId: `SEA-${seaportCode}-${endPortCode}`,
                                            shipName: `Sea Route ${seaportCode}-${endPortCode}`,
                                            voyage: route.voyage || `SEA-${seaportCode}-${endPortCode}`,
                                            fromPort: airport,
                                            fromPortName: airport,
                                            toPort: endPortCode,
                                            toPortName: endPortCode,
                                            departureTime: null, // Would be calculated based on air arrival
                                            arrivalTime: route.arrivalTime || null,
                                            schedule: route.schedule || [],
                                            type: 'multimodal',
                                            multimodalConnection: multimodalConnection
                                        });
                                    } else {
                                        console.log(`No sea routes found from ${seaportCode} to ${endPortCode} in seaRoutesGraph`);
                                    }
                                } else {
                                    console.log(`No sea routes found from ${seaportCode} to ${endPortCode} in seaRoutesGraph`);
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing airport ${airport}:`, error);
                            processingErrors.push({
                                airport,
                                error: error.message || "Unknown error",
                                type: 'air-sea'
                            });
                        }
                    }
                    
                    // Log progress after each batch
                    console.log(`Processed batch ${Math.floor(i/batchSize) + 1}, air-sea graph now has ${Object.keys(dataStore.airSeaGraph).length} airports`);
                }
            } else {
                console.log("enhancedAirGraph not available, skipping air-sea connections");
            }
            
            // Update the enhanced graph with all collected data
                dataStore.seaRoutesGraph = enhancedGraphCopy;
                setEnhancedGraph(enhancedGraphCopy);
            
            // 5. Update the intermediate routes with all the routes we found
            setIntermediateRoutes(prev => {
                const updated = prev || {};
                updated["allPortRoutes"] = { 
                    startPort: startPortCode,
                    endPort: endPortCode,
                    intermediateRoutes: allRoutes,
                    _metadata: {
                        lastUpdated: new Date().toISOString(),
                        totalConnections: Object.keys(allRoutes).length,
                        hadErrors: processingErrors.length > 0,
                        errors: processingErrors.length > 0 ? processingErrors : undefined
                    }
                };
                return updated;
            });
            
            console.log("All routes calculated between ports:", Object.keys(allRoutes).length);
            console.log("Sea-air graph created with:", Object.keys(dataStore.seaAirGraph).length, "seaports");
            console.log("Air-sea graph created with:", Object.keys(dataStore.airSeaGraph).length, "airports");
            
            if (processingErrors.length > 0) {
                console.warn(`Completed route calculations with ${processingErrors.length} errors`);
            } else {
                console.log("Successfully calculated all routes without errors");
            }
            
            console.log("Final enhanced graph:", enhancedGraphCopy);
            
            // Make the data instantly available in the dataStore
            dataStore.seaRoutesGraph = enhancedGraphCopy;
            
            // Add a small delay before setting the state to ensure the data is available
            setTimeout(() => {
                setEnhancedGraph(enhancedGraphCopy);
                console.log("Enhanced graph state updated");
            }, 100);
        } catch (error) {
            console.error("Error in calculateRoutesToIntermediatePorts:", error);
            
            // If we have an enhanced graph copy, still update it
            if (enhancedGraphCopy && Object.keys(enhancedGraphCopy).length > 0) {
                dataStore.seaRoutesGraph = enhancedGraphCopy;
                setEnhancedGraph(enhancedGraphCopy);
                console.log("Enhanced graph updated despite errors");
            }
        }
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            // Assuming input is in format 'YYYY-MM-DDTHH:MM:SS' or similar ISO format
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Return original if parsing fails
            
            // Format: Jun 15, 2023 14:30
            const options = { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            };
            return date.toLocaleDateString('en-US', options);
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateString; // Return original on error
        }
    };
    
    // Add a debug function to transform intermediate routes to air routes graph
    const transformAirRoutesGraph = () => {
        if (intermediateRoutes && Object.keys(intermediateRoutes).length > 0) {
            console.log("Manually transforming intermediate routes to air routes graph...");
            
            // Show a loading indicator to the user
            const startTime = performance.now();
            
            try {
                // First deduplicate and limit the intermediate routes
                console.log("Deduplicating intermediate routes before transformation...");
                const deduplicatedRoutes = deduplicateAndLimitIntermediateRoutes(intermediateRoutes);
                
                // Use the improved transformation function with deduplicated routes
                const airRoutesGraph = transformIntermediateAirRoutesToGraph(deduplicatedRoutes);
                
                const endTime = performance.now();
                const processingTime = (endTime - startTime).toFixed(2);
                
                // Display success message with timing information
                console.log(`Air routes graph transformed in ${processingTime}ms with ${Object.keys(airRoutesGraph).length} airports`);
                console.log("Air routes graph:", airRoutesGraph);
                
                // Count total routes for better debugging
                const totalRoutes = Object.values(airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0);
                
                // Now incorporate the air routes into the enhanced graph
                if (airRoutesGraph && Object.keys(airRoutesGraph).length > 0) {
                    setEnhancedGraph(prevGraph => {
                        if (!prevGraph) return airRoutesGraph; // If no existing graph, use air routes
                        
                        const combinedGraph = { ...prevGraph };
                        
                        // Add airports as nodes in the enhanced graph
                        Object.entries(airRoutesGraph).forEach(([airportCode, routes]) => {
                            if (!combinedGraph[airportCode]) {
                                combinedGraph[airportCode] = [];
                            }
                            
                            // Add air routes that don't already exist
                            routes.forEach(route => {
                                const routeExists = combinedGraph[airportCode].some(
                                    existingRoute => 
                                        existingRoute.type === 'air' && 
                                        existingRoute.shipId === route.shipId
                                );
                                
                                if (!routeExists) {
                                    combinedGraph[airportCode].push(route);
                                }
                            });
                        });
                        
                        console.log(`Enhanced graph updated with air routes: ${
                            Object.keys(combinedGraph).length
                        } total nodes (seaports and airports combined)`);
                        
                        return combinedGraph;
                    });
                }
                
                alert(`Air routes graph created with ${Object.keys(airRoutesGraph).length} airports and ${totalRoutes} routes in ${processingTime}ms.`);
                
                // Make data available globally for convenience
                window.airRoutesGraph = airRoutesGraph;
            } catch (error) {
                console.error("Error transforming air routes graph:", error);
                alert(`Error creating air routes graph: ${error.message}`);
            }
        } else {
            console.log("No intermediate routes data available");
            alert("No intermediate routes data available to transform.");
        }
    };
    
    // Add a function to display the multimodal graph details
    const displayMultimodalGraphDetails = () => {
        if (!dataStore.multimodalGraph) {
            alert("Multimodal graph is not available. Please build it first.");
            return;
        }
        
        const graph = dataStore.multimodalGraph;
        const nodes = Object.keys(graph.nodes).length;
        const edges = graph.edges.length;
        const seaportsCount = Object.keys(graph.seaToAirConnections).length;
        const airportsCount = Object.keys(graph.airToSeaConnections).length;
        
        // Count connection types
        const seaToAirCount = graph.edges.filter(edge => edge.type === 'sea_to_air').length;
        const airToSeaCount = graph.edges.filter(edge => edge.type === 'air_to_sea').length;
        const multimodalCount = graph.edges.filter(edge => edge.type === 'sea_air_connection').length;
        
        const details = `
            Multimodal Graph Statistics:
            ----------------------------
            Total Nodes: ${nodes}
            - Seaports: ${seaportsCount}
            - Airports: ${airportsCount}
            
            Total Connections: ${edges}
            - Seaport to Airport: ${seaToAirCount}
            - Airport to Seaport: ${airToSeaCount}
            - Sea-Air Multimodal: ${multimodalCount}
            
            The complete graph is available at window.multimodalGraph
            and window.routesDebugData.multimodalGraph
        `;
        
        console.log(details);
        alert(details);
    };
    
    // Add a function to build the multimodal graph combining sea and air routes
    const createMultimodalGraph = async () => {
        if (!dataStore.seaRoutesGraph) {
            alert("Sea routes graph is not available. Please load sea routes first.");
            return;
        }
        
        if (!dataStore.airRoutesGraph) {
            if (intermediateRoutes && Object.keys(intermediateRoutes).length > 0) {
                console.log("Transforming intermediate routes to air routes graph first...");
                // First deduplicate the routes
                const deduplicatedRoutes = deduplicateAndLimitIntermediateRoutes(intermediateRoutes);
                transformIntermediateAirRoutesToGraph(deduplicatedRoutes);
            } else {
                alert("Air routes graph is not available. Please load air routes first.");
                return;
            }
        }
        
        console.log("Building multimodal graph...");
        
        try {
            // Ensure we use the deduplicated routes for multimodal graph building
            if (dataStore.intermediateRoutes) {
                console.log("Ensuring intermediateRoutes are deduplicated before building multimodal graph");
                dataStore.intermediateRoutes = deduplicateAndLimitIntermediateRoutes(dataStore.intermediateRoutes);
            }
            
            const multimodalGraph = await buildMultimodalGraph();
            
            if (multimodalGraph) {
                console.log("Multimodal graph built successfully!");
                alert(`Multimodal graph built with ${Object.keys(multimodalGraph.nodes).length} nodes and ${multimodalGraph.edges.length} connections.`);
                
                // Display the detailed statistics
                displayMultimodalGraphDetails();
            } else {
                console.error("Failed to build multimodal graph");
                alert("Failed to build multimodal graph. Check console for details.");
            }
        } catch (error) {
            console.error("Error building multimodal graph:", error);
            alert(`Error building multimodal graph: ${error.message}`);
        }
    };
    
    // Add a debug function to log the current state
    const toggleDebugInfo = () => {
        setShowDebugInfo(!showDebugInfo);
        setShowDebugDetails(!showDebugDetails);
        console.log("=== CURRENT SEA ROUTES GRAPH ===");
        console.log(enhancedGraph);
        console.log("=== CURRENT INTERMEDIATE ROUTES ===");
        console.log(intermediateRoutes);
        
        console.log("=== CURRENT AIR ROUTES GRAPH ===");
        if (dataStore.airRoutesGraph) {
            const airportCount = Object.keys(dataStore.airRoutesGraph).length;
            const routeCount = Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0);
            console.log(`Air Routes Graph: ${airportCount} airports, ${routeCount} routes`);
            
            // Log details about each airport
            Object.entries(dataStore.airRoutesGraph).forEach(([airport, routes]) => {
                console.log(`Airport ${airport}: ${routes.length} routes`);
            });
            
            console.log(dataStore.airRoutesGraph);
        } else {
            console.log("Air routes graph not generated yet");
        }
        
        console.log("=== CURRENT MULTIMODAL GRAPH ===");
        console.log(dataStore.multimodalGraph);
        console.log("=== DATA STORE CONTENTS ===");
        console.log(dataStore);
        // Make data available globally for debugging
        window.routesDebugData = {
            enhancedGraph,
            intermediateRoutes,
            airRoutesGraph: dataStore.airRoutesGraph,
            multimodalGraph: dataStore.multimodalGraph,
            dataStore
        };
        console.log("All data is available at window.routesDebugData");
    };
    
    // Add a function to verify the air routes graph status
    const verifyAirRoutesGraph = () => {
        console.log("==== VERIFYING AIR ROUTES GRAPH ====");
        
        if (!dataStore.airRoutesGraph) {
            console.log("Air routes graph is not available in dataStore");
            alert("Air routes graph is not available in dataStore. Try transforming the data first.");
            return;
        }
        
        const airports = Object.keys(dataStore.airRoutesGraph);
        const totalRoutes = Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0);
        
        console.log(`Air routes graph contains ${airports.length} airports and ${totalRoutes} total routes`);
        console.log("Airports:", airports.join(', '));
        
        // Log details for each airport
        airports.forEach(airport => {
            const routes = dataStore.airRoutesGraph[airport];
            console.log(`Airport ${airport}: ${routes.length} routes`);
            if (routes.length > 0) {
                console.log(`Sample route from ${airport}:`, routes[0]);
            }
        });
        
        // Check if the data is also in the window object
        if (window.airRoutesGraph) {
            console.log("Air routes graph is also available in window.airRoutesGraph");
            console.log("Window object has same data:", 
                Object.keys(window.airRoutesGraph).length === airports.length ? "Yes" : "No");
        } else {
            console.log("Air routes graph is NOT available in window.airRoutesGraph");
        }
        
        alert(`Air routes graph verification complete:\n${airports.length} airports\n${totalRoutes} routes\n\nDetails in console.`);
    };
    
    // Add a new function to fetch direct air routes
    const fetchDirectAirRoutes = async (startPortCode, endPortCode, formattedDate) => {
        console.log(`Fetching direct air routes from ${startPortCode} to ${endPortCode}`);
        
        try {
            // Find nearby airports to both ports
            // This is a placeholder - in a real implementation you would use a service to find 
            // the nearest airports to the seaports and then fetch routes between them
            
            // For now, let's assume we can create a basic air route structure
            const directAirRoute = {
                fromStop: startPortCode,
                toDestination: endPortCode,
                routes: [] // This would be populated with actual route data
            };
            
            // Store this in the intermediate routes data structure
            setIntermediateRoutes(prev => {
                const updated = prev || {};
                updated[`direct_${startPortCode}_to_${endPortCode}`] = directAirRoute;
                
                // Immediately deduplicate the routes
                const deduplicatedRoutes = deduplicateAndLimitIntermediateRoutes(updated);
                
                return deduplicatedRoutes;
            });
            
            console.log("Added direct air route to intermediate routes");
            
            // Transform to air routes graph to make it immediately available
            if (intermediateRoutes && Object.keys(intermediateRoutes).length > 0) {
                // Make sure we use deduplicated routes
                const deduplicatedRoutes = deduplicateAndLimitIntermediateRoutes(intermediateRoutes);
                transformIntermediateAirRoutesToGraph(deduplicatedRoutes);
            }
        } catch (error) {
            console.error("Error fetching direct air routes:", error);
            // Don't disrupt the flow if this fails
        }
    };
    
    // Add a deduplicated version of transformIntermediateAirRoutesToGraph that removes duplicates
    const deduplicateAndLimitIntermediateRoutes = (intermediateRoutesData) => {
        console.log('Deduplicating and limiting intermediate routes...');
        
        if (!intermediateRoutesData || typeof intermediateRoutesData !== 'object') {
            console.warn('Invalid intermediate routes data provided for deduplication');
            return {};
        }
        
        // Create a deep copy to avoid modifying the original
        const deduplicatedRoutes = JSON.parse(JSON.stringify(intermediateRoutesData));
        
        // Track all unique route sequences across all entries
        const processedRouteSequences = new Set();
        const uniqueRouteSequences = [];
        
        // First pass: collect all unique route sequences
        Object.keys(deduplicatedRoutes).forEach(key => {
            if (key.startsWith('_') || key === 'allPortRoutes') return;
            
            const routeData = deduplicatedRoutes[key];
            if (!routeData?.routes || !Array.isArray(routeData.routes)) return;
            
            routeData.routes.forEach(routeSegments => {
                if (!Array.isArray(routeSegments) || routeSegments.length === 0) return;
                
                // Create a unique signature for the route sequence
                const routeSignature = routeSegments.map(segment => 
                    `${segment.carrierCode}${segment.flightNo}-${segment.origin}-${segment.destination}`
                ).join('|');
                
                if (!processedRouteSequences.has(routeSignature)) {
                    processedRouteSequences.add(routeSignature);
                    uniqueRouteSequences.push({
                        signature: routeSignature,
                        segments: routeSegments,
                        key: key
                    });
                }
            });
        });
        
        // Sort unique sequences by number of segments (fewer segments first)
        uniqueRouteSequences.sort((a, b) => a.segments.length - b.segments.length);
        
        // Take top 10 unique sequences
        const topSequences = uniqueRouteSequences.slice(0, 10);
        
        // Second pass: update each entry to only include the top unique sequences
        Object.keys(deduplicatedRoutes).forEach(key => {
            if (key.startsWith('_') || key === 'allPortRoutes') return;
            
            const routeData = deduplicatedRoutes[key];
            if (!routeData?.routes || !Array.isArray(routeData.routes)) return;
            
            // Filter routes to only include the top sequences
            routeData.routes = routeData.routes.filter(routeSegments => {
                if (!Array.isArray(routeSegments) || routeSegments.length === 0) return false;
                
                const signature = routeSegments.map(segment => 
                    `${segment.carrierCode}${segment.flightNo}-${segment.origin}-${segment.destination}`
                ).join('|');
                
                return topSequences.some(seq => seq.signature === signature);
            });
            
            console.log(`Updated ${key} to have ${routeData.routes.length} unique routes`);
        });
        
        return deduplicatedRoutes;
    };
    
    if (isLoading) {
        return (
            <div className={styles.simpleLoadingIndicator}>
                <div className={styles.loadingSpinner}></div>
                <div className={styles.loadingText}>Fetching ship routes...</div>
            </div>
        );
    }
    
    if (error) {
        return <div className={styles.error}>{error}</div>;
    }
    
    // Create location objects in the format expected by the MultimodalTransportGraph
    const originLocation = startSeaport ? {
        id: startSeaport.code || startSeaport.world_port_index,
        name: startSeaport.name || startSeaport.main_port_name,
        type: 'seaport',
        lat: parseFloat(startSeaport.latitude_dd),
        lng: parseFloat(startSeaport.longitude_dd)
    } : null;
    
    const destinationLocation = endSeaport ? {
        id: endSeaport.code || endSeaport.world_port_index,
        name: endSeaport.name || endSeaport.main_port_name,
        type: 'seaport',
        lat: parseFloat(endSeaport.latitude_dd),
        lng: parseFloat(endSeaport.longitude_dd)
    } : null;
    
    if (!startSeaport || !endSeaport) {
        return (
            <div className={styles.noRoutesMessage}>
                Please select both origin and destination ports to view shipping routes.
            </div>
        );
    }
    
    const startPortName = startSeaport?.name || startSeaport?.main_port_name || startSeaport?.code;
    const endPortName = endSeaport?.name || endSeaport?.main_port_name || endSeaport?.code;
    const startPortCode = startSeaport?.code || startSeaport?.world_port_index || '';
    const endPortCode = endSeaport?.code || endSeaport?.world_port_index || '';
    
    return (
        <div className={styles.shipRoutesContainer}>
            <button 
                className={styles.multimodalToggleButton}
                onClick={toggleMultimodal}
                style={{ display: 'none' }}  /* Hide the button since we've removed multimodal functionality */
            >
                Switch to Ship Routes View
            </button>
            
            <div className={styles.shipRoutesDisplay}>
                <div className={styles.routeInfo}>
                    <h3>Ship Routes</h3>
                    <div className={styles.routeDetails}>
                        <div className={styles.portCard}>
                            <span className={styles.portLabel}>Origin:</span>
                            <span className={styles.portName}>{startPortName}</span>
                            <span className={styles.portCode}>{startPortCode}</span>
                        </div>
                        <div className={styles.routeArrow}>→</div>
                        <div className={styles.portCard}>
                            <span className={styles.portLabel}>Destination:</span>
                            <span className={styles.portName}>{endPortName}</span>
                            <span className={styles.portCode}>{endPortCode}</span>
                        </div>
                    </div>
                    
                    {/* Debug buttons */}
                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '10px' }}>
                        <button 
                            className={styles.debugButton} 
                            onClick={toggleDebugInfo}
                            style={{ 
                                padding: '5px 10px',
                                background: '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Debug Info
                        </button>
                        <button 
                            className={styles.debugButton} 
                            onClick={transformAirRoutesGraph}
                            style={{ 
                                padding: '5px 10px',
                                background: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Transform Air Routes
                        </button>
                        <button 
                            className={styles.debugButton} 
                            onClick={createMultimodalGraph}
                            style={{ 
                                padding: '5px 10px',
                                background: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Build Multimodal Graph
                        </button>
                        <button 
                            className={styles.debugButton} 
                            onClick={verifyAirRoutesGraph}
                            style={{ 
                                padding: '5px 10px',
                                background: '#ffc107',
                                color: 'black',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Verify Air Routes
                        </button>
                        <button 
                            className={styles.debugButton} 
                            onClick={syncAirRoutesGraph}
                            style={{ 
                                padding: '5px 10px',
                                background: '#17a2b8',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Sync Air Routes
                        </button>
                        {dataStore.multimodalGraph && (
                            <button 
                                className={styles.debugButton} 
                                onClick={displayMultimodalGraphDetails}
                                style={{ 
                                    padding: '5px 10px',
                                    background: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                View Multimodal Stats
                            </button>
                        )}
                    </div>
                    
                    {/* Debug information display */}
                    {showDebugDetails && (
                        <div style={{ 
                            position: 'absolute', 
                            top: '60px', 
                            right: '10px', 
                            background: 'rgba(0,0,0,0.8)', 
                            color: 'white', 
                            padding: '10px', 
                            borderRadius: '4px',
                            maxWidth: '300px',
                            zIndex: 1000
                        }}>
                            <h4 style={{margin: '0 0 10px 0'}}>Data Status</h4>
                            <div>
                                <div><strong>Sea Routes Graph:</strong> {enhancedGraph ? `${Object.keys(enhancedGraph).length} ports` : 'Not loaded'}</div>
                                <div><strong>Intermediate Routes:</strong> {intermediateRoutes ? `${Object.keys(intermediateRoutes).length} connections` : 'Not loaded'}</div>
                                <div>
                                    <strong>Air Routes Graph:</strong> {dataStore.airRoutesGraph ? (
                                        <>
                                            {`${Object.keys(dataStore.airRoutesGraph).length} airports, `}
                                            {`${Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)} routes`}
                                        </>
                                    ) : 'Not generated'}
                                </div>
                                <div><strong>Multimodal Graph:</strong> {dataStore.multimodalGraph ? `${Object.keys(dataStore.multimodalGraph.nodes).length} nodes, ${dataStore.multimodalGraph.edges.length} edges` : 'Not generated'}</div>
                            </div>
                            <div style={{marginTop: '10px'}}>
                                <small>All data available at window.routesDebugData</small>
                            </div>
                        </div>
                    )}
                    
                    {/* API Error notifications */}
                    {apiErrors.length > 0 && (
                        <div style={{ 
                            position: 'fixed', 
                            bottom: '20px', 
                            right: '20px', 
                            maxWidth: '400px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            background: 'rgba(220,53,69,0.9)', 
                            color: 'white', 
                            padding: '10px', 
                            borderRadius: '4px',
                            zIndex: 1000,
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '10px',
                                borderBottom: '1px solid rgba(255,255,255,0.3)',
                                paddingBottom: '5px'
                            }}>
                                <h4 style={{margin: 0}}>API Error Notifications ({apiErrors.length})</h4>
                                <button 
                                    onClick={() => setApiErrors([])} 
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        fontSize: '16px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            <div>
                                <p style={{margin: '0 0 10px 0', fontSize: '14px'}}>
                                    Some data could not be retrieved, but the application can continue to function.
                                </p>
                                <ul style={{
                                    margin: 0,
                                    padding: '0 0 0 20px',
                                    fontSize: '13px',
                                    opacity: 0.9
                                }}>
                                    {apiErrors.slice(0, 5).map((err, index) => (
                                        <li key={index} style={{marginBottom: '5px'}}>
                                            {err.message}
                                        </li>
                                    ))}
                                    {apiErrors.length > 5 && (
                                        <li>...and {apiErrors.length - 5} more errors</li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    )}
                    
                    {shipRoutes.length > 0 ? (
                        <div className={styles.routesList}>
                            {shipRoutes.map((route, index) => (
                                <div key={index} className={styles.routeCard}>
                                    <div className={styles.routeHeader}>
                                        <span className={styles.routeName}>
                                            {`Route ${index + 1}`}
                                        </span>
                                        <span className={styles.routeDuration}>
                                            {route.totalDuration ? `${route.totalDuration} days` : 'Duration unavailable'}
                                        </span>
                                    </div>
                                    <div className={styles.routePath}>
                                        <div className={styles.routeSegments}>
                                            {route.voyages && route.voyages.map((voyage, vidx) => (
                                                <div key={vidx} className={styles.routeSegment}>
                                                    <div className={styles.segmentHeader}>
                                                        <div className={styles.shipInfo}>
                                                            <span className={styles.shipIcon}>🚢</span>
                                                            <span className={styles.shipName}>{voyage.shipName || 'Vessel'}</span>
                                                        </div>
                                                        <div className={styles.voyageInfo}>
                                                            Voyage: {voyage.voyage || 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div className={styles.segmentDetails}>
                                                        <div className={styles.segmentPorts}>
                                                            <span className={styles.fromPort}>{voyage.fromPortName || voyage.fromPort}</span>
                                                            <span className={styles.portArrow}>→</span>
                                                            <span className={styles.toPort}>{voyage.toPortName || voyage.toPort}</span>
                                                        </div>
                                                        <div className={styles.segmentTimes}>
                                                            <span className={styles.departureTime}>ETD: {voyage.etd || 'N/A'}</span>
                                                            <span className={styles.arrivalTime}>ETA: {voyage.eta || 'N/A'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.noData}>
                            No direct ship routes found between these ports. 
                            Try the Multimodal Transport view for alternative connections.
                        </div>
                    )}
                    
                    {/* Display Enhanced Graph Routes */}
                    {enhancedGraph && Object.keys(enhancedGraph).length > 0 && (
                        <div className={styles.enhancedRoutesSection}>
                            <h3>Enhanced Routes</h3>
                            <p className={styles.enhancedRoutesInfo}>
                                These are additional routes found using arrival dates at intermediate ports.
                            </p>
                            
                            {Object.entries(enhancedGraph).map(([portCode, routes], index) => {
                                // Skip the origin port as those routes are already displayed above
                                if (portCode === startPortCode) return null;
                                
                                return (
                                    <div key={index} className={styles.enhancedRouteCard}>
                                        <h4>Routes from {portCode} to {endPortCode}</h4>
                                        
                                        {routes.length > 0 ? (
                                            <div className={styles.enhancedRoutesList}>
                                                {routes.map((route, routeIdx) => (
                                                    <div key={routeIdx} className={styles.enhancedRouteItem}>
                                                        <div className={styles.enhancedRouteHeader}>
                                                            <span className={styles.routeName}>
                                                                {`Route ${routeIdx + 1}`}
                                                            </span>
                                                            <span className={styles.routeDuration}>
                                                                {route.duration ? `${route.duration} days` : 'Duration unavailable'}
                                                            </span>
                                                        </div>
                                                        <div className={styles.enhancedRoutePath}>
                                                            <div className={styles.shipInfo}>
                                                                <span className={styles.shipIcon}>🚢</span>
                                                                <span className={styles.shipName}>{route.shipName || 'Vessel'}</span>
                                                            </div>
                                                            <div className={styles.voyageInfo}>
                                                                Voyage: {route.voyage || 'N/A'}
                                                            </div>
                                                            <div className={styles.routeTimes}>
                                                                <span className={styles.departureTime}>ETD: {formatDate(route.departureTime)}</span>
                                                                <span className={styles.arrivalTime}>ETA: {formatDate(route.arrivalTime)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className={styles.noEnhancedRoutes}>
                                                No enhanced routes found from {portCode} to {endPortCode}.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    
                    {/* Display Intermediate Routes */}
                    {intermediateRoutes && Object.keys(intermediateRoutes).length > 0 && (
                        <div className={styles.intermediateRoutesSection}>
                            <h3>Intermediate Routes</h3>
                            <p className={styles.intermediateRoutesInfo}>
                                These are alternative routes from intermediate points to the destination.
                            </p>
                            
                            {Object.entries(intermediateRoutes).map(([pathKey, data], index) => {
                                // Check if this is the special "startToIntermediate" entry
                                if (pathKey === "startToIntermediate") {
                                    return (
                                        <div key={index} className={styles.intermediateRouteCard}>
                                            <h4>Routes from {data.startPort} to Intermediate Ports</h4>
                                            
                                            {Object.entries(data.intermediateRoutes).map(([intermediatePort, routes], idx) => (
                                                <div key={idx} className={styles.intermediatePointSection}>
                                                    <h5>From {data.startPort} to {intermediatePort}</h5>
                                                    
                                                    {routes && routes.length > 0 ? (
                                                        <div className={styles.intermediateRoutesList}>
                                                            {routes.map((route, routeIdx) => (
                                                                <div key={routeIdx} className={styles.intermediateRouteItem}>
                                                                    <div className={styles.intermediateRouteHeader}>
                                                                        <span className={styles.routeName}>
                                                                            {`Route ${routeIdx + 1}`}
                                                                        </span>
                                                                        <span className={styles.routeDuration}>
                                                                            {route.totalDuration ? `${route.totalDuration} days` : 'Duration unavailable'}
                                                                        </span>
                                                                    </div>
                                                                    <div className={styles.intermediateRoutePath}>
                                                                        {route.voyages && route.voyages.map((voyage, vidx) => (
                                                                            <div key={vidx} className={styles.intermediateVoyage}>
                                                                                <span className={styles.shipName}>{voyage.shipName || 'Vessel'}</span>
                                                                                <span className={styles.voyageInfo}>Voyage: {voyage.voyage || 'N/A'}</span>
                                                                                <span className={styles.routeTimes}>
                                                                                    {voyage.etd || 'N/A'} → {voyage.eta || 'N/A'}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className={styles.noIntermediateRoutes}>
                                                            No routes found from {data.startPort} to {intermediatePort}.
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }
                                
                                // Normal intermediate routes display
                                return (
                                    <div key={index} className={styles.intermediateRouteCard}>
                                        <h4>Path: {pathKey}</h4>
                                        
                                        {data.intermediateRoutes && Object.entries(data.intermediateRoutes).map(([intermediatePoint, routes], idx) => (
                                            <div key={idx} className={styles.intermediatePointSection}>
                                                <h5>From {intermediatePoint} to {endPortCode}</h5>
                                                
                                                {routes.completeRoutes && routes.completeRoutes.length > 0 ? (
                                                    <div className={styles.intermediateRoutesList}>
                                                        {routes.completeRoutes.map((route, routeIdx) => (
                                                            <div key={routeIdx} className={styles.intermediateRouteItem}>
                                                                <div className={styles.intermediateRouteHeader}>
                                                                    <span className={styles.routeName}>
                                                                        {`Route ${routeIdx + 1}`}
                                                                    </span>
                                                                    <span className={styles.routeDuration}>
                                                                        {route.totalDuration ? `${route.totalDuration} days` : 'Duration unavailable'}
                                                                    </span>
                                                                </div>
                                                                <div className={styles.intermediateRoutePath}>
                                                                    {route.voyages && route.voyages.map((voyage, vidx) => (
                                                                        <div key={vidx} className={styles.intermediateVoyage}>
                                                                            <span className={styles.shipName}>{voyage.shipName || 'Vessel'}</span>
                                                                            <span className={styles.voyageInfo}>Voyage: {voyage.voyage || 'N/A'}</span>
                                                                            <span className={styles.routeTimes}>
                                                                                {voyage.etd || 'N/A'} → {voyage.eta || 'N/A'}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className={styles.noIntermediateRoutes}>
                                                        No intermediate routes found from {intermediatePoint} to {endPortCode}.
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShipRoutesDisplay; 
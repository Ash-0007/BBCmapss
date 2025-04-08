import React, { useState, useEffect } from 'react';
import { 
    fetchHapagShipRoutesGraph, 
    fetchIntermediateShipRoutes, 
    storeSeaRoutesGraph, 
    storeIntermediateRoutes,
    transformIntermediateAirRoutesToGraph,
    dataStore 
} from '../../services/api';
import styles from '../../assets/MapComponent.module.scss';
import MultimodalTransportGraph from './MultimodalTransportGraph';

const ShipRoutesDisplay = ({ startSeaport, endSeaport, dateRange }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
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
            console.log("Intermediate routes are ready, storing them...");
            storeIntermediateRoutes(intermediateRoutes)
                .then(() => {
                    console.log("Intermediate routes stored successfully in memory");
                    // Store it in window for global access if needed
                    window.intermediateRoutes = intermediateRoutes;
                    console.log("Intermediate routes also available at window.intermediateRoutes");
                    
                    // Transform the intermediate air routes data to graph format
                    const airRoutesGraph = transformIntermediateAirRoutesToGraph(intermediateRoutes);
                    console.log("Air routes graph created with", Object.keys(airRoutesGraph).length, "airports");
                })
                .catch(err => console.error("Error storing intermediate routes:", err));
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

    // Fetch ship routes data when the component mounts or when ports/dates change
    useEffect(() => {
        if (startSeaport && endSeaport) {
            // Reset processedPorts when ports or dates change
            setProcessedPorts(new Set());
            fetchShipRoutesData();
        }
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
        
        // Create a copy of the graph to avoid modifying the original
        const enhancedGraphCopy = { ...graph };
        
        // Get all port codes from the graph excluding the end port
        const portCodes = Object.keys(graph).filter(code => code !== endPortCode);
        console.log(`Found ${portCodes.length} ports to process for intermediate routes`);
        
        // Skip already processed ports
        const portsToProcess = portCodes.filter(code => !processedPorts.has(code));
        console.log(`Processing ${portsToProcess.length} ports (${portCodes.length - portsToProcess.length} already processed)`);
        
        // Process ports in smaller batches to avoid too many parallel requests
        const batchSize = 2; // Process 2 ports at a time
        
        for (let i = 0; i < portsToProcess.length; i += batchSize) {
            const batch = portsToProcess.slice(i, i + batchSize);
            console.log(`Processing batch ${i/batchSize + 1}: ${batch.join(', ')}`);
            
            // Process each port in this batch in parallel
            await Promise.all(batch.map(async (portCode) => {
                // Mark this port as processed
                setProcessedPorts(prev => new Set([...prev, portCode]));
                
                // Get the first route for this port (to avoid redundant API calls)
                const routes = graph[portCode] || [];
                if (routes.length === 0) return;
                
                // Process multiple routes for this port to find more connections
                // but limit to 2 routes to avoid excessive API calls
                const routesToProcess = routes.slice(0, 2);
                
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
                        }
                    } catch (error) {
                        console.error(`Error fetching intermediate routes from ${portCode} to ${endPortCode}:`, error);
                    }
                }
            }));
            
            // Update the enhanced graph after each batch
            dataStore.seaRoutesGraph = enhancedGraphCopy;
            setEnhancedGraph(enhancedGraphCopy);
        }
        
        // Final update after all batches are processed
        dataStore.seaRoutesGraph = enhancedGraphCopy;
        setEnhancedGraph(enhancedGraphCopy);
        console.log("Enhanced graph:", enhancedGraphCopy);
    };
    
    // Function to fetch intermediate routes data
    const fetchIntermediateRoutesData = async (routes, formattedDate) => {
        try {
            console.log("Fetching intermediate routes for the found routes");
            
            // Extract paths from the routes
            const paths = routes.map(route => route.path);
            console.log("Paths to process:", paths);
            
            // Get unique paths to avoid duplicate API calls
            const uniquePaths = [...new Set(paths.map(path => path.join('->')))]
                .map(pathStr => pathStr.split('->'));
            console.log(`Processing ${uniquePaths.length} unique paths out of ${paths.length} total paths`);
            
            // Process each path to find intermediate routes
            const newIntermediateRoutes = {};
            
            const batchSize = 2; // Process paths in batches of 2
            for (let i = 0; i < uniquePaths.length; i += batchSize) {
                const batch = uniquePaths.slice(i, i + batchSize);
                console.log(`Processing batch ${i/batchSize + 1} of paths`);
                
                // Process each path in this batch in parallel
                const batchResults = await Promise.all(batch.map(async (path) => {
                    if (path.length >= 3) {
                        console.log(`Processing path: ${path.join(' -> ')}`);
                        
                        // Fetch intermediate routes for this path
                        try {
                            const intermediateData = await fetchIntermediateShipRoutes(path, formattedDate);
                            console.log("Intermediate routes data received for path", path.join('->'));
                            return { 
                                key: path.join('->'),
                                data: intermediateData 
                            };
                        } catch (error) {
                            console.error(`Error fetching intermediate routes for path ${path.join('->')}:`, error);
                            return { key: path.join('->'), data: null };
                        }
                    }
                    return null;
                }));
                
                // Add the batch results to the intermediate routes
                batchResults.forEach(result => {
                    if (result) {
                        newIntermediateRoutes[result.key] = result.data;
                    }
                });
                
                // Update intermediate routes after each batch
                setIntermediateRoutes(prev => {
                    const updated = {
                        ...prev,
                        ...newIntermediateRoutes
                    };
                    // Make the data instantly available in the dataStore
                    dataStore.intermediateRoutes = updated;
                    console.log("Intermediate routes updated in dataStore");
                    return updated;
                });
            }
        } catch (error) {
            console.error("Error fetching intermediate routes:", error);
        }
    };
    
    // Function to calculate routes from starting port to all intermediate ports
    // and from all intermediate ports to the destination port
    const calculateRoutesToIntermediatePorts = async (graph, startPortCode, endPortCode, formattedDate) => {
        console.log("Calculating routes between all ports in the graph...");
        
        // Get all port codes from the graph except the starting port and end port
        const intermediatePorts = Object.keys(graph).filter(portCode => 
            portCode !== startPortCode && portCode !== endPortCode
        );
        
        console.log(`Found ${intermediatePorts.length} intermediate ports: ${intermediatePorts.join(", ")}`);
        
        // Create a container for all the routes
        const allRoutes = {};
        
        // Create a copy of the enhanced graph to update
        const enhancedGraphCopy = { ...enhancedGraph || graph };
        
        // 1. FIRST: Calculate routes from starting port to all intermediate ports
        console.log(`Calculating routes from starting port ${startPortCode} to all intermediate ports`);
        
        // Process intermediate ports in batches
        const batchSize = 2;
        for (let i = 0; i < intermediatePorts.length; i += batchSize) {
            const batch = intermediatePorts.slice(i, i + batchSize);
            console.log(`Processing batch ${i/batchSize + 1} of intermediate ports (start to intermediate): ${batch.join(", ")}`);
            
            // For each intermediate port in this batch, fetch routes from the starting port
            await Promise.all(batch.map(async (portCode) => {
                console.log(`Fetching routes from ${startPortCode} to intermediate port ${portCode}`);
                
                try {
                    const routesData = await fetchHapagShipRoutesGraph(startPortCode, portCode, formattedDate);
                    
                    if (routesData && !routesData.error && routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                        console.log(`Found ${routesData.completeRoutes.length} routes from ${startPortCode} to ${portCode}`);
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
                    } else {
                        console.log(`No routes found from ${startPortCode} to ${portCode}`);
                        allRoutes[`${startPortCode}-${portCode}`] = [];
                    }
                } catch (error) {
                    console.error(`Error fetching routes from ${startPortCode} to ${portCode}:`, error);
                    allRoutes[`${startPortCode}-${portCode}`] = [];
                }
            }));
            
            // Update the enhanced graph after each batch
            setEnhancedGraph(enhancedGraphCopy);
        }
        
        // 2. SECOND: Calculate routes from all intermediate ports to the destination port
        console.log(`Calculating routes from all intermediate ports to destination port ${endPortCode}`);
        
        for (let i = 0; i < intermediatePorts.length; i += batchSize) {
            const batch = intermediatePorts.slice(i, i + batchSize);
            console.log(`Processing batch ${i/batchSize + 1} of intermediate ports (intermediate to end): ${batch.join(", ")}`);
            
            // For each intermediate port in this batch, fetch routes to the destination port
            await Promise.all(batch.map(async (portCode) => {
                console.log(`Fetching routes from intermediate port ${portCode} to ${endPortCode}`);
                
                try {
                    const routesData = await fetchHapagShipRoutesGraph(portCode, endPortCode, formattedDate);
                    
                    if (routesData && !routesData.error && routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                        console.log(`Found ${routesData.completeRoutes.length} routes from ${portCode} to ${endPortCode}`);
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
                    } else {
                        console.log(`No routes found from ${portCode} to ${endPortCode}`);
                        allRoutes[`${portCode}-${endPortCode}`] = [];
                    }
                } catch (error) {
                    console.error(`Error fetching routes from ${portCode} to ${endPortCode}:`, error);
                    allRoutes[`${portCode}-${endPortCode}`] = [];
                }
            }));
            
            // Update the enhanced graph after each batch
            setEnhancedGraph(enhancedGraphCopy);
        }
        
        // 3. Update the intermediate routes with all the routes we found
        setIntermediateRoutes(prev => {
            const updated = prev || {};
            updated["allPortRoutes"] = { 
                startPort: startPortCode,
                endPort: endPortCode,
                intermediateRoutes: allRoutes 
            };
            return updated;
        });
        
        console.log("All routes calculated between ports:", Object.keys(allRoutes).length);
        console.log("Final enhanced graph:", enhancedGraphCopy);

        // Make the data instantly available in the dataStore
        dataStore.seaRoutesGraph = enhancedGraphCopy;

        // Add a small delay before setting the state to ensure the data is available
        setTimeout(() => {
            setEnhancedGraph(enhancedGraphCopy);
            console.log("Enhanced graph state updated");
        }, 100);
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
            const airRoutesGraph = transformIntermediateAirRoutesToGraph(intermediateRoutes);
            console.log("Air routes graph transformed with", Object.keys(airRoutesGraph).length, "airports");
            console.log("Air routes graph:", airRoutesGraph);
            alert(`Air routes graph created with ${Object.keys(airRoutesGraph).length} airports.`);
        } else {
            console.log("No intermediate routes data available");
            alert("No intermediate routes data available to transform.");
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
        console.log(dataStore.airRoutesGraph);
        console.log("=== DATA STORE CONTENTS ===");
        console.log(dataStore);
        // Make data available globally for debugging
        window.routesDebugData = {
            enhancedGraph,
            intermediateRoutes,
            airRoutesGraph: dataStore.airRoutesGraph,
            dataStore
        };
        console.log("All data is available at window.routesDebugData");
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
            >
                {showMultimodal ? 'Switch to Ship Routes View' : 'Switch to Multimodal Transport View'}
            </button>
            
            {showMultimodal ? (
                <MultimodalTransportGraph 
                    originLocation={originLocation} 
                    destinationLocation={destinationLocation}
                    startDate={getFormattedDate()}
                    options={{
                        preferredModes: ['sea', 'road'],
                        includeAirRoutes: true,
                        maxTransfers: 3
                    }}
                />
            ) : (
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
                                    <div><strong>Air Routes Graph:</strong> {dataStore.airRoutesGraph ? `${Object.keys(dataStore.airRoutesGraph).length} airports` : 'Not generated'}</div>
                                </div>
                                <div style={{marginTop: '10px'}}>
                                    <small>All data available at window.routesDebugData</small>
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
            )}
        </div>
    );
};

export default ShipRoutesDisplay; 
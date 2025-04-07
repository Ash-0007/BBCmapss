import React, { useState, useEffect } from 'react';
import { fetchHapagShipRoutesGraph, fetchIntermediateShipRoutes } from '../../services/api';
import styles from '../../assets/MapComponent.module.scss';
import MultimodalTransportGraph from './MultimodalTransportGraph';

const ShipRoutesDisplay = ({ startSeaport, endSeaport, dateRange }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showMultimodal, setShowMultimodal] = useState(false);
    const [shipRoutes, setShipRoutes] = useState([]);
    const [intermediateRoutes, setIntermediateRoutes] = useState(null);
    const [enhancedGraph, setEnhancedGraph] = useState(null);
    
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
                
                // After getting the initial routes, fetch intermediate routes
                fetchIntermediateRoutesData(routesData.completeRoutes, formattedDate);
                
                // Also enhance the graph with intermediate routes
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
    
    // Function to enhance the graph with intermediate routes
    const enhanceGraphWithIntermediateRoutes = async (graph, endPortCode) => {
        if (!graph) return;
        
        console.log("Enhancing graph with intermediate routes");
        
        // Create a copy of the graph to avoid modifying the original
        const enhancedGraphCopy = { ...graph };
        
        // Process each port in the graph
        for (const [portCode, routes] of Object.entries(graph)) {
            // Skip the end port as we don't need routes from there
            if (portCode === endPortCode) continue;
            
            console.log(`Processing routes from ${portCode} to ${endPortCode}`);
            
            // Process each route from this port
            for (const route of routes) {
                // Extract the arrival date from this route
                const arrivalDate = route.arrivalTime;
                
                if (!arrivalDate) {
                    console.log(`No arrival date found for route from ${portCode} to ${route.toPort}`);
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
        }
        
        // Update the enhanced graph
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
            
            // Process each path to find intermediate routes
            for (const path of paths) {
                if (path.length >= 3) {
                    console.log(`Processing path: ${path.join(' -> ')}`);
                    
                    // Fetch intermediate routes for this path
                    const intermediateData = await fetchIntermediateShipRoutes(path, formattedDate);
                    console.log("Intermediate routes data received:", intermediateData);
                    
                    // Store the intermediate routes
                    setIntermediateRoutes(prev => {
                        const updated = prev || {};
                        updated[path.join('->')] = intermediateData;
                        return updated;
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching intermediate routes:", error);
        }
    };
    
    // Function to calculate routes from starting port to all intermediate ports
    const calculateRoutesToIntermediatePorts = async (graph, startPortCode, endPortCode, formattedDate) => {
        console.log("Calculating routes from starting port to all intermediate ports...");
        
        // Get all port codes from the graph except the starting port
        const intermediatePorts = Object.keys(graph).filter(portCode => 
            portCode !== startPortCode && portCode !== endPortCode
        );
        
        console.log(`Found ${intermediatePorts.length} intermediate ports: ${intermediatePorts.join(", ")}`);
        
        // Create a container for the new routes
        const startToIntermediateRoutes = {};
        
        // For each intermediate port, fetch routes from the starting port
        for (const portCode of intermediatePorts) {
            console.log(`Fetching routes from ${startPortCode} to intermediate port ${portCode}`);
            
            try {
                const routesData = await fetchHapagShipRoutesGraph(startPortCode, portCode, formattedDate);
                
                if (routesData && !routesData.error && routesData.completeRoutes && routesData.completeRoutes.length > 0) {
                    console.log(`Found ${routesData.completeRoutes.length} routes from ${startPortCode} to ${portCode}`);
                    startToIntermediateRoutes[portCode] = routesData.completeRoutes;
                } else {
                    console.log(`No routes found from ${startPortCode} to ${portCode}`);
                    startToIntermediateRoutes[portCode] = [];
                }
            } catch (error) {
                console.error(`Error fetching routes from ${startPortCode} to ${portCode}:`, error);
                startToIntermediateRoutes[portCode] = [];
            }
        }
        
        console.log("All routes from starting port to intermediate ports:", startToIntermediateRoutes);
        
        // Store the routes from starting port to intermediate ports
        setIntermediateRoutes(prev => {
            const updated = prev || {};
            updated["startToIntermediate"] = { 
                startPort: startPortCode,
                intermediateRoutes: startToIntermediateRoutes 
            };
            return updated;
        });
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
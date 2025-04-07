import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import styles from '../../assets/MapComponent.module.scss';
import { fetchPortLocationsByCode } from '../../services/api';

const coordinatesCache = new Map();

/**
 * Component that formats shipping routes data into a structure compatible with Google OR-Tools
 * Prepares data for routing optimization without visual representation
 */
const RouteGraphForOptimization = ({ routesData, onGraphReady }) => {
    const canvasRef = useRef(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
    const [distanceMatrix, setDistanceMatrix] = useState({});
    const [loading, setLoading] = useState(false);
    const [optimizationStats, setOptimizationStats] = useState(null);
    const [optimizationData, setOptimizationData] = useState(null);
    const hasProcessed = useRef(false);
    const processingAttempts = useRef(0);
    

    const calculateDuration = (departure, arrival) => {

        console.log(`[Duration] Raw inputs - FromETD: "${departure}", ToETD: "${arrival}"`);
        

        if (!departure || !arrival || departure === '----' || arrival === '----') {
            console.log('[Duration] Missing or invalid date format');
            return null;
        }
        
        try {


            const currentYear = new Date().getFullYear();
            

            const parseDate = (dateStr) => {
                if (dateStr.match(/^\d{2}\/\d{2}$/)) {

                    const [month, day] = dateStr.split('/');
                    return new Date(`${currentYear}-${month}-${day}`);
                }
                return new Date(dateStr);
            };
            
            const departureTime = parseDate(departure);
            const arrivalTime = parseDate(arrival);
            
            console.log(`[Duration] Parsed dates - Departure: ${departureTime.toISOString()}, Arrival: ${arrivalTime.toISOString()}`);
            
            if (isNaN(departureTime.getTime()) || isNaN(arrivalTime.getTime())) {
                console.log('[Duration] Invalid date after parsing');
                return null;
            }
            
            const durationHours = (arrivalTime - departureTime) / (1000 * 60 * 60);
            console.log(`[Duration] Calculated duration: ${durationHours} hours`);
            


            if (durationHours < 0) {
                console.log('[Duration] Negative duration detected, might be crossing year boundary');
                const adjustedArrivalTime = new Date(arrivalTime);
                adjustedArrivalTime.setFullYear(currentYear + 1);
                const adjustedDuration = (adjustedArrivalTime - departureTime) / (1000 * 60 * 60);
                
                console.log(`[Duration] Adjusted duration: ${adjustedDuration} hours`);
                if (adjustedDuration > 0) {
                    return adjustedDuration.toFixed(1);
                }
            }
            
            return durationHours > 0 ? durationHours.toFixed(1) : null;
        } catch (e) {
            console.error('[Duration] Error calculating duration:', e);
            return null;
        }
    };


    useEffect(() => {

        if (processingAttempts.current >= 3) {
            console.log('[Processing] ⚠️ Maximum processing attempts reached. Stopping to prevent infinite loop.');
            return;
        }
        

        if (!routesData || !routesData.completeRoutes || hasProcessed.current) {
            return;
        }
        

        processingAttempts.current += 1;
        console.log(`[Processing] Attempt #${processingAttempts.current} starting`);
        
        console.log('[Processing] Starting route data processing');
        setLoading(true);
        

        const processDataAndCreateJson = async () => {

            hasProcessed.current = true;
            
            try {
                console.log('[Processing] Starting route data processing...');
                const startTime = performance.now();

                const portsMap = new Map();
                const routesList = [];
                let indirectPathsProcessed = 0;
                
                // Step 1: Extract all unique ports and build initial port map
                console.log('[Processing] Extracting unique ports from routes data');
                routesData.completeRoutes.forEach(route => {
                    if (!route.voyages || !Array.isArray(route.voyages)) return;
                    
                    route.voyages.forEach(leg => {
                        const fromPort = leg.fromPort;
                        const toPort = leg.toPort;
                        
                        if (!fromPort || !toPort) return;

                        if (!portsMap.has(fromPort)) {
                            portsMap.set(fromPort, {
                                id: fromPort,
                                name: leg.fromPortName || fromPort,
                                lat: leg.fromPortLat || leg.fromPort_latitude_dd || null,
                                lng: leg.fromPortLng || leg.fromPort_longitude_dd || null
                            });
                        }
                        
                        if (!portsMap.has(toPort)) {
                            portsMap.set(toPort, {
                                id: toPort,
                                name: leg.toPortName || toPort,
                                lat: leg.toPortLat || leg.toPort_latitude_dd || null,
                                lng: leg.toPortLng || leg.toPort_longitude_dd || null
                            });
                        }

                        if (leg.schedule && leg.schedule.length > 0) {
                            const sortedSchedule = [...leg.schedule].sort((a, b) => {
                                const timeA = a.etd || a.eta;
                                const timeB = b.etd || b.eta;
                                return new Date(timeA) - new Date(timeB);
                            });

                            sortedSchedule.forEach(stop => {
                                const portCode = stop.port;
                                if (!portCode || portsMap.has(portCode)) return;
                                
                                portsMap.set(portCode, {
                                    id: portCode,
                                    name: stop.portName || portCode,
                                    lat: stop.lat || stop.latitude_dd || null,
                                    lng: stop.lng || stop.longitude_dd || null
                                });
                            });

                            for (let i = 0; i < sortedSchedule.length - 1; i++) {
                                const currentPort = sortedSchedule[i].port;
                                const nextPort = sortedSchedule[i + 1].port;
                                
                                if (!currentPort || !nextPort) continue;
                                
                                const duration = calculateDuration(
                                    sortedSchedule[i].etd,
                                    sortedSchedule[i + 1].etd
                                );
                                
                                if (duration) {
                                    routesList.push({
                                        from: currentPort,
                                        to: nextPort,
                                        sea: leg.shipName || 'Unknown',
                                        voyage: leg.voyage || 'Unknown',
                                        duration: parseFloat(duration),
                                        fromETD: sortedSchedule[i].etd,
                                        toETD: sortedSchedule[i + 1].etd,
                                        emission: null,
                                        cost: null
                                    });
                                }
                            }
                        } else {

                            const departureTime = leg.departureTime;
                            const nextDepartureTime = leg.nextDepartureTime || leg.arrivalTime;
                            
                            const duration = calculateDuration(departureTime, nextDepartureTime);
                            
                            if (duration) {
                                routesList.push({
                                    from: fromPort,
                                    to: toPort,
                                    sea: leg.shipName || 'Unknown',
                                    voyage: leg.voyage || 'Unknown',
                                    duration: parseFloat(duration),
                                    fromETD: departureTime,
                                    toETD: nextDepartureTime,
                                    emission: null,
                                    cost: null
                                });
                            }
                        }
                    });
                });
                
                // Step 2: Check which ports need coordinates and fetch them
                console.log(`[Processing] Collected ${portsMap.size} unique ports from routes`);
                
                const portsNeedingCoordinates = [];
                portsMap.forEach((port) => {
                    if ((port.lat === null || port.lng === null) && port.id) {
                        portsNeedingCoordinates.push(port.id);
                    }
                });
                
                if (portsNeedingCoordinates.length > 0) {
                    console.log(`[Processing] Fetching coordinates for ${portsNeedingCoordinates.length} ports`);
                    
                    try {
                        // Splitting into smaller batches if needed to avoid too long URLs
                        const BATCH_SIZE = 10;
                        const portBatches = [];
                        
                        for (let i = 0; i < portsNeedingCoordinates.length; i += BATCH_SIZE) {
                            portBatches.push(portsNeedingCoordinates.slice(i, i + BATCH_SIZE));
                        }
                        
                        console.log(`[Processing] Split port codes into ${portBatches.length} batches for coordinate fetching`);
                        
                        // Process each batch
                        for (const batch of portBatches) {
                            try {
                                console.log(`[Processing] Fetching coordinates for batch: ${batch.join(', ')}`);
                                const portLocations = await fetchPortLocationsByCode(batch);
                                
                                if (!portLocations) {
                                    console.error('[Processing] Port locations response was null or undefined');
                                    continue;
                                }
                                
                                if (!Array.isArray(portLocations)) {
                                    console.error('[Processing] Expected array of port locations but got:', 
                                        typeof portLocations, portLocations);
                                    continue;
                                }
                                
                                console.log(`[Processing] Received ${portLocations.length} port locations from API`);
                                
                                // Update port coordinates in our map
                                portLocations.forEach(portData => {
                                    if (!portData) {
                                        console.warn('[Processing] Null or undefined port data in response');
                                        return;
                                    }
                                    
                                    if (!portData.code) {
                                        console.warn('[Processing] Missing port code in response data:', portData);
                                        return;
                                    }
                                    
                                    if (portsMap.has(portData.code)) {
                                        const port = portsMap.get(portData.code);
                                        
                                        // Check if we have valid coordinates
                                        if (portData.latitude_dd != null && portData.longitude_dd != null) {
                                            const lat = parseFloat(portData.latitude_dd);
                                            const lng = parseFloat(portData.longitude_dd);
                                            
                                            if (!isNaN(lat) && !isNaN(lng)) {
                                                port.lat = lat;
                                                port.lng = lng;
                                                
                                                console.log(`[Processing] ✅ Updated coordinates for ${portData.code}: ${lat}, ${lng}`);
                                            } else {
                                                console.warn(`[Processing] Invalid coordinates for ${portData.code}: ${portData.latitude_dd}, ${portData.longitude_dd}`);
                                            }
                                        } else {
                                            console.warn(`[Processing] Missing coordinates for ${portData.code}`);
                                        }
                                        
                                        // Update name if available
                                        if (portData.name && portData.name !== port.name) {
                                            port.name = portData.name;
                                        }
                                        
                                        portsMap.set(portData.code, port);
                                    } else {
                                        console.warn(`[Processing] Received coordinates for unknown port: ${portData.code}`);
                                    }
                                });
                            } catch (batchError) {
                                console.error(`[Processing] Error fetching port coordinates for batch:`, batchError);
                                // Continue with next batch
                            }
                            }
                        } catch (error) {
                        console.error('[Processing] Error fetching port coordinates in bulk:', error);
                    }
                    
                    // Log a summary of coordinate fetching
                    let portsWithCoords = 0;
                    let portsWithoutCoords = 0;
                    portsMap.forEach(port => {
                        if (port.lat != null && port.lng != null) {
                            portsWithCoords++;
                        } else {
                            portsWithoutCoords++;
                        }
                    });
                    
                    console.log(`[Processing] Coordinate fetching complete. Ports with coordinates: ${portsWithCoords}, without: ${portsWithoutCoords}`);
                } else {
                    console.log('[Processing] All ports already have coordinates, skipping fetch');
                }
                
                // Continue with processing even if we couldn't get all coordinates
                console.log('[Processing] Continuing with route data processing...');
                
                // Step 3: Create distance matrix only once
                const portsArray = Array.from(portsMap.values());
                const portIndices = new Map();
                
                portsArray.forEach((port, index) => {
                    portIndices.set(port.id, index);
                });
                
                // Initialize distance matrix
                const distMatrix = Array(portsArray.length).fill().map(() => Array(portsArray.length).fill(Infinity));
                
                // Set diagonal to zero (distance to self)
                for (let i = 0; i < portsArray.length; i++) {
                    distMatrix[i][i] = 0;
                }
                
                // Fill in direct routes
                routesList.forEach(route => {
                    const fromIdx = portIndices.get(route.from);
                    const toIdx = portIndices.get(route.to);
                    
                    if (fromIdx !== undefined && toIdx !== undefined && route.duration) {
                        distMatrix[fromIdx][toIdx] = route.duration;
                    }
                });
                
                // Find a limited number of indirect paths
                const MAX_INDIRECT_PATHS = 50;
                
                // One-hop connections (port A -> port B -> port C)
                for (let i = 0; i < portsArray.length && indirectPathsProcessed < MAX_INDIRECT_PATHS; i++) {
                    for (let j = 0; j < portsArray.length && indirectPathsProcessed < MAX_INDIRECT_PATHS; j++) {
                        if (i !== j && distMatrix[i][j] === Infinity) {
                            for (let k = 0; k < portsArray.length; k++) {
                                if (k !== i && k !== j && 
                                    distMatrix[i][k] !== Infinity && 
                                    distMatrix[k][j] !== Infinity) {
                                    
                                    indirectPathsProcessed++;
                                    const totalDuration = distMatrix[i][k] + distMatrix[k][j];
                                    distMatrix[i][j] = totalDuration;
                                    
                                    console.log(`[Processing] Found indirect path: ${portsArray[i].id} -> ${portsArray[k].id} -> ${portsArray[j].id} (${totalDuration} hours)`);
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // Step 4: Create the final JSON structure in one go
                const finalData = {
                    ports: portsArray,
                    routes: routesList,
                    portIndices: Object.fromEntries(portIndices),
                    distanceMatrix: distMatrix,
                    metadata: {
                        numLocations: portsArray.length,
                        numVehicles: 1,
                        depot: 0
                    },
                    stats: {
                        portCount: portsArray.length,
                        routeCount: routesList.length,
                        indirectPathsFound: indirectPathsProcessed
                    }
                };
                
                console.log(`[Processing] Completed with ${portsArray.length} ports, ${routesList.length} routes, ${indirectPathsProcessed} indirect paths`);
                
                // Only set state once with the complete data
                setOptimizationData(finalData);
                
                // Notify parent only once
                if (onGraphReady) {
                    onGraphReady(finalData);
                }
            } catch (error) {
                console.error('[Processing] Error creating optimization data:', error);
                setLoading(false);
            }
        };
        
        // Execute once
        processDataAndCreateJson();
        
    }, [routesData, onGraphReady]); // Simplify dependencies to just these two essential ones
    
    // This component doesn't render anything visible
    return (
        <div style={{ display: 'none' }}>
            {loading ? 
                <div>Processing route data...</div> 
                : 
                (optimizationData ? 
                    <div>Data prepared with {optimizationData.ports.length} ports and {optimizationData.routes.length} routes (Attempt: {processingAttempts.current})</div>
                    : 
                    <div>Waiting for route data...</div>
                )
            }
        </div>
    );
};

export default RouteGraphForOptimization; 
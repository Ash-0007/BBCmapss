import axios from 'axios';
const API_BASE_URL = 'http://localhost:3000';
const API_KEY = "93c936a0-a4c7-47bc-a37a-0e6a3712c647";

// Add freight simulation API base URL
const FREIGHT_API_BASE_URL = 'http://localhost:5000/api';

import Graph from '../utils/graph';
// import { calculateAirEmissions, getShippingLineEmissions } from '../backend/controller/emissionsCalc';

export const fetchNearest = async (lat, lng) => {
    try {
        console.log('Fetching nearest locations for:', { lat, lng });
        const response = await fetch(`${API_BASE_URL}/api/nearest?lat=${lat}&lng=${lng}`);
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
        console.log('Received nearest locations:', data);
        return data;
    } catch (error) {
        console.error('Fetch nearest error:', error);
        throw error;
    }
};

export const fetchRoute = async (start, end) => {
    try {
        const response = await fetch(
            `https://graphhopper.com/api/1/route?point=${start.lat},${start.lng}&point=${end.latitude_dd},${end.longitude_dd}&profile=car&key=${API_KEY}`
        );
        if (!response.ok) throw new Error('Route calculation failed');
        return await response.json();
    } catch (error) {
        console.error("Fetch route error:", error);
        throw error;
    }
};

/**
 * Fetches air routes between two airports with enhanced debugging
 * @param {string} originAirport - Origin airport code (e.g., 'DUB')
 * @param {string} destinationAirport - Destination airport code (e.g., 'DEL')
 * @param {string} flightDate - Flight date in YYYY-MM-DD format
 * @returns {Promise<Object>} Air routes data with flight segments
 */
export const fetchAirRoutes = async (originAirport, destinationAirport, flightDate) => {
    try {
        console.log('===============================');
        console.log('STARTING AIR ROUTES API REQUEST');
        console.log('Request parameters:', { 
            origin: originAirport, 
            destination: destinationAirport, 
            date: flightDate 
        });
        

        if (!originAirport || !destinationAirport || !flightDate) {
            throw new Error('Missing required parameters for air routes search');
        }
        

        const sanitizeInput = (input) => {
            if (typeof input !== 'string') return input;

            return input.replace(/[^\x00-\x7F]/g, '');
        };
        
        const sanitizedOrigin = sanitizeInput(originAirport);
        const sanitizedDestination = sanitizeInput(destinationAirport);
        const sanitizedDate = sanitizeInput(flightDate);
        
        console.log('Sanitized parameters:', { 
            origin: sanitizedOrigin, 
            destination: sanitizedDestination, 
            date: sanitizedDate 
        });
        

        const response = await fetch(`${API_BASE_URL}/api/air-cargo?debug=true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Mode': 'true'
            },
            body: JSON.stringify({
                origin: sanitizedOrigin,
                destination: sanitizedDestination,
                flightDate: sanitizedDate,
                debug: true
            }),
        });
        
        console.log('Response status:', response.status, response.statusText);
        console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
        

        let errorData = null;
        if (!response.ok) {
            try {

                errorData = await response.json().catch(() => null);
            } catch (e) {

                try {
                    const textError = await response.text();
                    errorData = { message: textError };
                } catch (textError) {
                    errorData = { message: "Unable to parse error response" };
                }
            }
            
            console.error('API response not OK:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
                headers: Object.fromEntries([...response.headers.entries()])
            });
            

            if (response.status === 500) {
                const errorMessage = errorData?.error || errorData?.message || 'Internal server error';
                throw new Error(`Server error (500): ${errorMessage}. Check server logs for details.`);
            }
            
            if (response.status === 401) {
                throw new Error('Authentication with the cargo API failed. The API token has expired or is invalid.');
            }
            
            throw new Error(`HTTP error ${response.status}: ${errorData?.message || response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API RESPONSE RECEIVED');
        console.log('Routes found:', data?.records?.length || 0);
        console.log('===============================');
        

        if (!data || !data.records) {
            console.warn('Unexpected API response format:', data);
            return { records: [] };
        }
        
        return data;
    } catch (error) {
        console.error('FETCH AIR ROUTES ERROR:', error);
        console.error('Error details:', error.stack);
        console.log('===============================');
        

        if (error.message && (error.message.includes('ByteString') || error.message.includes('character'))) {
            throw new Error('Encoding error: The API cannot process some special characters in the input. Try using ASCII characters only.');
        }
        
        throw error;
    }
};

/**
 * Fetches a graph representation of ship routes between two ports using Hapag-Lloyd API
 * @param {string} startPort - Starting port code (e.g., 'INCOK')
 * @param {string} endPort - Destination port code (e.g., 'NLAMS')
 * @param {string|Date} startDate - Starting date as YYYYMMDD string or Date object
 * @returns {Promise<Object>} Graph of ship routes
 */
export const fetchHapagShipRoutesGraph = async (startPort, endPort, startDate) => {
    try {
        console.log('===== FETCHING HAPAG-LLOYD SHIP ROUTES =====');
        console.log('Request parameters:', { startPort, endPort, startDate });
        
        // Format the date properly based on input type
        let formattedDate = null;
        if (startDate) {
            if (startDate instanceof Date) {
                // Handle Date object
                const year = startDate.getFullYear();
                const month = String(startDate.getMonth() + 1).padStart(2, '0');
                const day = String(startDate.getDate()).padStart(2, '0');
                formattedDate = `${year}-${month}-${day}`;
            } else if (typeof startDate === 'string') {
                // Handle string in YYYYMMDD format
                if (startDate.length === 8 && !startDate.includes('-')) {
                    const year = startDate.substring(0, 4);
                    const month = startDate.substring(4, 6);
                    const day = startDate.substring(6, 8);
                    formattedDate = `${year}-${month}-${day}`;
                } else {
                    // Already in YYYY-MM-DD format or other format
                    formattedDate = startDate;
                }
            }
            console.log('Formatted date:', formattedDate);
        }
        
        const requestBody = {
            startLocation: startPort,
            endLocation: endPort,
            startDate: formattedDate,
            containerType: "45GP"
        };
        
        console.log('API request URL:', `${API_BASE_URL}/api/hapag-routes`);
        console.log('API request body:', JSON.stringify(requestBody, null, 2));
        
        // Use POST request to the proper endpoint
        const response = await fetch(`${API_BASE_URL}/api/hapag-routes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('API response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('API response not OK:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData
            });
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const hapagData = await response.json();
        console.log('Received Hapag-Lloyd routes data with', hapagData.routes?.length || 0, 'routes');
        console.log('First route example (if available):', 
            hapagData.routes?.length > 0 ? JSON.stringify(hapagData.routes[0], null, 2) : 'No routes available');
        
        // Transform the Hapag-Lloyd data into the expected graph format
        const graphData = transformHapagDataToGraph(hapagData, startPort, endPort);
        console.log('Transformed to graph format:', graphData);
        
        return graphData;
    } catch (error) {
        console.error('Fetch Hapag-Lloyd ship routes graph error:', error);
        throw error;
    }
};

/**
 * Transform Hapag-Lloyd API data into the expected graph format
 */
const transformHapagDataToGraph = (hapagData, startPort, endPort) => {
    console.log('Starting transformation of Hapag-Lloyd data to graph format');
    
    // Create a basic structure matching what the frontend expects
    const routeTree = {
        port: startPort,
        portName: getPortNameFromCode(startPort),
        voyages: []
    };
    
    const flatGraph = {};
    flatGraph[startPort] = [];
    
    const completeRoutes = [];
    
    // If there are no routes, return empty structure
    if (!hapagData.routes || hapagData.routes.length === 0) {
        console.log('No routes found in Hapag-Lloyd data');
        return {
            routeTree,
            graph: flatGraph,
            completeRoutes: [],
            stats: {
                portsProcessed: 0,
                maxDepth: 0,
                processingTime: 0,
                uniqueVoyages: 0
            }
        };
    }
    
    // Process each route based on the Hapag-Lloyd API structure
    hapagData.routes.forEach((route, routeIndex) => {
        console.log(`Processing route ${routeIndex + 1} (ID: ${route.routingId || 'unknown'})`);
        
        // Check if route has legs
        if (!route.legs || route.legs.length === 0) {
            console.log(`Route ${routeIndex + 1} has no legs, skipping`);
            return; // Skip this route
        }
        
        try {
            const path = [startPort];
            const voyages = [];
            
            route.legs.forEach((leg, legIndex) => {
                console.log(`Processing leg ${legIndex + 1} of route ${routeIndex + 1}`);
                
                // Determine ports from the departureLocation and arrivalLocation 
                const originPort = leg.departureLocation?.unLocationCode || startPort;
                const destPort = leg.arrivalLocation?.unLocationCode || endPort;
                const originName = leg.departureLocation?.locationName || getPortNameFromCode(originPort);
                const destName = leg.arrivalLocation?.locationName || getPortNameFromCode(destPort);
                
                console.log(`Leg ${legIndex + 1}: ${originPort} -> ${destPort}`);
                
                // Ensure port entries exist in flat graph
                if (!flatGraph[originPort]) {
                    flatGraph[originPort] = [];
                }
                if (!flatGraph[destPort]) {
                    flatGraph[destPort] = [];
                }
                
                // Create voyage object with the actual data structure
                const voyage = {
                    shipId: leg.vesselDetails?.imoNumber || leg.serviceCode || `service-${legIndex}`,
                    shipName: leg.vesselDetails?.name || leg.serviceName || `Service ${legIndex + 1}`,
                    voyage: leg.voyageNumber || leg.scheduleVoyageNumber || `voyage-${legIndex}`,
                    fromPort: originPort,
                    fromPortName: originName,
                    toPort: destPort,
                    toPortName: destName,
                    departureTime: leg.departureDateTime || '',
                    arrivalTime: leg.arrivalDateTime || '',
                    etd: formatDateForDisplay(leg.departureDateTime || ''),
                    eta: formatDateForDisplay(leg.arrivalDateTime || ''),
                    depth: legIndex,
                    path: [...path, destPort],
                    schedule: buildScheduleFromHapagLeg(leg)
                };
                
                // Add to flat graph
                flatGraph[originPort].push(voyage);
                
                // Add to voyages for complete route
                voyages.push(voyage);
                
                // Add destination to path
                path.push(destPort);
                
                // Add to route tree for first leg
                if (legIndex === 0) {
                    // Clone the voyage for route tree
                    const routeTreeVoyage = {...voyage};
                    
                    // Add destination ports for multi-leg routes
                    if (route.legs.length > 1) {
                        routeTreeVoyage.destinationPorts = buildDestinationPortsFromHapagRoute(route, 1);
                    }
                    
                    routeTree.voyages.push(routeTreeVoyage);
                }
            });
            
            // Create complete route
            if (voyages.length > 0) {
                const completeRoute = {
                    id: route.routingId || `route-${routeIndex}`,
                    path,
                    voyages,
                    totalDuration: route.transitTimeInDays || calculateDuration(
                        route.placeOfReceiptDateTime || route.legs[0].departureDateTime || '',
                        route.placeOfDeliveryDateTime || route.legs[route.legs.length - 1].arrivalDateTime || ''
                    ),
                    totalStops: route.legs.length,
                    departureTime: route.placeOfReceiptDateTime || route.legs[0].departureDateTime || '',
                    arrivalTime: route.placeOfDeliveryDateTime || route.legs[route.legs.length - 1].arrivalDateTime || ''
                };
                
                completeRoutes.push(completeRoute);
            }
        } catch (error) {
            console.error(`Error processing route ${routeIndex + 1}:`, error);
        }
    });
    
    console.log(`Transformation complete. Found ${completeRoutes.length} complete routes.`);
    
    return {
        routeTree,
        graph: flatGraph,
        completeRoutes,
        stats: {
            portsProcessed: Object.keys(flatGraph).length,
            maxDepth: completeRoutes.length > 0 ? Math.max(...completeRoutes.map(route => route.totalStops)) : 0,
            processingTime: 0,
            uniqueVoyages: completeRoutes.length
        }
    };
};

/**
 * Build schedule from a Hapag-Lloyd leg
 */
const buildScheduleFromHapagLeg = (leg) => {
    const schedule = [];
    
    try {
        // Add origin stop
        const originPort = leg.departureLocation?.unLocationCode || '';
        const originName = leg.departureLocation?.locationName || '';
        
        schedule.push({
            port: originPort,
            portName: originName || getPortNameFromCode(originPort),
            eta: '',
            etd: formatDateForDisplay(leg.departureDateTime || '')
        });
        
        // Add destination stop
        const destPort = leg.arrivalLocation?.unLocationCode || '';
        const destName = leg.arrivalLocation?.locationName || '';
        
        schedule.push({
            port: destPort,
            portName: destName || getPortNameFromCode(destPort),
            eta: formatDateForDisplay(leg.arrivalDateTime || ''),
            etd: ''
        });
    } catch (error) {
        console.error('Error building schedule:', error);
    }
    
    return schedule;
};

/**
 * Build destination ports for multi-leg routes based on Hapag-Lloyd data
 */
const buildDestinationPortsFromHapagRoute = (route, startLegIndex) => {
    if (startLegIndex >= route.legs.length) return [];
    
    const ports = [];
    
    try {
        const leg = route.legs[startLegIndex];
        
        const destPort = leg.arrivalLocation?.unLocationCode || '';
        const destName = leg.arrivalLocation?.locationName || '';
        
        const port = {
            port: destPort,
            portName: destName || getPortNameFromCode(destPort),
            voyages: []
        };
        
        if (startLegIndex < route.legs.length - 1) {
            const nextLeg = route.legs[startLegIndex + 1];
            
            const nextOriginPort = nextLeg.departureLocation?.unLocationCode || '';
            const nextOriginName = nextLeg.departureLocation?.locationName || '';
            const nextDestPort = nextLeg.arrivalLocation?.unLocationCode || '';
            const nextDestName = nextLeg.arrivalLocation?.locationName || '';
            
            const voyage = {
                shipId: nextLeg.vesselDetails?.imoNumber || nextLeg.serviceCode || `service-${startLegIndex + 1}`,
                shipName: nextLeg.vesselDetails?.name || nextLeg.serviceName || `Service ${startLegIndex + 2}`,
                voyage: nextLeg.voyageNumber || nextLeg.scheduleVoyageNumber || `voyage-${startLegIndex + 1}`,
                fromPort: nextOriginPort,
                fromPortName: nextOriginName || getPortNameFromCode(nextOriginPort),
                toPort: nextDestPort,
                toPortName: nextDestName || getPortNameFromCode(nextDestPort),
                departureTime: nextLeg.departureDateTime || '',
                arrivalTime: nextLeg.arrivalDateTime || '',
                etd: formatDateForDisplay(nextLeg.departureDateTime || ''),
                eta: formatDateForDisplay(nextLeg.arrivalDateTime || ''),
                schedule: buildScheduleFromHapagLeg(nextLeg)
            };
            
            if (startLegIndex + 1 < route.legs.length - 1) {
                voyage.destinationPorts = buildDestinationPortsFromHapagRoute(route, startLegIndex + 2);
            }
            
            port.voyages.push(voyage);
        }
        
        ports.push(port);
    } catch (error) {
        console.error('Error building destination ports:', error);
    }
    
    return ports;
};

/**
 * Calculate duration between two dates in days
 */
const calculateDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

/**
 * Format date for display
 */
const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

/**
 * Get port name from code
 */
const getPortNameFromCode = (code) => {
    const portMap = {
        'INCOK': 'Cochin, India',
        'NLRTM': 'Rotterdam, Netherlands',
        'DEHAM': 'Hamburg, Germany',
        'SGSIN': 'Singapore',
        'CNSHA': 'Shanghai, China',
        'AEJEA': 'Jebel Ali, UAE',
        'USNYC': 'New York, USA',
        'USLAX': 'Los Angeles, USA',
        'JPYOK': 'Yokohama, Japan',
        'GBSOU': 'Southampton, UK',
        'KRPUS': 'Busan, South Korea',
        'INNSA': 'Nhava Sheva, India',
        'MYPKG': 'Port Klang, Malaysia'
    };
    
    return portMap[code] || code;
};

/**
 * Fetches a graph representation of ship routes between two ports
 * @param {string} startPort - Starting port code (e.g., 'INCOK')
 * @param {string} endPort - Destination port code (e.g., 'NLAMS')
 * @param {string} startDate - Optional starting date in YYYYMMDD format
 * @returns {Promise<Object>} Graph of ship routes
 */
export const fetchShipRoutesGraph = async (startPort, endPort, startDate) => {
    try {
        console.log('Fetching ship routes graph:', { startPort, endPort, startDate });
        
        // Use the Hapag-Lloyd API instead of the old ShipmentLink API
        return fetchHapagShipRoutesGraph(startPort, endPort, startDate);
        
        /* Deprecated ShipmentLink API code
        const url = new URL(`${API_BASE_URL}/api/ship-routes-graph`);
        url.searchParams.append('startPort', startPort);
        url.searchParams.append('endPort', endPort);
        
        if (startDate) {
            url.searchParams.append('startDate', startDate);
        }
        
        const response = await fetch(url.toString());
        
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
        console.log('Received ship routes graph:', data);
        
        if (data.graph) {
            Object.entries(data.graph).forEach(([port, voyages]) => {
                voyages.forEach(voyage => {
                    voyage.schedule = voyage.schedule || [];
                    voyage.name = voyage.shipName || voyage.name || voyage.shipId;
                });
            });
        }
        
        return data;
        */
    } catch (error) {
        console.error('Fetch ship routes graph error:', error);
        throw error;
    }
};

/**
 * Fetches all airports and seaports from the database
 * @returns {Promise<Array>} Combined array of all airports and seaports
 */
export const fetchAllPorts = async () => {
    try {
        console.log('Fetching all ports from database');
        
        const response = await fetch(`${API_BASE_URL}/api/all-ports`);
        
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
        console.log(`Received ${data.length} ports from database`);
        
        return data;
    } catch (error) {
        console.error('Fetch all ports error:', error);
        throw error;
    }
};

/**
 * Fetches a sea route between two ports using SeaRoute
 * @param {Object} params - Parameters for sea route
 * @param {string} params.from_port_id - Starting port ID
 * @param {string} params.to_port_id - Destination port ID
 * @returns {Promise<Object>} Sea route data with ports along route
 */
export const fetchSeaRoute = async (params) => {
    try {
        console.log('Fetching sea route:', params);
        
        const response = await fetch(`${FREIGHT_API_BASE_URL}/sea_route`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
            credentials: 'include'
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
        console.log('Received sea route data:', data);
        
        return data;
    } catch (error) {
        console.error('Fetch sea route error:', error);
        throw error;
    }
};

/**
 * Fetches all ports from the freight simulation API
 * @param {string} type - Optional port type filter ('airport' or 'seaport')
 * @returns {Promise<Array>} Array of ports
 */
export const fetchFreightPorts = async (type = null) => {
    try {
        console.log('Fetching freight ports, type:', type);
        
        let url = `${FREIGHT_API_BASE_URL}/ports_list`;
        if (type) {
            url += `?type=${type}`;
        }
        
        const response = await fetch(url, {
            credentials: 'include'
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
        console.log(`Received ${data.ports?.length || 0} freight ports`);
        
        return data.ports || [];
    } catch (error) {
        console.error('Fetch freight ports error:', error);
        throw error;
    }
};

/**
 * Fetch multimodal transport graph connecting start and end locations to nearby ports and airports
 * @param {Object} origin - Origin location with id, name, lat, lng properties
 * @param {Object} destination - Destination location with id, name, lat, lng properties
 * @param {Date} startDate - Optional start date for the route
 * @param {Object} options - Configuration options for the graph
 * @returns {Promise<Object>} Multimodal transport graph with nodes, edges, paths
 */
export async function fetchMultimodalGraph(origin, destination, startDate, options = {}) {
    try {
        console.log('==========================================');
        console.log('[MULTIMODAL] Starting multimodal transport graph generation');
        console.log('[MULTIMODAL] Origin:', origin);
        console.log('[MULTIMODAL] Destination:', destination);
        console.log('[MULTIMODAL] Start date:', startDate);
        
        // Validate input
        if (!origin || !origin.id || !origin.lat || !origin.lng) {
            console.error('[MULTIMODAL] Invalid origin:', origin);
            throw new Error('Origin must include id, lat, and lng properties');
        }
        
        if (!destination || !destination.id || !destination.lat || !destination.lng) {
            console.error('[MULTIMODAL] Invalid destination:', destination);
            throw new Error('Destination must include id, lat, and lng properties');
        }
        
        const defaultOptions = {
            includeAirRoutes: true,
            includeSeaRoutes: true,
            includeRoadRoutes: true,
            maxTransfers: 3,
            radius: 150, // km
            maxPorts: 3,
            maxAirports: 3,
            findAlternativeModes: true // For intermodal transfers at layover points
        };
        
        const config = { ...defaultOptions, ...options };
        console.log('[MULTIMODAL] Configuration:', config);
        
        // Initialize graph structure
        const graph = {
            nodes: {},
            edges: [],
            paths: [],
            metadata: {
                originId: origin.id,
                originName: origin.name || origin.id,
                destinationId: destination.id,
                destinationName: destination.name || destination.id,
                startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate,
                generatedAt: new Date().toISOString()
            }
        };
        
        // Format date for API calls
        const formattedDate = startDate instanceof Date 
            ? startDate.toISOString().split('T')[0]
            : (typeof startDate === 'string' ? startDate : new Date().toISOString().split('T')[0]);
            
        console.log('[MULTIMODAL] Using formatted start date:', formattedDate);
        
        // Step 1: Add origin and destination to graph
        console.log('[MULTIMODAL] Step 1: Adding origin and destination to graph');
        
        graph.nodes[origin.id] = {
            id: origin.id,
            name: origin.name || origin.id,
            type: origin.type || 'location',
            lat: parseFloat(origin.lat),
            lng: parseFloat(origin.lng)
        };
        
        graph.nodes[destination.id] = {
            id: destination.id,
            name: destination.name || destination.id,
            type: destination.type || 'location',
            lat: parseFloat(destination.lat),
            lng: parseFloat(destination.lng)
        };
        
        // Step 2: Find nearest ports and airports to both origin and destination
        console.log('[MULTIMODAL] Step 2: Finding nearest transportation hubs');
        
        console.log('[MULTIMODAL] Fetching nearest hubs for origin:', { lat: origin.lat, lng: origin.lng });
        console.log('[MULTIMODAL] Fetching nearest hubs for destination:', { lat: destination.lat, lng: destination.lng });
        
        let [originNearestHubs, destNearestHubs] = await Promise.all([
            fetchNearest(origin.lat, origin.lng),
            fetchNearest(destination.lat, destination.lng)
        ]);
        
        // Log what we found for debugging
        const originAirportsCount = originNearestHubs?.airports?.length || 0;
        const originSeaportsCount = originNearestHubs?.seaports?.length || 0;
        const destAirportsCount = destNearestHubs?.airports?.length || 0;
        const destSeaportsCount = destNearestHubs?.seaports?.length || 0;
        
        console.log('[MULTIMODAL] Found nearest hubs:');
        console.log(`[MULTIMODAL] - Origin: ${originAirportsCount} airports, ${originSeaportsCount} seaports`);
        console.log(`[MULTIMODAL] - Destination: ${destAirportsCount} airports, ${destSeaportsCount} seaports`);
        
        // Filter hubs by radius and limit to configured maximum
        const originSeaports = (originNearestHubs?.seaports || [])
            .filter(port => calculateDistance(origin.lat, origin.lng, port.latitude_dd, port.longitude_dd) <= config.radius)
            .slice(0, config.maxPorts);
            
        const destSeaports = (destNearestHubs?.seaports || [])
            .filter(port => calculateDistance(destination.lat, destination.lng, port.latitude_dd, port.longitude_dd) <= config.radius)
            .slice(0, config.maxPorts);
            
        const originAirports = (originNearestHubs?.airports || [])
            .filter(airport => calculateDistance(origin.lat, origin.lng, airport.latitude_dd, airport.longitude_dd) <= config.radius)
            .slice(0, config.maxAirports);
            
        const destAirports = (destNearestHubs?.airports || [])
            .filter(airport => calculateDistance(destination.lat, destination.lng, airport.latitude_dd, airport.longitude_dd) <= config.radius)
            .slice(0, config.maxAirports);
        
        // Step 3: Add seaports to the graph and connect them with road routes to origin/destination
        console.log('[MULTIMODAL] Step 3: Adding seaports and road connections');
        console.log(`[MULTIMODAL] Processing ${originSeaports.length} origin seaports and ${destSeaports.length} destination seaports`);
        
        // Add origin seaports to graph
        originSeaports.forEach(port => {
            const portId = port.code;
            
            // Add port to nodes if not already present
            if (!graph.nodes[portId]) {
                graph.nodes[portId] = {
                    id: portId,
                    name: port.name || port.main_port_name || portId,
                    type: 'seaport',
                    lat: parseFloat(port.latitude_dd),
                    lng: parseFloat(port.longitude_dd)
                };
                
                console.log(`[MULTIMODAL] Added origin seaport node: ${portId} (${graph.nodes[portId].name})`);
            }
            
            // Only add road connection if we're including road routes
            if (config.includeRoadRoutes) {
                // Add road connection from origin to nearby seaport
                const roadDistance = calculateDistance(origin.lat, origin.lng, port.latitude_dd, port.longitude_dd);
                const roadDuration = roadDistance / 60; // Average speed 60 km/h
                
                // Add road edge
                graph.edges.push({
                    source: origin.id,
                    target: portId,
                    mode: 'road',
                    distance: roadDistance,
                    duration: roadDuration,
                    cost: roadDistance * 0.5, // $0.5 per km for road
                    emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                    departureTime: formattedDate,
                    arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString().split('T')[0]
                });
                
                console.log(`[MULTIMODAL] Added road edge: ${origin.id} → ${portId} (${roadDistance.toFixed(2)} km)`);
            }
        });
        
        // Add destination seaports to graph
        destSeaports.forEach(port => {
            const portId = port.code;
            
            // Add port to nodes if not already present
            if (!graph.nodes[portId]) {
                graph.nodes[portId] = {
                    id: portId,
                    name: port.name || port.main_port_name || portId,
                    type: 'seaport',
                    lat: parseFloat(port.latitude_dd),
                    lng: parseFloat(port.longitude_dd)
                };
                
                console.log(`[MULTIMODAL] Added destination seaport node: ${portId} (${graph.nodes[portId].name})`);
            }
            
            // Only add road connection if we're including road routes
            if (config.includeRoadRoutes) {
                // Add road connection from nearby seaport to destination
                const roadDistance = calculateDistance(destination.lat, destination.lng, port.latitude_dd, port.longitude_dd);
                const roadDuration = roadDistance / 60; // Average speed 60 km/h
                
                // Add road edge
                graph.edges.push({
                    source: portId,
                    target: destination.id,
                    mode: 'road',
                    distance: roadDistance,
                    duration: roadDuration,
                    cost: roadDistance * 0.5, // $0.5 per km for road
                    emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                    departureTime: formattedDate,
                    arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString().split('T')[0]
                });
                
                console.log(`[MULTIMODAL] Added road edge: ${portId} → ${destination.id} (${roadDistance.toFixed(2)} km)`);
            }
        });
        
        // Step 4: Add airports to the graph if air routes are included
        if (config.includeAirRoutes) {
            console.log('[MULTIMODAL] Step 4: Adding airports and road connections');
            console.log(`[MULTIMODAL] Processing ${originAirports.length} origin airports and ${destAirports.length} destination airports`);
            
            // Add origin airports to graph
            originAirports.forEach(airport => {
                const airportId = airport.code;
                
                // Add airport to nodes if not already present
                if (!graph.nodes[airportId]) {
                    graph.nodes[airportId] = {
                        id: airportId,
                        name: airport.name || airport.airport_name || airportId,
                        type: 'airport',
                        lat: parseFloat(airport.latitude_dd),
                        lng: parseFloat(airport.longitude_dd)
                    };
                    
                    console.log(`[MULTIMODAL] Added origin airport node: ${airportId} (${graph.nodes[airportId].name})`);
                }
                
                // Only add road connection if we're including road routes
                if (config.includeRoadRoutes) {
                    // Add road connection from origin to nearby airport
                    const roadDistance = calculateDistance(origin.lat, origin.lng, airport.latitude_dd, airport.longitude_dd);
                    const roadDuration = roadDistance / 60; // Average speed 60 km/h
                    
                    // Add road edge
                    graph.edges.push({
                        source: origin.id,
                        target: airportId,
                        mode: 'road',
                        distance: roadDistance,
                        duration: roadDuration,
                        cost: roadDistance * 0.5, // $0.5 per km for road
                        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                        departureTime: formattedDate,
                        arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString().split('T')[0]
                    });
                    
                    console.log(`[MULTIMODAL] Added road edge: ${origin.id} → ${airportId} (${roadDistance.toFixed(2)} km)`);
                }
            });
            
            // Add destination airports to graph
            destAirports.forEach(airport => {
                const airportId = airport.code;
                
                // Add airport to nodes if not already present
                if (!graph.nodes[airportId]) {
                    graph.nodes[airportId] = {
                        id: airportId,
                        name: airport.name || airport.airport_name || airportId,
                        type: 'airport',
                        lat: parseFloat(airport.latitude_dd),
                        lng: parseFloat(airport.longitude_dd)
                    };
                    
                    console.log(`[MULTIMODAL] Added destination airport node: ${airportId} (${graph.nodes[airportId].name})`);
                }
                
                // Only add road connection if we're including road routes
                if (config.includeRoadRoutes) {
                    // Add road connection from nearby airport to destination
                    const roadDistance = calculateDistance(destination.lat, destination.lng, airport.latitude_dd, airport.longitude_dd);
                    const roadDuration = roadDistance / 60; // Average speed 60 km/h
                    
                    // Add road edge
                    graph.edges.push({
                        source: airportId,
                        target: destination.id,
                        mode: 'road',
                        distance: roadDistance,
                        duration: roadDuration,
                        cost: roadDistance * 0.5, // $0.5 per km for road
                        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                        departureTime: formattedDate,
                        arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString().split('T')[0]
                    });
                    
                    console.log(`[MULTIMODAL] Added road edge: ${airportId} → ${destination.id} (${roadDistance.toFixed(2)} km)`);
                }
            });
        }
        
        // Step 5: Add air connections between airports
        if (config.includeAirRoutes) {
            console.log('[MULTIMODAL] Step 5: Adding air connections between airports');
            
            // Create array of origin-destination airport pairs
            const airportPairs = [];
            for (const originAirport of originAirports) {
                for (const destAirport of destAirports) {
                    // Skip if it's the same airport
                    if (originAirport.code === destAirport.code) continue;
                    
                    airportPairs.push({
                        origin: originAirport,
                        destination: destAirport
                    });
                }
            }
            
            console.log(`[MULTIMODAL] Processing ${airportPairs.length} airport pairs for air routes`);
            
            // Process each airport pair for air connections
            for (const pair of airportPairs) {
                const { origin, destination } = pair;
                
                try {
                    console.log(`[MULTIMODAL] Fetching air routes from ${origin.code} to ${destination.code} for date ${formattedDate}`);
                    
                    // Try to get actual flight routes - important per your requirements: NO MOCK DATA
                    let airRoutes = null;
                    try {
                        // We'll use fetchAirRoutes which should be defined elsewhere in your api.js
                        airRoutes = await fetchAirRoutes(origin.code, destination.code, formattedDate);
                        console.log(`[MULTIMODAL] Retrieved ${airRoutes?.records?.length || 0} air routes`);
                    } catch (airError) {
                        console.error(`[MULTIMODAL] Error fetching air routes: ${airError.message}`);
                        continue; // Skip to the next pair per your requirements
                    }
                    
                    // Skip if no routes found per your requirements
                    if (!airRoutes || !airRoutes.records || airRoutes.records.length === 0) {
                        console.log(`[MULTIMODAL] No air routes found for ${origin.code} → ${destination.code}`);
                        continue;
                    }
                    
                    // Process each flight
                    for (const flight of airRoutes.records) {
                        // Extract flight details
                        const flightNumber = flight.flightNumber || 'Unknown';
                        const airline = flight.airline || flight.carrier || 'Unknown Airline';
                        const departureTime = flight.departureTime || formattedDate;
                        
                        // Calculate arrival based on departure and duration
                        const duration = flight.duration || 
                            (flight.arrivalTime && flight.departureTime ? 
                                (new Date(flight.arrivalTime) - new Date(flight.departureTime)) / (60 * 60 * 1000) : 
                                null);
                                
                        // If we don't have duration, estimate based on distance
                        const airDistance = calculateDistance(
                            origin.latitude_dd, origin.longitude_dd,
                            destination.latitude_dd, destination.longitude_dd
                        );
                        
                        const estimatedDuration = duration || (airDistance / 800) + 2; // ~800 km/h plus 2h for procedures
                        
                        const arrivalTime = flight.arrivalTime || 
                            new Date(new Date(departureTime).getTime() + estimatedDuration * 60 * 60 * 1000).toISOString();
                        
                        // Calculate costs and emissions
                        const airCost = flight.cost || airDistance * 1.8; // ~$1.80 per km if not provided
                        const airEmissions = 
                        
                        // Add air route to graph
                        graph.edges.push({
                            source: origin.code,
                            target: destination.code,
                            mode: 'air',
                            provider: airline,
                            service: flightNumber,
                            distance: airDistance,
                            duration: estimatedDuration,
                            cost: airCost,
                            emissions: airEmissions,
                            departureTime: departureTime,
                            arrivalTime: arrivalTime,
                            segments: flight.segments || [] // Store any detailed segments if available
                        });
                        
                        console.log(`[MULTIMODAL] Added air edge: ${origin.code} → ${destination.code} (Flight ${flightNumber})`);
                    }
                } catch (error) {
                    console.error(`[MULTIMODAL] Error processing air connection from ${origin.code} to ${destination.code}:`, error);
                    // Continue to next pair instead of failing the whole process
                }
            }
        }
        
        // Step 6: Add sea connections between seaports
        if (config.includeSeaRoutes) {
            console.log('[MULTIMODAL] Step 6: Adding sea connections between seaports');
            
            // Create array of origin-destination seaport pairs
            const seaportPairs = [];
            for (const originPort of originSeaports) {
                for (const destPort of destSeaports) {
                    // Skip if it's the same port
                    if (originPort.code === destPort.code) continue;
                    
                    seaportPairs.push({
                        origin: originPort,
                        destination: destPort
                    });
                }
            }
            
            console.log(`[MULTIMODAL] Processing ${seaportPairs.length} seaport pairs for sea routes`);
            
            // Process each seaport pair for sea connections
            for (const pair of seaportPairs) {
                const { origin, destination } = pair;
                
                try {
                    console.log(`[MULTIMODAL] Fetching shipping routes from ${origin.code} to ${destination.code} for date ${formattedDate}`);
                    
                    // Try to get actual shipping routes - NO MOCK DATA as per your requirements
                    try {
                        const shipRoutes = await fetchShipRoutesGraph(
                            origin.code, 
                            destination.code, 
                            formattedDate.replace(/-/g, '')
                        );
                        
                        console.log(`[MULTIMODAL] Retrieved shipping routes:`, shipRoutes);
                        
                        if (shipRoutes && shipRoutes.completeRoutes && shipRoutes.completeRoutes.length > 0) {
                            console.log(`[MULTIMODAL] Found ${shipRoutes.completeRoutes.length} shipping routes`);
                            
                            // Process all available routes
                            for (const route of shipRoutes.completeRoutes) {
                                // Convert duration from days to hours
                                const seaDuration = route.totalDuration * 24 || 0;
                                
                                // Calculate sea distance (approximate)
                                const seaDistance = calculateDistance(
                                    origin.latitude_dd, origin.longitude_dd,
                                    destination.latitude_dd, destination.longitude_dd
                                ) * 1.3; // Add 30% for non-direct routes
                                
                                // Sea shipping costs
                                const seaCost = route.totalCost || seaDistance * 0.25;
                                
                                // Calculate sea emissions using the emissions calculator API
                                let seaEmissions = null;
                                try {
                                    // Make API call to calculate emissions
                                    const emissionsResponse = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            fromPort: origin.code,
                                            toPort: destination.code,
                                            shippingLine: 'HLCU'
                                        })
                                    });
                                    
                                    if (emissionsResponse.ok) {
                                        const emissionsData = await emissionsResponse.json();
                                        if (emissionsData.success) {
                                            seaEmissions = emissionsData.amount;
                                            console.log(`[MULTIMODAL] Retrieved sea emissions for ${origin.code} → ${destination.code}: ${seaEmissions} metric tons`);
                                        }
                                    }
                                } catch (emissionsError) {
                                    console.error(`[MULTIMODAL] Failed to calculate sea emissions: ${emissionsError.message}`);
                                }
                                
                                
                                // Get detailed voyage information for logging
                                const provider = route.voyages && route.voyages[0] ? 
                                    route.voyages[0].shipName : 'Shipping Line';
                                const service = route.voyages && route.voyages[0] ? 
                                    route.voyages[0].voyage : 'Regular Service';
                                
                                // Add the shipping route to the graph
                                graph.edges.push({
                                    source: origin.code,
                                    target: destination.code,
                                    mode: 'sea',
                                    provider: provider,
                                    service: service,
                                    distance: seaDistance,
                                    duration: seaDuration,
                                    cost: seaCost,
                                    emissions: seaEmissions,
                                    departureTime: route.departureTime || formattedDate,
                                    arrivalTime: route.arrivalTime || new Date(new Date(formattedDate).getTime() + seaDuration * 60 * 60 * 1000).toISOString(),
                                    intermediateStops: route.voyages || [], // Store detailed voyage info for layover analysis
                                    schedule: route.schedule || []
                                });
                                
                                console.log(`[MULTIMODAL] Added sea edge: ${origin.code} → ${destination.code} (${provider}/${service})`);
                            }
                        } else {
                            console.log(`[MULTIMODAL] No shipping routes found for ${origin.code} → ${destination.code}`);
                            // Per your requirements, we skip if no journey is found
                            continue;
                        }
                    } catch (shipError) {
                        console.error(`[MULTIMODAL] Error fetching shipping routes: ${shipError.message}`);
                        // Per your requirements, we skip if there's an error
                        continue;
                    }
                } catch (error) {
                    console.error(`[MULTIMODAL] Error processing sea connection from ${origin.code} to ${destination.code}:`, error);
                    // Continue to next pair instead of failing the whole process
                }
            }
        }
        
        // Step 7: Process layover points to add intermodal transfers
        if (config.findAlternativeModes) {
            console.log('[MULTIMODAL] Step 7: Processing layover points for intermodal transfers');
            
            // Collect all edges with intermediate stops
            const edgesWithLayovers = graph.edges.filter(edge => 
                (edge.intermediateStops && edge.intermediateStops.length) || 
                (edge.segments && edge.segments.length) ||
                (edge.schedule && edge.schedule.length)
            );
            
            console.log(`[MULTIMODAL] Found ${edgesWithLayovers.length} edges with potential layover points`);
            
            // Process each edge with layovers
            for (const edge of edgesWithLayovers) {
                const edgeMode = edge.mode;
                console.log(`[MULTIMODAL] Processing ${edgeMode} edge from ${edge.source} to ${edge.target} for layovers`);
                
                // Get layover information based on edge type
                let layovers = [];
                
                if (edgeMode === 'sea' && edge.intermediateStops) {
                    // Extract layover info from sea routes
                    layovers = edge.intermediateStops.flatMap(voyage => 
                        voyage.ports?.filter(port => 
                            port.code !== edge.source && port.code !== edge.target
                        ) || []
                    );
                } else if (edgeMode === 'air' && edge.segments) {
                    // Extract layover info from air segments
                    layovers = edge.segments.filter(segment => 
                        segment.arrivalAirport !== edge.source && 
                        segment.arrivalAirport !== edge.target &&
                        segment.departureAirport !== edge.target // Exclude final departure
                    ).map(segment => ({
                        code: segment.arrivalAirport,
                        arrival: segment.arrivalTime,
                        departure: null // Will be filled from the next segment
                    }));
                    
                    // Fill departure times by looking at the next segment
                    for (let i = 0; i < layovers.length; i++) {
                        if (i + 1 < edge.segments.length) {
                            layovers[i].departure = edge.segments[i + 1].departureTime;
                        }
                    }
                } else if (edge.schedule) {
                    // Extract layover info from schedule
                    layovers = edge.schedule.filter(stop => 
                        stop.port !== edge.source && stop.port !== edge.target
                    ).map(stop => ({
                        code: stop.port,
                        arrival: stop.eta,
                        departure: stop.etd
                    }));
                }
                
                console.log(`[MULTIMODAL] Found ${layovers.length} layover points for this edge`);
                
                // Process each layover
                for (const layover of layovers) {
                    const layoverCode = layover.code;
                    console.log(`[MULTIMODAL] Processing layover at ${layoverCode}`);
                    
                    // Skip if we don't have coordinates for this layover
                    if (!layover.latitude_dd || !layover.longitude_dd) {
                        console.log(`[MULTIMODAL] No coordinates available for layover ${layoverCode}, attempting to fetch them`);
                        
                        try {
                            // Attempt to get port coordinates if not already available
                            const portLocations = await fetchPortLocationsByCode([layoverCode]);
                            
                            if (portLocations && portLocations.length > 0) {
                                layover.latitude_dd = portLocations[0].latitude_dd;
                                layover.longitude_dd = portLocations[0].longitude_dd;
                                layover.name = portLocations[0].name || layoverCode;
                                
                                console.log(`[MULTIMODAL] Retrieved coordinates for ${layoverCode}: (${layover.latitude_dd}, ${layover.longitude_dd})`);
                            } else {
                                console.log(`[MULTIMODAL] Could not find coordinates for layover ${layoverCode}, skipping`);
                                continue;
                            }
                        } catch (error) {
                            console.error(`[MULTIMODAL] Error fetching coordinates for layover ${layoverCode}:`, error);
                            continue;
                        }
                    }
                    
                    // Add the layover point to the graph if it doesn't exist
                    if (!graph.nodes[layoverCode]) {
                        graph.nodes[layoverCode] = {
                            id: layoverCode,
                            name: layover.name || layover.port_name || layoverCode,
                            type: edgeMode === 'sea' ? 'seaport' : 'airport',
                            lat: parseFloat(layover.latitude_dd),
                            lng: parseFloat(layover.longitude_dd)
                        };
                        
                        console.log(`[MULTIMODAL] Added layover node: ${layoverCode} (${graph.nodes[layoverCode].name})`);
                    }
                    
                    // Find nearest ports/airports of the OTHER transport mode for this layover
                    const alternativeMode = edgeMode === 'sea' ? 'airport' : 'seaport';
                    console.log(`[MULTIMODAL] Finding nearest ${alternativeMode}s to layover ${layoverCode}`);
                    
                    try {
                        // Get nearest locations to the layover point
                        const nearestToLayover = await fetchNearest(layover.latitude_dd, layover.longitude_dd);
                        
                        // Select the appropriate type of transport hubs
                        const alternativeHubs = edgeMode === 'sea' ? 
                            (nearestToLayover?.airports || []).slice(0, config.maxAirports) : 
                            (nearestToLayover?.seaports || []).slice(0, config.maxPorts);
                        
                        console.log(`[MULTIMODAL] Found ${alternativeHubs.length} ${alternativeMode}s near layover ${layoverCode}`);
                        
                        // Process each alternative hub
                        for (const hub of alternativeHubs) {
                            const hubId = hub.code;
                            
                            // Add the hub to the graph if it doesn't exist
                            if (!graph.nodes[hubId]) {
                                graph.nodes[hubId] = {
                                    id: hubId,
                                    name: hub.name || (edgeMode === 'sea' ? hub.airport_name : hub.main_port_name) || hubId,
                                    type: alternativeMode,
                                    lat: parseFloat(hub.latitude_dd),
                                    lng: parseFloat(hub.longitude_dd)
                                };
                                
                                console.log(`[MULTIMODAL] Added alternative hub node: ${hubId} (${graph.nodes[hubId].name})`);
                            }
                            
                            // Add road connection between layover and hub
                            if (config.includeRoadRoutes) {
                                const roadDistance = calculateDistance(
                                    layover.latitude_dd, layover.longitude_dd,
                                    hub.latitude_dd, hub.longitude_dd
                                );
                                
                                const roadDuration = roadDistance / 60; // Average speed 60 km/h
                                
                                // Use the layover arrival time for departure of this connection
                                const layoverArrivalTime = layover.arrival || edge.arrivalTime || formattedDate;
                                
                                // Add road edge
                                graph.edges.push({
                                    source: layoverCode,
                                    target: hubId,
                                    mode: 'road',
                                    distance: roadDistance,
                                    duration: roadDuration,
                                    cost: roadDistance * 0.5, // $0.5 per km for road
                                    emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                                    departureTime: layoverArrivalTime,
                                    arrivalTime: new Date(new Date(layoverArrivalTime).getTime() + roadDuration * 60 * 60 * 1000).toISOString()
                                });
                                
                                console.log(`[MULTIMODAL] Added road edge: ${layoverCode} → ${hubId} (${roadDistance.toFixed(2)} km)`);
                                
                                // Also add the reverse connection
                                graph.edges.push({
                                    source: hubId,
                                    target: layoverCode,
                                    mode: 'road',
                                    distance: roadDistance,
                                    duration: roadDuration,
                                    cost: roadDistance * 0.5, // $0.5 per km for road
                                    emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                                    departureTime: layoverArrivalTime,
                                    arrivalTime: new Date(new Date(layoverArrivalTime).getTime() + roadDuration * 60 * 60 * 1000).toISOString()
                                });
                                
                                console.log(`[MULTIMODAL] Added road edge: ${hubId} → ${layoverCode} (${roadDistance.toFixed(2)} km)`);
                            }
                            
                            // Now find connections from this hub to the destination
                            if (alternativeMode === 'airport' && config.includeAirRoutes) {
                                // For each destination airport
                                for (const destAirport of destAirports) {
                                    if (hubId === destAirport.code) continue; // Skip same airport
                                    
                                    try {
                                        // Use the layover's arrival time (plus some buffer) as the new departure time
                                        const layoverArrivalTime = layover.arrival || edge.arrivalTime || formattedDate;
                                        const newDepartureDate = new Date(new Date(layoverArrivalTime).getTime() + 3 * 60 * 60 * 1000); // 3 hour buffer
                                        const newDepartureDateFormatted = newDepartureDate.toISOString().split('T')[0];
                                        
                                        console.log(`[MULTIMODAL] Checking for air routes from layover hub ${hubId} to destination ${destAirport.code} on ${newDepartureDateFormatted}`);
                                        
                                        // Try to find flights from this hub to the destination
                                        try {
                                            const airRoutes = await fetchAirRoutes(hubId, destAirport.code, newDepartureDateFormatted);
                                            
                                            // Add found flights to the graph
                                            if (airRoutes && airRoutes.records && airRoutes.records.length > 0) {
                                                console.log(`[MULTIMODAL] Found ${airRoutes.records.length} flights from layover hub ${hubId} to destination ${destAirport.code}`);
                                                
                                                // Add each flight as an edge
                                                for (const flight of airRoutes.records) {
                                                    const flightNumber = flight.flightNumber || 'Unknown';
                                                    const airline = flight.airline || flight.carrier || 'Unknown Airline';
                                                    const departureTime = flight.departureTime || newDepartureDateFormatted;
                                                    
                                                    const airDistance = calculateDistance(
                                                        hub.latitude_dd, hub.longitude_dd,
                                                        destAirport.latitude_dd, destAirport.longitude_dd
                                                    );
                                                    
                                                    const estimatedDuration = flight.duration || (airDistance / 800) + 2;
                                                    const arrivalTime = flight.arrivalTime || 
                                                        new Date(new Date(departureTime).getTime() + estimatedDuration * 60 * 60 * 1000).toISOString();
                                                    
                                                    // Add air route to graph
                                                    graph.edges.push({
                                                        source: hubId,
                                                        target: destAirport.code,
                                                        mode: 'air',
                                                        provider: airline,
                                                        service: flightNumber,
                                                        distance: airDistance,
                                                        duration: estimatedDuration,
                                                        cost: flight.cost || airDistance * 1.8,
                                                        emissions: flight.emissions || airDistance * 0.25,
                                                        departureTime: departureTime,
                                                        arrivalTime: arrivalTime,
                                                        segments: flight.segments || [],
                                                        isAlternativeMode: true
                                                    });
                                                    
                                                    console.log(`[MULTIMODAL] Added alternative air edge: ${hubId} → ${destAirport.code} (Flight ${flightNumber})`);
                                                }
                                            } else {
                                                console.log(`[MULTIMODAL] No flights found from layover hub ${hubId} to destination ${destAirport.code}`);
                                            }
                                        } catch (airError) {
                                            console.error(`[MULTIMODAL] Error fetching air routes from layover hub: ${airError.message}`);
                                        }
                                    } catch (error) {
                                        console.error(`[MULTIMODAL] Error processing alternative air connection from ${hubId} to ${destAirport.code}:`, error);
                                    }
                                }
                            } else if (alternativeMode === 'seaport' && config.includeSeaRoutes) {
                                // For each destination seaport
                                for (const destPort of destSeaports) {
                                    if (hubId === destPort.code) continue; // Skip same port
                                    
                                    try {
                                        // Use the layover's arrival time (plus buffer) as the new departure time
                                        const layoverArrivalTime = layover.arrival || edge.arrivalTime || formattedDate;
                                        const newDepartureDate = new Date(new Date(layoverArrivalTime).getTime() + 24 * 60 * 60 * 1000); // 24 hour buffer
                                        const newDepartureDateFormatted = newDepartureDate.toISOString().split('T')[0].replace(/-/g, '');
                                        
                                        console.log(`[MULTIMODAL] Checking for sea routes from layover hub ${hubId} to destination ${destPort.code} on ${newDepartureDateFormatted}`);
                                        
                                        // Try to find shipping routes from this hub to the destination
                                        try {
                                            const shipRoutes = await fetchShipRoutesGraph(hubId, destPort.code, newDepartureDateFormatted);
                                            
                                            // Add found routes to the graph
                                            if (shipRoutes && shipRoutes.completeRoutes && shipRoutes.completeRoutes.length > 0) {
                                                console.log(`[MULTIMODAL] Found ${shipRoutes.completeRoutes.length} shipping routes from layover hub ${hubId} to destination ${destPort.code}`);
                                                
                                                // Add each route as an edge
                                                for (const route of shipRoutes.completeRoutes) {
                                                    const seaDuration = route.totalDuration * 24 || 0;
                                                    
                                                    const seaDistance = calculateDistance(
                                                        hub.latitude_dd, hub.longitude_dd,
                                                        destPort.latitude_dd, destPort.longitude_dd
                                                    ) * 1.3;
                                                    
                                                    const provider = route.voyages && route.voyages[0] ? 
                                                        route.voyages[0].shipName : 'Shipping Line';
                                                    const service = route.voyages && route.voyages[0] ? 
                                                        route.voyages[0].voyage : 'Regular Service';
                                                    
                                                    // Add shipping route to graph
                                                    graph.edges.push({
                                                        source: hubId,
                                                        target: destPort.code,
                                                        mode: 'sea',
                                                        provider: provider,
                                                        service: service,
                                                        distance: seaDistance,
                                                        duration: seaDuration,
                                                        cost: route.totalCost || seaDistance * 0.25,
                                                        emissions: route.totalEmissions || seaDistance * 0.015 * 25,
                                                        departureTime: route.departureTime || new Date(newDepartureDate).toISOString(),
                                                        arrivalTime: route.arrivalTime || new Date(new Date(newDepartureDate).getTime() + seaDuration * 60 * 60 * 1000).toISOString(),
                                                        intermediateStops: route.voyages || [],
                                                        schedule: route.schedule || [],
                                                        isAlternativeMode: true
                                                    });
                                                    
                                                    console.log(`[MULTIMODAL] Added alternative sea edge: ${hubId} → ${destPort.code} (${provider}/${service})`);
                                                }
                                            } else {
                                                console.log(`[MULTIMODAL] No shipping routes found from layover hub ${hubId} to destination ${destPort.code}`);
                                            }
                                        } catch (shipError) {
                                            console.error(`[MULTIMODAL] Error fetching shipping routes from layover hub: ${shipError.message}`);
                                        }
                                    } catch (error) {
                                        console.error(`[MULTIMODAL] Error processing alternative sea connection from ${hubId} to ${destPort.code}:`, error);
                                    }
                                }
                            }
                        }
                    } catch (nearestError) {
                        console.error(`[MULTIMODAL] Error fetching nearest locations to layover ${layoverCode}:`, nearestError);
                    }
                }
            }
        }
        
        // Step 8: Add road connections between EVERY existing node
        if (config.includeRoadRoutes) {
            console.log('[MULTIMODAL] Step 8: Adding road connections between all nodes');
            
            // Get all nodes except origin and destination (already connected)
            const nodeIds = Object.keys(graph.nodes).filter(id => 
                id !== origin.id && id !== destination.id
            );
            
            console.log(`[MULTIMODAL] Found ${nodeIds.length} nodes to connect with road routes`);
            
            // Create a set to track connections we've already made
            const existingConnections = new Set();
            
            // Add existing connections to the set
            graph.edges.forEach(edge => {
                if (edge.mode === 'road') {
                    existingConnections.add(`${edge.source}-${edge.target}`);
                }
            });
            
            console.log(`[MULTIMODAL] Already have ${existingConnections.size} existing road connections`);
            
            // Process all pairs of nodes
            let newConnectionsCount = 0;
            
            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const nodeA = nodeIds[i];
                    const nodeB = nodeIds[j];
                    
                    // Skip if connection already exists
                    if (existingConnections.has(`${nodeA}-${nodeB}`) || existingConnections.has(`${nodeB}-${nodeA}`)) {
                        continue;
                    }
                    
                    // Get node objects
                    const nodeObjA = graph.nodes[nodeA];
                    const nodeObjB = graph.nodes[nodeB];
                    
                    // Calculate distance between nodes
                    const roadDistance = calculateDistance(
                        nodeObjA.lat, nodeObjA.lng,
                        nodeObjB.lat, nodeObjB.lng
                    );
                    
                    // Skip if distance is too large
                    if (roadDistance > config.radius) {
                        continue;
                    }
                    
                    // Calculate road duration
                    const roadDuration = roadDistance / 60; // Average speed 60 km/h
                    
                    // Add road connections in both directions
                    graph.edges.push({
                        source: nodeA,
                        target: nodeB,
                        mode: 'road',
                        distance: roadDistance,
                        duration: roadDuration,
                        cost: roadDistance * 0.5, // $0.5 per km for road
                        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                        departureTime: formattedDate,
                        arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString()
                    });
                    
                    graph.edges.push({
                        source: nodeB,
                        target: nodeA,
                        mode: 'road',
                        distance: roadDistance,
                        duration: roadDuration,
                        cost: roadDistance * 0.5, // $0.5 per km for road
                        emissions: roadDistance * 0.12, // 120g CO2 per km for trucks
                        departureTime: formattedDate,
                        arrivalTime: new Date(new Date(formattedDate).getTime() + roadDuration * 60 * 60 * 1000).toISOString()
                    });
                    
                    newConnectionsCount += 2;
                }
            }
            
            console.log(`[MULTIMODAL] Added ${newConnectionsCount} new road connections between nodes`);
        }
        
        // Step 9: Generate possible paths through the graph
        console.log('[MULTIMODAL] Step 9: Generating possible paths through the graph');
        
        const possiblePaths = generatePaths(graph, origin.id, destination.id, config.maxTransfers);
        console.log(`[MULTIMODAL] Found ${possiblePaths.length} possible paths through the graph`);
        
        // Convert paths to the expected format with detailed information
        graph.paths = possiblePaths.map((path, pathIndex) => {
            console.log(`[MULTIMODAL] Processing path ${pathIndex + 1} with ${path.edges.length} edges`);
            
            const segments = [];
            let totalDuration = 0;
            let totalCost = 0;
            let totalEmissions = 0;
            let totalDistance = 0;
            
            // Process the path into segments with detailed information about each leg
            for (let i = 0; i < path.edges.length; i++) {
                const edge = path.edges[i];
                const fromNode = graph.nodes[edge.source];
                const toNode = graph.nodes[edge.target];
                
                segments.push({
                    from: {
                        id: fromNode.id,
                        name: fromNode.name,
                        type: fromNode.type,
                        lat: fromNode.lat,
                        lng: fromNode.lng
                    },
                    to: {
                        id: toNode.id,
                        name: toNode.name,
                        type: toNode.type,
                        lat: toNode.lat,
                        lng: toNode.lng
                    },
                    mode: edge.mode,
                    provider: edge.provider,
                    service: edge.service,
                    distance: edge.distance,
                    duration: edge.duration,
                    cost: edge.cost,
                    emissions: edge.emissions,
                    departureTime: edge.departureTime,
                    arrivalTime: edge.arrivalTime,
                    intermediateStops: edge.intermediateStops || edge.schedule || [],
                    isAlternativeMode: edge.isAlternativeMode || false
                });
                
                totalDuration += edge.duration || 0;
                totalCost += edge.cost || 0;
                totalEmissions += edge.emissions || 0;
                totalDistance += edge.distance || 0;
            }
            
            return {
                pathId: `path_${pathIndex + 1}`,
                nodes: path.nodes,
                segments,
                duration: totalDuration,
                cost: path.totalCost || totalCost, // Use the pre-calculated cost if available
                emissions: totalEmissions,
                distance: totalDistance,
                departureTime: segments[0]?.departureTime || formattedDate,
                arrivalTime: segments[segments.length - 1]?.arrivalTime || null,
                delay: path.totalDelay || 0,
                predictedDuration: path.totalPredictedDuration || totalDuration,
                delayImpact: path.delayImpact || 0
            };
        });
        
        console.log('[MULTIMODAL] Graph generation complete:', {
            nodes: Object.keys(graph.nodes).length,
            edges: graph.edges.length,
            paths: graph.paths.length
        });
        
        console.log('==========================================');

        // Generate all possible paths
        const paths = generatePaths(graph, origin.id, destination.id);
        graph.metadata.completeRoutes = paths;

        // Enhance the graph with intermediate ship routes
        try {
            const enhancedGraph = await enhanceMultimodalGraphWithIntermediateRoutes(graph, startDate);
            if (enhancedGraph) {
                graph = enhancedGraph;
            }
        } catch (error) {
            console.error('Error enhancing graph with intermediate routes:', error);
            // Continue with the original graph if enhancement fails
        }

        // After all edges are added and before returning the final graph, enhance each edge with delay
        console.log('[MULTIMODAL] Enhancing edges with delay weights');
        
        const enhancedEdges = [];
        for (const edge of graph.edges) {
          const enhancedEdge = await enhanceEdgeWithDelay(edge);
          enhancedEdges.push(enhancedEdge);
        }
        
        // Replace the original edges with the enhanced ones
        graph.edges = enhancedEdges;

        return graph;
    } catch (error) {
        console.error('[MULTIMODAL] Error generating multimodal graph:', error);
        throw error;
    }
};

/**
 * Generate all possible paths between source and target nodes
 * @param {Object} graph - Graph with nodes and edges
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {number} maxTransfers - Maximum number of transfers allowed
 * @returns {Array} Array of possible paths
 */
function generatePaths(graph, sourceId, targetId, maxTransfers) {
    // Build adjacency list for faster lookup
    const adjacencyList = {};
    
    graph.edges.forEach(edge => {
        if (!adjacencyList[edge.source]) {
            adjacencyList[edge.source] = [];
        }
        adjacencyList[edge.source].push(edge);
    });
    
    // Queue for BFS
    const queue = [{ 
        nodeId: sourceId, 
        path: [sourceId], 
        edges: [],
        transfers: 0,
        totalDuration: 0,
        totalDelay: 0,
        totalPredictedDuration: 0,
        totalCost: 0
    }];
    const visited = new Set();
    const paths = [];
    
    while (queue.length > 0) {
        const { nodeId, path, edges, transfers, totalDuration, totalDelay, totalPredictedDuration, totalCost } = queue.shift();
        
        // Skip if we've exceeded the maximum number of transfers
        if (transfers > maxTransfers) {
            continue;
        }
        
        // If we reached the target, add the path to the results
        if (nodeId === targetId) {
            paths.push({ 
                nodes: path, 
                edges, 
                totalDuration,
                totalDelay,
                totalPredictedDuration,
                totalCost,
                delayImpact: totalDelay > 0 ? (totalDelay / totalDuration) * 100 : 0
            });
            continue;
        }
        
        // Get adjacent edges
        const adjacent = adjacencyList[nodeId] || [];
        
        for (const edge of adjacent) {
            const nextNodeId = edge.target;
            
            // Skip if we've already visited this node in this path
            if (path.includes(nextNodeId)) {
                continue;
            }
            
            // Determine if this edge causes a transfer
            const newTransfers = transfers + (edges.length > 0 && edges[edges.length - 1].mode !== edge.mode ? 1 : 0);
            
            // Add the duration, delay, and cost from this edge
            const edgeDuration = edge.duration || 0;
            const edgeDelay = edge.delay || 0;
            const edgePredictedDuration = edge.predictedDuration || edgeDuration;
            const edgeCost = edge.cost || 0;
            
            const newTotalDuration = totalDuration + edgeDuration;
            const newTotalDelay = totalDelay + edgeDelay;
            const newTotalPredictedDuration = totalPredictedDuration + edgePredictedDuration;
            const newTotalCost = totalCost + edgeCost;
            
            // Create a unique key for this state (node + transfers)
            const stateKey = `${nextNodeId}-${newTransfers}`;
            
            // Skip if we've already visited this state with fewer transfers
            if (visited.has(stateKey)) {
                continue;
            }
            
            visited.add(stateKey);
            
            // Add to the queue
            queue.push({
                nodeId: nextNodeId,
                path: [...path, nextNodeId],
                edges: [...edges, edge],
                transfers: newTransfers,
                totalDuration: newTotalDuration,
                totalDelay: newTotalDelay,
                totalPredictedDuration: newTotalPredictedDuration,
                totalCost: newTotalCost
            });
        }
    }
    
    // Sort paths by predicted duration (including delays)
    paths.sort((a, b) => a.totalPredictedDuration - b.totalPredictedDuration);
    
    return paths;
}

/**
 * Calculate the distance between two points using the Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRad(degrees) {
  return degrees * (Math.PI/180);
}

// Add mock data functions to support testing if real APIs are not available
export const fetchFlightRoutesGraph = async (originCode, destCode, date) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return mock flight data
  return [
    {
      airline: 'Lufthansa',
      flightNumber: 'LH1234',
      aircraft: 'Boeing 787',
      departureTime: new Date(date).toISOString(),
      arrivalTime: new Date(new Date(date).getTime() + 3 * 60 * 60 * 1000).toISOString(),
      duration: 3, // hours
      originCode,
      destCode
    },
    {
      airline: 'British Airways',
      flightNumber: 'BA567',
      aircraft: 'Airbus A350',
      departureTime: new Date(new Date(date).getTime() + 4 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000).toISOString(),
      duration: 3.5, // hours
      originCode,
      destCode
    }
  ];
};

/**
 * Fetch port location data by port codes
 * @param {Array<string>} portCodes - Array of port codes to lookup
 * @returns {Promise<Array>} Array of port objects with coordinates
 */
export const fetchPortLocationsByCode = async (portCodes) => {
  if (!portCodes || !Array.isArray(portCodes) || portCodes.length === 0) {
    return [];
  }
  
  try {
    console.log('Fetching port locations for codes:', portCodes);
    
    // Check if we already have some of these in cache
    const cachedResults = [];
    const uncachedCodes = [];
    
    // Simple client-side cache for port coordinates
    const coordinatesCache = window.portCoordinatesCache || new Map();
    window.portCoordinatesCache = coordinatesCache;
    
    // Check cache first
    portCodes.forEach(code => {
      if (coordinatesCache.has(code)) {
        const cached = coordinatesCache.get(code);
        cachedResults.push({
          code,
          name: cached.name || code,
          latitude_dd: cached.lat,
          longitude_dd: cached.lng
        });
        console.log(`Using cached coordinates for ${code}:`, cached);
      } else {
        uncachedCodes.push(code);
      }
    });
    
    // If all codes were cached, return immediately
    if (uncachedCodes.length === 0) {
      console.log('All port coordinates were found in cache');
      return cachedResults;
    }
    
    // Convert array to comma-separated string for the API
    const codesParam = uncachedCodes.join(',');
    const apiUrl = `/api/port-locations?codes=${codesParam}`;
    
    console.log('Making request to:', apiUrl);
    
    // Use a timeout to avoid hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Call the API endpoint that connects to the database
      const response = await fetch(apiUrl, { 
        signal: controller.signal
      });
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to get error details');
        console.error(`Failed to fetch port locations: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch port locations: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched port locations:', data);
      
      // Update cache with new results
      if (Array.isArray(data)) {
        data.forEach(port => {
          if (port.code && (port.latitude_dd !== null || port.longitude_dd !== null)) {
            coordinatesCache.set(port.code, {
              lat: port.latitude_dd,
              lng: port.longitude_dd,
              name: port.name
            });
          }
        });
      }
      
      // Combine cached and new results
      return [...cachedResults, ...data];
    } catch (fetchError) {
      // Clear the timeout if fetch failed
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Fetch request timed out after 5 seconds');
      } else {
        console.error('Error fetching port locations:', fetchError);
      }
      
      // Return what we have from cache plus placeholders
      return [
        ...cachedResults,
        ...uncachedCodes.map(code => ({
          code,
          name: code,
          latitude_dd: null,
          longitude_dd: null
        }))
      ];
    }
  } catch (error) {
    console.error('Error in fetchPortLocationsByCode:', error);
    // Return placeholders for all requested codes
    return portCodes.map(code => ({
      code,
      name: code,
      latitude_dd: null,
      longitude_dd: null
    }));
  }
};

/**
 * Fetch multimodal transport graph using the new comprehensive API 
 * @param {Object} origin - Origin location with lat, lng properties
 * @param {Object} destination - Destination location with lat, lng properties
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Object>} Comprehensive multimodal graph with nodes, edges, and journeys
 */
export const fetchComprehensiveMultimodalGraph = async (origin, destination, startDate) => {
  try {
    console.log('[ComprehensiveMultimodal] Building multimodal transport graph...');
    console.log('[ComprehensiveMultimodal] Origin:', origin);
    console.log('[ComprehensiveMultimodal] Destination:', destination);
    console.log('[ComprehensiveMultimodal] Start date:', startDate);
    
    const formattedDate = startDate instanceof Date 
      ? startDate.toISOString().split('T')[0]
      : startDate || new Date().toISOString().split('T')[0];
    
    const response = await fetch(`${API_BASE_URL}/api/multimodal-graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        origin,
        destination,
        startDate: formattedDate
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[ComprehensiveMultimodal] Graph statistics:', data.stats);
    
    return data.graph;
  } catch (error) {
    console.error('[ComprehensiveMultimodal] Error:', error);
    throw error;
  }
};

/**
 * Fetches intermediate ship routes between points in a path
 * @param {Array} path - Array of port codes representing a path (e.g., ['INCOK', 'LKCMB', 'NLRTM', 'NLAMS'])
 * @param {string|Date} startDate - Starting date as YYYYMMDD string or Date object
 * @param {Object} completeGraph - Optional complete graph to add the intermediate routes to
 * @returns {Promise<Object>} Intermediate ship routes data
 */
export const fetchIntermediateShipRoutes = async (path, startDate, completeGraph = null) => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second delay between retries
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    while (retryCount <= maxRetries) {
        try {
            console.log(`===== FETCHING INTERMEDIATE SHIP ROUTES (Attempt ${retryCount + 1}/${maxRetries + 1}) =====`);
            console.log('Request parameters:', { path, startDate, hasCompleteGraph: !!completeGraph });
            
            // Format the date properly based on input type
            let formattedDate = null;
            if (startDate) {
                if (startDate instanceof Date) {
                    // Handle Date object
                    const year = startDate.getFullYear();
                    const month = String(startDate.getMonth() + 1).padStart(2, '0');
                    const day = String(startDate.getDate()).padStart(2, '0');
                    formattedDate = `${year}-${month}-${day}`;
                } else if (typeof startDate === 'string') {
                    // Handle string in YYYYMMDD format
                    if (startDate.length === 8 && !startDate.includes('-')) {
                        const year = startDate.substring(0, 4);
                        const month = startDate.substring(4, 6);
                        const day = startDate.substring(6, 8);
                        formattedDate = `${year}-${month}-${day}`;
                    } else {
                        // Already in YYYY-MM-DD format or other format
                        formattedDate = startDate;
                    }
                }
                console.log('Formatted date:', formattedDate);
            }
            
            const requestBody = {
                path: path,
                startDate: formattedDate,
                completeGraph: completeGraph
            };
            
            console.log('API request URL:', `${API_BASE_URL}/api/intermediate-ship-routes`);
            console.log('API request body:', JSON.stringify(requestBody, null, 2));
            
            // Use POST request to the proper endpoint
            const response = await fetch(`${API_BASE_URL}/api/intermediate-ship-routes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log('API response status:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                console.error('API response not OK:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData
                });
                
                // For 500 errors, we'll retry after a delay
                if (response.status === 500 && retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${maxRetries + 1})`);
                    await delay(retryDelay * retryCount); // Exponential backoff
                    continue; // Retry the request
                }
                
                // If we've reached max retries or it's not a 500 error, throw a more informative error
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Received intermediate ship routes data:', data);
            
            return data;
        } catch (error) {
            console.error(`Fetch intermediate ship routes error (Attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
            
            // If we haven't hit max retries yet, try again
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${maxRetries + 1})`);
                await delay(retryDelay * retryCount); // Exponential backoff
            } else {
                // If we've reached max retries, use a fallback mechanism
                console.log("Max retries reached, returning fallback data");
                
                // Generate fallback data based on the path
                const fallbackData = {
                    path: path,
                    startDate: startDate,
                    intermediateRoutes: {},
                    isGeneratedFallback: true, // Flag to indicate this is fallback data
                    completeGraph: completeGraph // Maintain the original graph
                };
                
                return fallbackData;
            }
        }
    }
    
    // This should only happen if all retries fail and we also fail to generate fallback data
    console.error("All attempts to fetch intermediate routes failed");
    return {
        path: path,
        isGeneratedFallback: true,
        error: "Failed to fetch intermediate routes after multiple attempts"
    };
};

/**
 * Enhances a multimodal graph with intermediate ship routes
 * @param {Object} graph - The original multimodal graph
 * @param {string|Date} startDate - Starting date as YYYYMMDD string or Date object
 * @returns {Promise<Object>} Enhanced multimodal graph with intermediate ship routes
 */
export const enhanceMultimodalGraphWithIntermediateRoutes = async (graph, startDate) => {
    try {
        console.log('===== ENHANCING MULTIMODAL GRAPH WITH INTERMEDIATE ROUTES =====');
        
        if (!graph || !graph.completeRoutes || graph.completeRoutes.length === 0) {
            console.error('Invalid graph provided:', graph);
            throw new Error('A valid graph with complete routes is required.');
        }
        
        console.log(`Processing ${graph.completeRoutes.length} complete routes`);
        
        // Create a map to store unique paths we've already processed
        const processedPaths = new Map();
        
        // For each complete route, extract the path and process intermediate points
        for (const route of graph.completeRoutes) {
            if (!route.path || route.path.length < 3) {
                console.log('Skipping route with insufficient path:', route);
                continue;
            }
            
            // Create a key for this path to avoid duplicates
            const pathKey = route.path.join('->');
            
            // Skip if we've already processed this path
            if (processedPaths.has(pathKey)) {
                console.log(`Skipping already processed path: ${pathKey}`);
                continue;
            }
            
            // Mark this path as processed
            processedPaths.set(pathKey, true);
            
            console.log(`Processing path: ${pathKey}`);
            
            try {
                // Fetch intermediate ship routes for this path
                const intermediateRoutes = await fetchIntermediateShipRoutes(route.path, startDate, graph);
                
                console.log(`Found intermediate routes for path ${pathKey}:`, intermediateRoutes);
                
                // Process intermediate routes to add emissions data
                if (intermediateRoutes && intermediateRoutes.intermediateRoutes) {
                    console.log(`Adding emissions data for intermediate routes in path ${pathKey}`);
                    
                    // Process each intermediate point's routes
                    for (const [intermediatePoint, routes] of Object.entries(intermediateRoutes.intermediateRoutes)) {
                        console.log(`Processing emissions for intermediate point: ${intermediatePoint}`);
                        
                        // Skip if no routes data found
                        if (!routes || !routes.routeTree || !routes.routeTree.voyages) {
                            console.log(`No valid routes data for ${intermediatePoint}, skipping emissions calculation`);
                            continue;
                        }
                        
                        // Calculate emissions for each voyage in the route tree
                        for (const voyage of routes.routeTree.voyages) {
                            // Skip if missing essential data
                            if (!voyage.departurePort || !voyage.arrivalPort) {
                                console.log(`Missing port data for voyage ${voyage.voyage}, skipping emissions calculation`);
                                continue;
                            }
                            
                            // Calculate emissions using the emissions calculator API
                            try {
                                console.log(`Calculating emissions for ${voyage.departurePort} → ${voyage.arrivalPort}`);
                                
                                const emissionsResponse = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        fromPort: voyage.departurePort,
                                        toPort: voyage.arrivalPort,
                                        shippingLine: 'HLCU'
                                    })
                                });
                                
                                if (emissionsResponse.ok) {
                                    const emissionsData = await emissionsResponse.json();
                                    if (emissionsData.success) {
                                        voyage.emissions = emissionsData.emissions;
                                        console.log(`Retrieved sea emissions for ${voyage.departurePort} → ${voyage.arrivalPort}: ${voyage.emissions} metric tons`);
                                    }
                                }
                            } catch (emissionsError) {
                                console.error(`Failed to calculate emissions for ${voyage.departurePort} → ${voyage.arrivalPort}: ${emissionsError.message}`);
                            }
                        }
                        
                        // If we have a complete graph with enhanced routes, add emissions to those too
                        if (intermediateRoutes.completeGraph && intermediateRoutes.completeGraph[intermediatePoint]) {
                            const routes = intermediateRoutes.completeGraph[intermediatePoint];
                            
                            for (const voyage of routes) {
                                if (!voyage.departurePort || !voyage.arrivalPort) continue;
                                
                                try {
                                    // Skip if already has emissions data
                                    if (voyage.emissions !== undefined) continue;
                                    
                                    console.log(`Calculating emissions for complete graph voyage ${voyage.departurePort} → ${voyage.arrivalPort}`);
                                    
                                    const emissionsResponse = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            fromPort: voyage.departurePort,
                                            toPort: voyage.arrivalPort,
                                            shippingLine: 'HLCU'
                                        })
                                    });
                                    
                                    if (emissionsResponse.ok) {
                                        const emissionsData = await emissionsResponse.json();
                                        if (emissionsData.success) {
                                            voyage.emissions = emissionsData.amount || emissionsData.emissions;
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Failed to calculate emissions for complete graph voyage: ${error.message}`);
                                }
                            }
                        }
                    }
                }
                
                // If we have a complete graph with new routes, update our graph
                if (intermediateRoutes.completeGraph && 
                    intermediateRoutes.completeGraph.completeRoutes && 
                    intermediateRoutes.completeGraph.completeRoutes.length > graph.completeRoutes.length) {
                    
                    console.log(`Adding ${intermediateRoutes.completeGraph.completeRoutes.length - graph.completeRoutes.length} new routes to the graph`);
                    
                    // Update the graph with the new routes
                    graph = intermediateRoutes.completeGraph;
                }
            } catch (error) {
                console.error(`Error processing intermediate routes for path ${pathKey}:`, error);
                // Continue with the next path
            }
        }
        
        console.log('Enhanced graph with intermediate routes:', graph);
        return graph;
    } catch (error) {
        console.error('Error enhancing multimodal graph with intermediate routes:', error);
        throw error;
    }
};

// In-memory data store for enhanced graphs and routes
export const dataStore = {
  seaRoutesGraph: null,
  intermediateRoutes: null,
  airRoutesGraph: null,
  multimodalGraph: null
};

// Make dataStore globally available for debugging
if (typeof window !== 'undefined') {
  window.routesDataStore = dataStore;
  console.log('Routes data store available at window.routesDataStore');
}

/**
 * Stores the sea routes graph data to the server
 * @param {Object} data - The sea routes graph data to store
 * @returns {Promise<Object>} - Response indicating success or failure
 */
export const storeSeaRoutesGraph = async (data) => {
  try {
    console.log('Storing sea routes graph data in memory');
    dataStore.seaRoutesGraph = data;
    console.log('Sea routes graph stored successfully in memory');
    return { success: true };
  } catch (error) {
    console.error('Store sea routes graph error:', error);
    throw error;
  }
};

/**
 * Stores the intermediate routes data to the server
 * @param {Object} data - The intermediate routes data to store
 * @returns {Promise<Object>} - Response indicating success or failure
 */
export const storeIntermediateRoutes = async (data) => {
  try {
    console.log('Storing intermediate routes data in memory');
    
    // Check if data is valid before storing
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      console.warn('Invalid or empty intermediate routes data provided');
      return { success: false, message: 'Invalid or empty data' };
    }
    
    // Store the intermediate routes
    dataStore.intermediateRoutes = data;
    console.log('Intermediate routes data stored successfully in memory');
    console.log('DATA KEYS:', Object.keys(data).join(', '));
    
    // Immediately transform to air routes graph - run synchronously for debugging purposes
    console.log('==== DIRECT TRANSFORMATION TO AIR ROUTES GRAPH ====');
    try {
      // Directly transform the data (not in setTimeout)
      const airRoutesGraph = transformIntermediateAirRoutesToGraph(data);
      
      // Double verify after transformation
      console.log('FINAL VERIFICATION OF AIR ROUTES STORAGE:');
      console.log('dataStore.airRoutesGraph airports:', Object.keys(dataStore.airRoutesGraph).length);
      console.log('dataStore.airRoutesGraph total routes:', 
        Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)
      );
      
      return { 
        success: true, 
        airRoutesCreated: true,
        airportCount: Object.keys(dataStore.airRoutesGraph).length,
        routeCount: Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)
      };
    } catch (transformError) {
      console.error('Error in direct transformation:', transformError);
      return { 
        success: true, 
        airRoutesCreated: false, 
        error: transformError.message 
      };
    }
  } catch (error) {
    console.error('Store intermediate routes data error:', error);
    throw error;
  }
};

/**
 * Retrieves the sea routes graph data from the server
 * @returns {Promise<Object>} - The sea routes graph data
 */
export const getSeaRoutesGraph = async () => {
  try {
    console.log('Retrieving sea routes graph data from memory');
    return dataStore.seaRoutesGraph;
  } catch (error) {
    console.error('Get sea routes graph error:', error);
    throw error;
  }
};

/**
 * Retrieves the intermediate routes data from the server
 * @returns {Promise<Object>} - The intermediate routes data
 */
export const getIntermediateRoutes = async () => {
  try {
    console.log('Retrieving intermediate routes data from memory');
    return dataStore.intermediateRoutes;
  } catch (error) {
    console.error('Get intermediate routes data error:', error);
    throw error;
  }
};

/**
 * Retrieves the air routes graph data from the server
 * @returns {Promise<Object>} - The air routes graph data
 */
export const getAirRoutesGraph = async () => {
  try {
    console.log('Retrieving air routes graph data from memory');
    return dataStore.airRoutesGraph;
  } catch (error) {
    console.error('Get air routes graph error:', error);
    throw error;
  }
};

/**
 * Transforms intermediate air routes data into an enhanced graph format similar to sea routes
 * @param {Object} intermediateRoutesData - The intermediate routes data to transform
 * @returns {Object} - The transformed air routes graph
 */
export const transformIntermediateAirRoutesToGraph = (intermediateRoutesData) => {
  const enhancedGraph = {};
  
  // Check if the data is in enhancedAirGraph format
  if (intermediateRoutesData.nodes && intermediateRoutesData.edges && Array.isArray(intermediateRoutesData.edges)) {
    console.log('Data is in enhancedAirGraph format, converting to airRoutesGraph format');
    console.log('Number of nodes:', Object.keys(intermediateRoutesData.nodes).length);
    console.log('Number of edges:', intermediateRoutesData.edges.length);
    
    // Initialize airport nodes
    Object.entries(intermediateRoutesData.nodes).forEach(([airportCode, nodeData]) => {
      if (nodeData.type === 'airport') {
        enhancedGraph[airportCode] = [];
        console.log(`Initialized airport node: ${airportCode}`);
      }
    });
    
    // Create a map to track unique routes
    const uniqueRoutes = new Map();
    
    // Add routes based on edges
    intermediateRoutesData.edges.forEach((edge, index) => {
      console.log(`Processing edge ${index + 1}/${intermediateRoutesData.edges.length}:`, edge);
      
      if (!edge.from || !edge.to) {
        console.warn(`Skipping edge with missing from/to:`, edge);
        return;
      }
      
      // Initialize arrays if they don't exist
      if (!enhancedGraph[edge.from]) {
        enhancedGraph[edge.from] = [];
      }
      if (!enhancedGraph[edge.to]) {
        enhancedGraph[edge.to] = [];
      }
      
      // Create a unique key for this route based on flight number, origin, destination, and departure time
      const routeKey = `${edge.flight}_${edge.from}_${edge.to}_${edge.departure}`;
      
      // Only process if we haven't seen this exact route before
      if (!uniqueRoutes.has(routeKey)) {
        const route = {
          shipId: edge.id || `${edge.from}-${edge.to}_${Date.now()}`,
          shipName: edge.flight || 'Unknown Flight',
          voyage: edge.flight ? edge.flight.split(' ')[1] : 'Unknown',
          fromPort: edge.from,
          fromPortName: edge.from,
          toPort: edge.to,
          toPortName: edge.to,
          departureTime: edge.departure,
          arrivalTime: edge.arrival,
          aircraft: edge.aircraft || 'Unknown',
          carrier: edge.flight ? edge.flight.split(' ')[0] : 'Unknown',
          type: 'air',
          duration: edge.duration || null,
          isIntermediateRoute: edge.isIntermediateRoute || false,
          intermediateKey: edge.intermediateKey || null,
          routeIndex: edge.routeIndex || 0,
          flightIndex: edge.flightIndex || 0
        };
        
        // Add to unique routes map
        uniqueRoutes.set(routeKey, route);
        
        // Add to the graph
        enhancedGraph[edge.from].push(route);
        console.log(`Added unique route from ${edge.from} to ${edge.to}`);
      } else {
        console.log(`Skipped duplicate route from ${edge.from} to ${edge.to}`);
      }
    });
    
    console.log(`Converted enhancedAirGraph to airRoutesGraph with ${Object.keys(enhancedGraph).length} airports`);
    console.log(`Total unique air routes in enhancedGraph: ${uniqueRoutes.size}`);
    
    // Store the enhanced air routes graph in the dataStore
    dataStore.airRoutesGraph = enhancedGraph;
    
    return enhancedGraph;
  }
  
  // ... rest of the function remains unchanged ...
};

/**
 * Calculate approximate distance between two airports
 * @param {string} origin - Origin airport code
 * @param {string} destination - Destination airport code
 * @returns {number} Distance in kilometers (estimated)
 */
function calculateAirDistance(origin, destination) {
  // This is a simplified implementation - in a real app, you would use actual coordinates
  // Use a fixed average distance as fallback
  return 1000; // Default 1000km as fallback
}

/**
 * Calculate flight duration from departure and arrival times
 * @param {string} departureTime - Departure time
 * @param {string} arrivalTime - Arrival time
 * @returns {number} Duration in hours
 */
function calculateFlightDuration(departureTime, arrivalTime) {
  if (!departureTime || !arrivalTime) return 2.5; // Default 2.5 hours as fallback
  
  try {
    const departure = new Date(departureTime);
    const arrival = new Date(arrivalTime);
    return (arrival - departure) / (1000 * 60 * 60); // Convert to hours
  } catch (e) {
    return 2.5; // Default if parsing fails
  }
}

/**
 * Creates connections between seaports and their nearest airports to build a multimodal graph
 * @returns {Promise<Object>} The complete multimodal graph combining sea and air routes
 */
export const buildMultimodalGraph = async () => {
  console.log('Building multimodal graph...');

  const multimodalGraph = {
    nodes: {},
    edges: [],
    paths: [], // Path calculation can be added later
    metadata: {
      seaNodes: 0,
      airNodes: 0,
      transferEdges: 0,
      seaEdges: 0,
      airEdges: 0,
      totalNodes: 0,
      totalEdges: 0,
      createdAt: new Date().toISOString()
    }
  };

  try {
    const seaGraph = dataStore.seaRoutesGraph || {};
    // Use enhancedAirGraph which has both nodes and edges
    const airGraphData = dataStore.enhancedAirGraph || { nodes: {}, edges: [] };
    const airNodes = airGraphData.nodes || {};
    const airEdges = airGraphData.edges || [];

    console.log(`Found ${Object.keys(seaGraph).length} seaports in seaRoutesGraph.`);
    console.log(`Found ${Object.keys(airNodes).length} airports in enhancedAirGraph.nodes.`);
    console.log(`Found ${airEdges.length} air routes in enhancedAirGraph.edges.`);

    // 1. Add Sea Nodes and Edges
    for (const [portCode, routes] of Object.entries(seaGraph)) {
      // Add seaport node if not already added
      if (!multimodalGraph.nodes[portCode]) {
        // Attempt to get lat/lng from the first route associated with this port
        const firstRoute = routes && Array.isArray(routes) && routes.length > 0 ? routes[0] : null;
        multimodalGraph.nodes[portCode] = {
          id: portCode,
          name: firstRoute?.fromPortName || portCode, // Use name from first route or code
          type: 'seaport',
          // TODO: Consider a more robust way to get lat/lng if not present in routes
          lat: firstRoute?.fromPortLat || null,
          lng: firstRoute?.fromPortLng || null
        };
        multimodalGraph.metadata.seaNodes++;
      }

      // Add sea route edges
      if (Array.isArray(routes)) { // Ensure routes is an array
        for (const route of routes) {
           // Add destination port node if not already added
           if (route.toPort && !multimodalGraph.nodes[route.toPort]) {
              multimodalGraph.nodes[route.toPort] = {
                id: route.toPort,
                name: route.toPortName || route.toPort,
                type: 'seaport',
                lat: route.toPortLat || null, // Assuming routes might have destination lat/lng
                lng: route.toPortLng || null
              };
              multimodalGraph.metadata.seaNodes++;
           }

           // Ensure route has necessary properties before creating edge
              // Calculate sea emissions using API
              let emissions = null;
              try {
                const response = await fetch(`${API_BASE_URL}/api/calculator/sea`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    fromPort: portCode,
                    toPort: route.toPort,
                    shippingLine: 'HLCU' // Default to Hapag-Lloyd
                  })
                });
                
                if (response.ok) {
                  const data = await response.json();
                  console.log(data);
                  if (data.success) {
                    emissions = data.emissions;
                    console.log(`Retrieved sea emissions for ${portCode} → ${route.toPort}: ${emissions} metric tons`);
                  }
                } else {
                  console.warn(`Failed to get sea emissions for ${portCode} to ${route.toPort}: ${response.status} ${response.statusText}`);
                }
              } catch (error) {
                console.warn(`Failed to calculate sea emissions for ${portCode} to ${route.toPort}:`, error);
              }

              const edge = {
                id: `sea_${portCode}_${route.toPort}_${route.shipId || 'unknown'}_${route.voyage || 'unknown'}`,
                from: portCode,
                to: route.toPort,
                type: 'sea',
                // Use existing calculateDuration function (defined elsewhere)
                weight: calculateDuration(route.departureTime, route.arrivalTime), // Use duration in hours as weight
                emissions: emissions, // Add emissions data
                details: route
              };
              multimodalGraph.edges.push(edge);
              multimodalGraph.metadata.seaEdges++;

        }
      }
    }

    // 2. Add Air Nodes and Edges
    // Add airport nodes from enhancedAirGraph.nodes
    for (const [airportCode, nodeData] of Object.entries(airNodes)) {
       if (nodeData.type === 'airport' && !multimodalGraph.nodes[airportCode]) {
         multimodalGraph.nodes[airportCode] = {
           id: airportCode,
           name: nodeData.name || airportCode,
           type: 'airport',
           lat: nodeData.lat || null, // Assuming lat/lng might be in nodeData
           lng: nodeData.lng || null
         };
         multimodalGraph.metadata.airNodes++;
       }
    }

    // Add air route edges from enhancedAirGraph.edges
    for (const route of airEdges) {
       // Ensure origin/destination airports are in nodes (might be redundant but safe)
       if (route.from && !multimodalGraph.nodes[route.from]) {
          multimodalGraph.nodes[route.from] = { id: route.from, name: route.from, type: 'airport', lat: null, lng: null };
          multimodalGraph.metadata.airNodes++;
       }
       if (route.to && !multimodalGraph.nodes[route.to]) {
          multimodalGraph.nodes[route.to] = { id: route.to, name: route.to, type: 'airport', lat: null, lng: null };
          multimodalGraph.metadata.airNodes++;
       }

       // Ensure route has necessary properties
       if (route.from && route.to && route.departure && route.arrival) {
          // Calculate air emissions if we have lat/lng data
          let emissions = null;
          const fromNode = multimodalGraph.nodes[route.from];
          const toNode = multimodalGraph.nodes[route.to];
          
          try {
            const response = await fetch(`${API_BASE_URL}/api/calculator/air`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fromAirport: route.from,
                toAirport: route.to,
                weight: 0.001 // Default weight parameter
              })
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.success) {
                emissions = data.emissions;
              }
            } else {
              console.warn(`Failed to get air emissions for ${route.from} to ${route.to}: ${response.status} ${response.statusText}`);
            }
          } catch (error) {
            console.warn(`Failed to calculate air emissions for ${route.from} to ${route.to}:`, error);
          }

          const edge = {
            id: `air_${route.id || `${route.from}_${route.to}`}`,
            from: route.from,
            to: route.to,
            type: 'air',
            // Use existing calculateFlightDuration function (defined elsewhere, might be same as calculateDuration)
            weight: calculateFlightDuration(route.departure, route.arrival), // Use duration in hours
            emissions: emissions, // Add emissions data
            details: route
          };
          multimodalGraph.edges.push(edge);
          multimodalGraph.metadata.airEdges++;
       } else {
          console.warn('Skipping air edge due to missing data:', route);
       }
    }

    // 3. Add Transfer Edges (Sea <-> Air)
    console.log('Adding transfer edges between nearby seaports and airports...');
    const allNodes = Object.values(multimodalGraph.nodes);
    // Filter nodes that have lat/lng for nearest neighbor search
    const seaportsWithLocation = allNodes.filter(n => n.type === 'seaport' && typeof n.lat === 'number' && typeof n.lng === 'number');
    const airportsWithLocation = allNodes.filter(n => n.type === 'airport' && typeof n.lat === 'number' && typeof n.lng === 'number');

    console.log(`Found ${seaportsWithLocation.length} seaports with location data.`);
    console.log(`Found ${airportsWithLocation.length} airports with location data.`);

    // Create a set to track added transfer pairs to avoid duplicates (e.g., A->B and B->A added separately)
    const transferPairs = new Set();

    // From Seaports to nearest Airports
    for (const seaport of seaportsWithLocation) {
       try {
         // Use existing getNearestAirports function
         const nearestAirports = await getNearestAirports(seaport.lat, seaport.lng, 1); // Find top 1 nearest for simplicity
         for (const airportInfo of nearestAirports) {
            // Check if the nearest airport exists in our graph nodes
            if (multimodalGraph.nodes[airportInfo.code]) {
              const airportNode = multimodalGraph.nodes[airportInfo.code];
              const pairKey1 = `${seaport.id}-${airportNode.id}`;
              const pairKey2 = `${airportNode.id}-${seaport.id}`;

              // Add transfer edges only if this pair hasn't been added
              if (!transferPairs.has(pairKey1) && !transferPairs.has(pairKey2)) {
                  const distance = airportInfo.distance; // Assuming distance is in km from getNearestAirports
                  const transferTimeHours = (distance / 60) + 1; // Estimate: 60 km/h avg speed + 1 hour buffer

                  // Calculate emissions for transfer using API
                  let transferEmissions = null;
                  try {
                    const response = await fetch(`${API_BASE_URL}/api/emissions/transfer`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        distance,
                        mode: 'road'
                      })
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      if (data.success) {
                        transferEmissions = data.emissions;
                      }
                    } else {
                      console.warn(`Failed to get transfer emissions: ${response.status} ${response.statusText}`);
                    }
                  } catch (error) {
                    console.warn(`Failed to calculate transfer emissions for ${seaport.id} to ${airportNode.id}:`, error);
                    // Fallback to simple calculation if API fails
                    transferEmissions = distance * 0.2; // Average car emits about 0.2 kg CO2 per km
                  }

                  const transferEdge = {
                    id: `transfer_${seaport.id}_${airportNode.id}`,
                    from: seaport.id,
                    to: airportNode.id,
                    type: 'transfer',
                    weight: transferTimeHours,
                    emissions: transferEmissions, // Add emissions data
                    details: { distance_km: distance, mode: 'road' }
                  };
                  // Add bi-directional transfer edge
                  const reverseTransferEdge = {
                     ...transferEdge,
                     id: `transfer_${airportNode.id}_${seaport.id}`,
                     from: airportNode.id,
                     to: seaport.id,
                  };
                  multimodalGraph.edges.push(transferEdge, reverseTransferEdge);
                  multimodalGraph.metadata.transferEdges += 2;
                  transferPairs.add(pairKey1); // Mark pair as added
                  console.log(`Added transfer edge: ${seaport.id} <-> ${airportNode.id}`);
               }
            }
         }
       } catch (error) {
         console.warn(`Could not find/process nearest airports for seaport ${seaport.id}:`, error.message);
       }
    }

    // Update final metadata counts
    multimodalGraph.metadata.totalNodes = Object.keys(multimodalGraph.nodes).length;
    multimodalGraph.metadata.totalEdges = multimodalGraph.edges.length;
    // Recalculate edge type counts accurately
    multimodalGraph.metadata.seaEdges = multimodalGraph.edges.filter(e => e.type === 'sea').length;
    multimodalGraph.metadata.airEdges = multimodalGraph.edges.filter(e => e.type === 'air').length;
    multimodalGraph.metadata.transferEdges = multimodalGraph.edges.filter(e => e.type === 'transfer').length;


    console.log('Multimodal graph built successfully:');
    console.log(` - ${multimodalGraph.metadata.totalNodes} nodes (${multimodalGraph.metadata.seaNodes} initial sea, ${multimodalGraph.metadata.airNodes} initial air - counts may increase)`);
    console.log(` - ${multimodalGraph.metadata.totalEdges} edges (${multimodalGraph.metadata.seaEdges} sea, ${multimodalGraph.metadata.airEdges} air, ${multimodalGraph.metadata.transferEdges} transfer)`);

    // Store the built graph globally if needed
    dataStore.multimodalGraph = multimodalGraph;
    window.multimodalGraph = multimodalGraph; // For debugging

    // Apply delay enhancement to all edges
    console.log('Enhancing all edges with delay predictions...');
    const enhancedEdges = [];
    for (const edge of multimodalGraph.edges) {
      const enhancedEdge = await enhanceEdgeWithDelay(edge);
      enhancedEdges.push(enhancedEdge);
    }
    
    // Replace the original edges with the enhanced ones
    multimodalGraph.edges = enhancedEdges;
    console.log(`Enhanced all ${multimodalGraph.edges.length} edges with delay predictions`);

  } catch (error) {
    console.error('Error building multimodal graph:', error);
    // Optionally return the partially built graph or a default empty one
    return { // Return minimal structure on error
        nodes: {}, edges: [], paths: [], metadata: { error: error.message }
    };
  }

  return multimodalGraph;
};


// Helper function (ensure calculateFlightDuration exists or define it)
// Assuming it returns hours or null
/**
 * Gets details of an airport by IATA code
 * @param {string} iataCode - IATA code of the airport
 * @returns {Promise<Object>} Airport details
 */
export const getAirportDetails = async (iataCode) => {
  try {
    // Use existing API functions to get airport details
    // This is a simplified version - in a real app, you would have proper airport data lookup
    const airports = await fetchFreightPorts('air');
    return airports.find(airport => airport.code === iataCode);
  } catch (error) {
    console.error(`Error getting airport details for ${iataCode}:`, error);
    return null;
  }
};

/**
 * Find the nearest airports to a given location
 * @param {number} lat - Latitude of the location
 * @param {number} lng - Longitude of the location
 * @param {number} limit - Maximum number of airports to return
 * @returns {Promise<Array>} Array of nearest airports
 */
export const getNearestAirports = async (lat, lng, limit = 3) => {
  try {
    // Use the existing API function but with type=airport
    const response = await fetch(`/api/nearest?lat=${lat}&lng=${lng}&type=airport&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch nearest airports');
    }
    const data = await response.json();
    
    // Sort by distance to ensure closest is first
    const airports = data.airports || [];
    airports.sort((a, b) => a.distance - b.distance);
    
    // Add a flag to indicate which is the primary (closest) airport
    if (airports.length > 0) {
      airports[0].isPrimary = true;
    }
    
    return airports;
  } catch (error) {
    console.error('Error finding nearest airports:', error);
    return [];
  }
};

/**
 * Creates combined sea-air and air-sea graphs by finding nearest ports and airports
 * @param {Object} seaRoutesGraph - The sea routes graph
 * @param {Object} airRoutesGraph - The air routes graph
 * @returns {Promise<Object>} Object containing seaAirGraph and airSeaGraph
 */
export const createCombinedGraphs = async (seaRoutesGraph, airRoutesGraph) => {
  console.log('Creating combined sea-air and air-sea graphs');
  
  // Initialize the combined graphs
  const seaAirGraph = {};
  const airSeaGraph = {};
  
  // Clean up and limit the input graphs to top 20 routes
  const cleanSeaGraph = {};
  const cleanAirGraph = {};
  
  // Clean up sea routes graph
  for (const [port, routes] of Object.entries(seaRoutesGraph)) {
    if (routes && Array.isArray(routes)) {
      cleanSeaGraph[port] = routes.slice(0, 20);
    }
  }
  
  // Clean up air routes graph
  for (const [airport, routes] of Object.entries(airRoutesGraph)) {
    if (routes && Array.isArray(routes)) {
      cleanAirGraph[airport] = routes.slice(0, 20);
    }
  }
  
  // Process sea-air connections
  for (const [port, routes] of Object.entries(cleanSeaGraph)) {
    if (!routes || routes.length === 0) continue;
    
    // Get port location from first route
    const portLocation = {
      lat: parseFloat(routes[0].fromPortLat),
      lng: parseFloat(routes[0].fromPortLng)
    };
    
    try {
      // Find nearest airports to this port
      const nearestAirports = await getNearestAirports(portLocation.lat, portLocation.lng, 3);
      
      if (!nearestAirports || nearestAirports.length === 0) continue;
      
      // Initialize sea-air connections for this port
      seaAirGraph[port] = [];
      
      // For each nearest airport, find air routes to destinations
      for (const airport of nearestAirports) {
        const airportCode = airport.code;
        
        // Get air routes from this airport
        const airRoutes = cleanAirGraph[airportCode] || [];
        
        // Create combined routes
        for (const seaRoute of routes) {
          for (const airRoute of airRoutes) {
            // Create a combined route
            const combinedRoute = {
              type: 'sea-air',
              seaSegment: {
                ...seaRoute,
                toPort: airportCode,
                toPortName: airport.name
              },
              airSegment: {
                ...airRoute,
                fromPort: airportCode,
                fromPortName: airport.name
              },
              totalDistance: (seaRoute.distance || 0) + (airRoute.distance || 0),
              totalDuration: (seaRoute.duration || 0) + (airRoute.duration || 0)
            };
            
            seaAirGraph[port].push(combinedRoute);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing sea-air connections for port ${port}:`, error);
    }
  }
  
  // Process air-sea connections
  for (const [airport, routes] of Object.entries(cleanAirGraph)) {
    if (!routes || routes.length === 0) continue;
    
    // Get airport location from first route
    const airportLocation = {
      lat: parseFloat(routes[0].fromPortLat),
      lng: parseFloat(routes[0].fromPortLng)
    };
    
    try {
      // Find nearest seaports to this airport
      const nearestSeaports = await getNearestSeaports(airportLocation.lat, airportLocation.lng, 3);
      
      if (!nearestSeaports || nearestSeaports.length === 0) continue;
      
      // Initialize air-sea connections for this airport
      airSeaGraph[airport] = [];
      
      // For each nearest seaport, find sea routes to destinations
      for (const seaport of nearestSeaports) {
        const seaportCode = seaport.code;
        
        // Get sea routes from this seaport
        const seaRoutes = cleanSeaGraph[seaportCode] || [];
        
        // Create combined routes
        for (const airRoute of routes) {
          for (const seaRoute of seaRoutes) {
            // Create a combined route
            const combinedRoute = {
              type: 'air-sea',
              airSegment: {
                ...airRoute,
                toPort: seaportCode,
                toPortName: seaport.name
              },
              seaSegment: {
                ...seaRoute,
                fromPort: seaportCode,
                fromPortName: seaport.name
              },
              totalDistance: (airRoute.distance || 0) + (seaRoute.distance || 0),
              totalDuration: (airRoute.duration || 0) + (seaRoute.duration || 0)
            };
            
            airSeaGraph[airport].push(combinedRoute);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing air-sea connections for airport ${airport}:`, error);
    }
  }
  
  // Store the combined graphs in the dataStore
  dataStore.seaAirGraph = seaAirGraph;
  dataStore.airSeaGraph = airSeaGraph;
  
  console.log('Combined graphs created successfully:');
  console.log(`Sea-Air graph: ${Object.keys(seaAirGraph).length} ports with connections`);
  console.log(`Air-Sea graph: ${Object.keys(airSeaGraph).length} airports with connections`);
  
  return {
    seaAirGraph,
    airSeaGraph
  };
};

/**
 * Find the nearest seaports to a given location
 * @param {number} lat - Latitude of the location
 * @param {number} lng - Longitude of the location
 * @param {number} limit - Maximum number of seaports to return
 * @returns {Promise<Array>} Array of nearest seaports
 */
export const getNearestSeaports = async (lat, lng, limit = 3) => {
  try {
    // Use the existing API function if it exists, or implement a simplified version
    // This is a simplified implementation that finds seaports within 200km of the location
    const seaports = await fetchFreightPorts('sea');
    
    if (!seaports || !Array.isArray(seaports)) {
      console.error('Failed to fetch seaports data');
      return [];
    }
    
    // Calculate distance for each seaport and sort by distance
    const seaportsWithDistance = seaports.map(seaport => {
      if (!seaport.latitude_dd || !seaport.longitude_dd) return null;
      
      const distance = calculateDistance(
        lat, 
        lng, 
        parseFloat(seaport.latitude_dd), 
        parseFloat(seaport.longitude_dd)
      );
      
      return {
        ...seaport,
        distance
      };
    }).filter(seaport => seaport !== null);
    
    // Sort by distance and get the nearest ones
    const nearestSeaports = seaportsWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
    
    console.log(`Found ${nearestSeaports.length} seaports near location [${lat}, ${lng}]`);
    return nearestSeaports;
  } catch (error) {
    console.error('Error finding nearest seaports:', error);
    return [];
  }
};

/**
 * Find the nearest ports to a given location
 * @param {number} lat - Latitude of the location
 * @param {number} lng - Longitude of the location
 * @param {number} limit - Maximum number of ports to return
 * @returns {Promise<Array>} Array of nearest ports
 */
export const getNearestPorts = async (lat, lng, limit = 3) => {
  try {
    // Use the existing API function but with type=seaport
    const response = await fetch(`/api/nearest?lat=${lat}&lng=${lng}&type=seaport&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch nearest ports');
    }
    const data = await response.json();
    
    // Sort by distance to ensure closest is first
    const ports = data.seaports || [];
    ports.sort((a, b) => a.distance - b.distance);
    
    // Add a flag to indicate which is the primary (closest) port
    if (ports.length > 0) {
      ports[0].isPrimary = true;
    }
    
    return ports;
  } catch (error) {
    console.error('Error finding nearest ports:', error);
    return [];
  }
};


/**
 * Fetch delay prediction from the API
 * @returns {Promise<number>} Predicted delay in minutes
 */
async function fetchDelayPrediction() {
  try {
    // For now, just return a random delay between 5 and 120 minutes
    const randomDelayMinutes = Math.floor(Math.random() * 115) + 5;
    return randomDelayMinutes;
  } catch (error) {
    console.error('[MULTIMODAL] Error fetching delay prediction:', error);
    return 0; // Default to no delay if there's an error
  }
}

/**
 * Enhances an edge with delay prediction information and cost
 * @param {Object} edge - The edge to enhance with delay
 * @returns {Object} Enhanced edge with delay information and cost
 */
export async function enhanceEdgeWithDelay(edge) {
  try {
    // Fetch delay prediction for this edge
    const delayMinutes = await fetchDelayPrediction();
    
    // Generate a random cost based on transportation mode
    let cost;
    if (edge.mode === 'air') {
      cost = Math.floor(Math.random() * 2001) + 1000; // Random between 1000-3000
    } else if (edge.mode === 'ship' || edge.mode === 'sea') {
      cost = Math.floor(Math.random() * 1001) + 500; // Random between 500-1500
    } else {
      // For road and other modes
      cost = Math.floor(Math.random() * 201) + 100; // Random between 100-300
    }
    
    // Add delay and cost information to the edge
    const enhancedEdge = {
      ...edge,
      delay: delayMinutes / 60, // Convert minutes to hours for consistency
      delayMinutes: delayMinutes,
      predictedDuration: edge.duration + (delayMinutes / 60),
      predictedArrivalTime: edge.arrivalTime ? 
        new Date(new Date(edge.arrivalTime).getTime() + delayMinutes * 60 * 1000).toISOString() : 
        null,
      cost: cost
    };
    
    console.log(`[MULTIMODAL] Added delay of ${delayMinutes} minutes and cost of ${cost} to ${edge.mode} edge: ${edge.source} → ${edge.target}`);
    return enhancedEdge;
  } catch (error) {
    console.error('[MULTIMODAL] Error enhancing edge with delay and cost:', error);
    return edge; // Return original edge if enhancement fails
  }
}
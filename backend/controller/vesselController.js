const axios = require('axios');
const qs = require('querystring');
const logger = require('../utils/logger');
const voyageCache = require('../utils/voyageCache');
const { getDbClient } = require('../config/db');
const { formatDateForDisplay, formatDateForAPI, formatDateYYYYMMDD } = require('../utils/dateUtils');
const { correctPortCode, getPortNameFromCode } = require('../utils/portUtils');
// Replace CommonJS require with dynamic import for the ESM module
// const { fetchMultimodalGraph } = require('../../src/services/api');

// Will dynamically import the fetchMultimodalGraph function when needed
let fetchMultimodalGraphPromise = null;

/**
 * Get nearest locations to lat/lng coordinates
 */
const getNearestLocations = async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        logger.error('NearestAPI', 'Missing required parameters: ' + JSON.stringify({ lat, lng }));
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    logger.info('NearestAPI', 'Processing nearest request for coordinates: ' + JSON.stringify({ lat, lng }));
    let client = null;

    try {
        logger.info('NearestAPI', 'Connecting to database for nearest locations...');
        client = await getDbClient();
        logger.info('NearestAPI', 'Connected to database successfully');

        const airportQuery = `
            SELECT 
                iata_code,
                airport_name,
                latitude_dd,
                longitude_dd,
                ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance
            FROM airports
            WHERE location IS NOT NULL
            ORDER BY distance ASC
            LIMIT 3
        `;

        const seaportQuery = `
            SELECT 
                world_port_index,
                main_port_name,
                latitude_dd,
                longitude_dd,
                ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance
            FROM seaports
            WHERE location IS NOT NULL
            ORDER BY distance ASC
            LIMIT 3
        `;

        const [airportsResult, seaportsResult] = await Promise.all([
            client.query(airportQuery, [lng, lat]),
            client.query(seaportQuery, [lng, lat])
        ]);

        const response = {
            airports: airportsResult.rows.map(airport => ({
                code: airport.iata_code,
                name: airport.airport_name || airport.iata_code,
                latitude_dd: parseFloat(airport.latitude_dd),
                longitude_dd: parseFloat(airport.longitude_dd),
                distance: parseFloat(airport.distance),
                type: 'airport'
            })),
            seaports: seaportsResult.rows.map(port => ({
                code: port.world_port_index,
                name: port.main_port_name || port.world_port_index,
                latitude_dd: parseFloat(port.latitude_dd),
                longitude_dd: parseFloat(port.longitude_dd),
                distance: parseFloat(port.distance),
                type: 'seaport'
            }))
        };

        logger.info('NearestAPI', `Found ${response.airports.length} airports and ${response.seaports.length} seaports near location`);
        res.json(response);
    } catch (err) {
        logger.error('NearestAPI', 'Error in nearest location query: ' + err.message);
        res.status(500).json({ 
            airports: [],
            seaports: []
        });
    } finally {
        if (client) {
            client.release();
            logger.info('NearestAPI', 'Database client released');
        }
    }
};

/**
 * Get vessel arrival information
 */
const getVesselArrival = async (req, res) => {
    try {
        const { port, startDate, endDate } = req.body;
        const response = await axios.post('https://ss.shipmentlink.com/tvs2/jsp/TVS2_VesselArrivalTimeResult.jsp', {
            queryBy: 'port',
            fmMonth: startDate.substring(4, 6),
            fmDay: startDate.substring(6, 8),
            fmYear: startDate.substring(0, 4),
            toMonth: endDate.substring(4, 6),
            toDay: endDate.substring(6, 8),
            toYear: endDate.substring(0, 4),
            fmDate: startDate,
            toDate: endDate,
            tradecode: 'ALL',
            port_name: `COCHIN (${port}) [ZIP:682001]`,
            port: port,
            line: '',
            vessel_voyage: '',
            vessel_voyage_hidden: '',
            queryByAfterSubmit: 'port',
            usa_io: '',
            sort: '1',
            sort_Sailing: '1',
            sort_US: '1',
            sort_CA: '1',
            sort_MX: '1',
            sort_CN: '1',
            sort_EU: '1',
            sort_JP: '1',
            thisPage: 'Vessel Sailing Schedule',
            nowPage: '1'
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        res.send(response.data);
    } catch (error) {
        logger.error('VesselArrival', 'Error in vessel-arrival route: ' + error.message);
        res.status(500).send('Error fetching vessel arrival data');
    }
};

/**
 * Get vessel details
 */
const getVesselDetail = async (req, res) => {
    try {
        const { url, params, resolve } = req.body;
        
        const queryString = Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        const response = await axios.get(`${url}?${queryString}`, {
            headers: {
                'Host': resolve.host,
                'Connection': 'keep-alive'
            },
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        });
        
        res.send(response.data);
    } catch (error) {
        logger.error('VesselDetail', 'Error in vessel-detail route: ' + error.message);
        res.status(500).send('Error fetching vessel detail data');
    }
};

/**
 * Get port coordinates by code
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPortCoordinates = async (req, res) => {
  try {
    console.log('=== PORT COORDINATES LOOKUP ===');
    console.log('getPortCoordinates called with query:', req.query);
    console.log('Request headers:', req.headers);
    
    // Handle both comma-separated string and array formats
    let portCodes = req.query.codes;
    
    if (!portCodes) {
      console.error('Missing required parameter: codes');
      return res.status(400).json({ 
        error: 'Missing required parameter: codes',
        message: 'Please provide port codes as a comma-separated list or array'
      });
    }
    
    // Convert to array if it's a string
    if (typeof portCodes === 'string') {
      portCodes = portCodes.split(',').map(code => code.trim()).filter(Boolean);
    }
    
    console.log(`Processing ${portCodes.length} port codes:`, portCodes);
    
    if (!Array.isArray(portCodes) || portCodes.length === 0) {
      console.error('Invalid port codes format:', portCodes);
      return res.status(400).json({ 
        error: 'Invalid port codes format',
        message: 'Port codes must be provided as a non-empty array or comma-separated string'
      });
    }
    
    // Debug database connection
    if (!req.db) {
      console.error('Database connection not available in request');
      
      // Check if we're using the middleware properly
      console.log('Request object keys:', Object.keys(req));
      console.log('app.locals keys (if available):', req.app && req.app.locals ? Object.keys(req.app.locals) : 'Not available');
      
      return res.status(500).json({ 
        error: 'Database connection error',
        message: 'Could not connect to the database. Database connection not available in request.'
      });
    }
    
    // First, let's check the database structure to understand what tables and columns exist
    console.log('Checking database tables structure...');
    try {
      // Query to get table columns from the specific table
      const tableInfoQuery = `
        SELECT 
          column_name, 
          data_type, 
          is_nullable
        FROM 
          information_schema.columns 
        WHERE 
          table_name = 'seaports' 
        ORDER BY 
          ordinal_position;
      `;
      
      const tableInfo = await req.db.query(tableInfoQuery);
      console.log('Table structure for "seaports" table:', tableInfo.rows);
      
      if (tableInfo.rows.length === 0) {
        // If no results, the table might not exist or have a different name
        console.log('Checking all tables in database...');
        const allTablesQuery = `
          SELECT 
            table_name 
          FROM 
            information_schema.tables 
          WHERE 
            table_schema = 'public'
          ORDER BY 
            table_name;
        `;
        
        const allTables = await req.db.query(allTablesQuery);
        console.log('Available tables in database:', allTables.rows.map(row => row.table_name));
        
        // Look for tables that might contain port information
        const potentialPortTables = allTables.rows
          .filter(row => /port|seaport|location/i.test(row.table_name))
          .map(row => row.table_name);
          
        if (potentialPortTables.length > 0) {
          console.log('Potential port-related tables found:', potentialPortTables);
          
          // Check the first potential table structure
          if (potentialPortTables.length > 0) {
            const firstTableColumns = await req.db.query(`
              SELECT 
                column_name, 
                data_type 
              FROM 
                information_schema.columns 
              WHERE 
                table_name = '${potentialPortTables[0]}'
              ORDER BY 
                ordinal_position;
            `);
            
            console.log(`Columns for table "${potentialPortTables[0]}":`, firstTableColumns.rows);
          }
        }
      }
    } catch (schemaError) {
      console.error('Error querying database schema:', schemaError);
    }
    
    // Prepare placeholders for the SQL query
    const placeholders = portCodes.map((_, index) => `$${index + 1}`).join(',');
    
    // Adjust the query based on the table discovery above
    // Using a more flexible query that tries different column names
    const query = `
      SELECT 
        world_port_index AS code,
        main_port_name AS name,
        latitude_dd,
        longitude_dd
      FROM 
        seaports
      WHERE 
        world_port_index IN (${placeholders})
    `;
    
    console.log('Executing SQL query:', query);
    console.log('With parameters:', portCodes);
    
    // Debug query execution
    const result = await req.db.query(query, portCodes);
    
    console.log(`Query result rows: ${result.rows.length}, columns: ${result.fields ? result.fields.length : 'unknown'}`);
    if (result.rows.length > 0) {
      console.log('First result row:', result.rows[0]);
    } else {
      console.log('No rows returned from query');
    }
    
    // If no ports were found, log a warning but still return an empty array
    if (result.rows.length === 0) {
      console.warn(`No coordinates found for any of the requested port codes: ${portCodes.join(', ')}`);
      
      // Try a simple count query to verify database connectivity and table existence
      try {
        const countQuery = 'SELECT COUNT(*) FROM seaports';
        const countResult = await req.db.query(countQuery);
        console.log('Total seaports in database:', countResult.rows[0].count);
        
        // Check a random record to see structure
        const sampleQuery = 'SELECT * FROM seaports LIMIT 1';
        const sampleResult = await req.db.query(sampleQuery);
        if (sampleResult.rows.length > 0) {
          console.log('Sample seaport record:', sampleResult.rows[0]);
        }
      } catch (countError) {
        console.error('Error checking seaports count:', countError);
      }
    } else if (result.rows.length < portCodes.length) {
      // Log which ports were not found
      const foundCodes = result.rows.map(row => row.code);
      const missingCodes = portCodes.filter(code => !foundCodes.includes(code));
      console.warn(`Missing coordinates for ports: ${missingCodes.join(', ')}`);
    }
    
    console.log('Sending response with', result.rows.length, 'ports');
    res.json(result.rows);
  } catch (error) {
    console.error('Error retrieving port coordinates:', error);
    res.status(500).json({ 
      error: 'Database query failed', 
      message: error.message,
      detail: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  console.log('=== PORT COORDINATES LOOKUP COMPLETED ===');
};

/**
 * Get multimodal transport graph
 */
const getMultimodalGraph = async (req, res) => {
    try {
        const { origin, destination, startDate } = req.body;
        console.log('Received request for multimodal graph:', { origin, destination, startDate });

        if (!origin || !destination) {
            return res.status(400).json({ error: 'Origin and destination are required.' });
        }

        // Dynamically import the fetchMultimodalGraph function
        if (!fetchMultimodalGraphPromise) {
            fetchMultimodalGraphPromise = import('../../src/services/api')
                .then(module => module.fetchMultimodalGraph);
        }
        
        const fetchMultimodalGraph = await fetchMultimodalGraphPromise;
        const graph = await fetchMultimodalGraph(origin, destination, new Date(startDate));
        res.json(graph);
    } catch (error) {
        console.error('Error generating multimodal graph:', error);
        res.status(500).json({ error: 'Failed to generate multimodal graph.' });
    }
};

/**
 * Get intermediate ship routes for a given path
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getIntermediateShipRoutes = async (req, res) => {
    try {
        const { path, startDate } = req.body;
        
        // Validate input
        if (!path || !Array.isArray(path) || path.length < 3) {
            return res.status(400).json({
                success: false,
                message: "Invalid path. Must be an array with at least 3 points."
            });
        }
        
        // Extract start and end points
        const startPoint = path[0];
        const endPoint = path[path.length - 1];
        const intermediatePoints = path.slice(1, -1);
        
        console.log(`Finding intermediate ship routes from ${startPoint} to ${endPoint} via ${intermediatePoints.join(', ')}`);
        
        // Format the start date for API calls
        let formattedStartDate = startDate;
        
        // Ensure the date is in YYYY-MM-DD format
        if (startDate) {
            if (startDate.includes('T')) {
                // If it has a timestamp, extract just the date part
                formattedStartDate = startDate.split('T')[0];
            } else if (startDate.includes('+')) {
                // If it has timezone, extract just the date part
                formattedStartDate = startDate.split('+')[0];
            }
            // Otherwise use as is (assuming it's already in YYYY-MM-DD format)
        }
        
        console.log(`Using formatted start date: ${formattedStartDate}`);
        
        // First, fetch the main route from start to end to get arrival times at intermediate ports
        console.log(`Fetching main route from ${startPoint} to ${endPoint} to get intermediate port arrival times`);
        const mainRoute = await fetchShipRoutesFromHapagLloyd(startPoint, endPoint, formattedStartDate);
        
        if (!mainRoute || mainRoute.error) {
            console.error('Error fetching main route:', mainRoute?.error || 'Unknown error');
            return res.status(500).json({
                error: `Error fetching main route: ${mainRoute?.error || 'Unknown error'}`
            });
        }
        
        // Extract arrival times at intermediate ports from the main route
        const intermediatePortArrivalTimes = {};
        
        // Process the main route to extract arrival times at intermediate ports
        if (mainRoute.routeTree && mainRoute.routeTree.voyages) {
            // For each voyage in the main route
            mainRoute.routeTree.voyages.forEach(voyage => {
                // Check if this voyage has a schedule with multiple stops
                if (voyage.schedule && voyage.schedule.length > 2) {
                    // For each intermediate point in the path
                    for (let i = 1; i < voyage.schedule.length - 1; i++) {
                        const stop = voyage.schedule[i];
                        const portCode = stop.port;
                        
                        // If this is an intermediate port we're interested in
                        if (intermediatePoints.includes(portCode)) {
                            // Store the arrival time at this port
                            if (!intermediatePortArrivalTimes[portCode]) {
                                intermediatePortArrivalTimes[portCode] = [];
                            }
                            
                            // Add the arrival time if it exists
                            if (stop.eta) {
                                intermediatePortArrivalTimes[portCode].push({
                                    arrivalTime: stop.eta,
                                    voyage: voyage
                                });
                                console.log(`Found arrival time at ${portCode}: ${stop.eta}`);
                            }
                        }
                    }
                }
            });
        }
        
        // Log all intermediate ports and their arrival times
        console.log('Intermediate ports and their arrival times:');
        for (const [port, arrivals] of Object.entries(intermediatePortArrivalTimes)) {
            console.log(`${port}: ${arrivals.length} arrival times found`);
            arrivals.forEach((arrival, index) => {
                console.log(`  ${index + 1}. ${arrival.arrivalTime} (from voyage ${arrival.voyage.voyage})`);
            });
        }
        
        // Fetch ship routes for each intermediate point to the end point
        const intermediateRoutes = {};
        
        // For each intermediate point
        for (let i = 0; i < intermediatePoints.length; i++) {
            const intermediatePoint = intermediatePoints[i];
            
            // Determine the departure date for this intermediate point
            let departureDate = formattedStartDate;
            
            // If we have arrival times for this intermediate point, use the earliest one
            if (intermediatePortArrivalTimes[intermediatePoint] && intermediatePortArrivalTimes[intermediatePoint].length > 0) {
                // Sort arrival times chronologically
                const sortedArrivals = [...intermediatePortArrivalTimes[intermediatePoint]].sort((a, b) => {
                    const dateA = new Date(a.arrivalTime);
                    const dateB = new Date(b.arrivalTime);
                    return dateA - dateB;
                });
                
                // Use the earliest arrival time as the departure date for the next leg
                const earliestArrival = sortedArrivals[0].arrivalTime;
                console.log(`Using earliest arrival time at ${intermediatePoint} (${earliestArrival}) as departure date for next leg`);
                
                // Parse the arrival time and format it for the API
                const arrivalDate = new Date(earliestArrival);
                if (!isNaN(arrivalDate.getTime())) {
                    departureDate = formatDateYYYYMMDD(arrivalDate);
                    console.log(`Formatted departure date for ${intermediatePoint}: ${departureDate}`);
                }
            }
            
            console.log(`Fetching routes from ${intermediatePoint} to ${endPoint} with date ${departureDate}`);
            
            try {
                const routes = await fetchShipRoutesFromHapagLloyd(intermediatePoint, endPoint, departureDate);
                console.log(`Routes from ${intermediatePoint} to ${endPoint}:`, JSON.stringify(routes, null, 2));
                
                if (routes && !routes.error) {
                    // Store the routes for this intermediate point
                    intermediateRoutes[intermediatePoint] = routes;
                    
                    // If we have a complete graph, add these routes to it
                    if (completeGraph) {
                        // Add the routes to the complete graph
                        if (!completeGraph[intermediatePoint]) {
                            completeGraph[intermediatePoint] = [];
                        }
                        
                        // Add each voyage to the graph
                        if (routes.routeTree && routes.routeTree.voyages) {
                            routes.routeTree.voyages.forEach(voyage => {
                                completeGraph[intermediatePoint].push(voyage);
                            });
                        }
                    }
                } else {
                    console.log(`No routes found from ${intermediatePoint} to ${endPoint}`);
                }
            } catch (error) {
                console.error(`Error fetching routes from ${intermediatePoint} to ${endPoint}:`, error);
                // Continue with the next intermediate point
            }
        }
        
        // Return the result
        const result = {
            path,
            intermediatePortArrivalTimes,
            intermediateRoutes,
            completeGraph: completeGraph || null
        };
        
        console.log('Intermediate routes result:', JSON.stringify(result, null, 2));
        
        return res.json(result);
    } catch (error) {
        console.error('Error in getIntermediateShipRoutes:', error);
        return res.status(500).json({
            error: `Error finding intermediate ship routes: ${error.message}`
        });
    }
};

/**
 * Fetches ship routes from the Hapag-Lloyd API
 * @param {string} startPort - The starting port code
 * @param {string} endPort - The destination port code
 * @param {string} startDate - The start date in YYYY-MM-DD format
 * @returns {Promise<Object>} - The ship routes data
 */
const fetchShipRoutesFromHapagLloyd = async (startPort, endPort, startDate) => {
    try {
        console.log(`Fetching ship routes from ${startPort} to ${endPort} starting from ${startDate}`);
        
        // Ensure the date is in YYYY-MM-DD format
        let formattedDate = startDate;
        if (startDate) {
            if (startDate.includes('T')) {
                // If it has a timestamp, extract just the date part
                formattedDate = startDate.split('T')[0];
            } else if (startDate.includes('+')) {
                // If it has timezone, extract just the date part
                formattedDate = startDate.split('+')[0];
            }
            // Otherwise use as is (assuming it's already in YYYY-MM-DD format)
        }
        
        console.log(`Using formatted date for API call: ${formattedDate}`);
        
        // Make the API call to Hapag-Lloyd
        const response = await axios.get(`${process.env.HAPAG_LLOYD_API_URL}/routes`, {
            params: {
                origin: startPort,
                destination: endPort,
                date: formattedDate
            },
            headers: {
                'Authorization': `Bearer ${process.env.HAPAG_LLOYD_API_KEY}`
            }
        });
        
        console.log('Raw Hapag-Lloyd API response:', JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        console.error('Error fetching ship routes from Hapag-Lloyd:', error.message);
        if (error.response) {
            console.error('API response error:', error.response.data);
        }
        throw error;
    }
};

/**
 * Transform Hapag-Lloyd API response to match the expected format
 * @param {Object} data - Raw response from Hapag-Lloyd API
 * @param {string} startPort - Starting port code
 * @param {string} endPort - Ending port code
 * @returns {Object} Transformed data in the expected format
 */
const transformHapagLloydResponse = (data, startPort, endPort) => {
    try {
        // If there's an error in the response, return it
        if (data.error) {
            return { error: data.error };
        }
        
        // Initialize the result object
        const result = {
            routeTree: {
                port: startPort,
                portName: getPortNameFromCode(startPort) || startPort,
                voyages: []
            },
            graph: {},
            completeRoutes: [],
            stats: {
                portsProcessed: 0,
                maxDepth: 0,
                processingTime: 0,
                totalRoutes: 0
            }
        };
        
        // If there are no routes, return the empty result
        if (!data.routes || data.routes.length === 0) {
            return result;
        }
        
        // Process each route
        data.routes.forEach(route => {
            // Log the route for debugging
            console.log('Processing route:', JSON.stringify(route, null, 2));
            
            // Check if this route has legs
            if (route.legs && route.legs.length > 0) {
                console.log('Route has legs:', route.legs.length);
                
                // Process each leg
                route.legs.forEach((leg, legIndex) => {
                    console.log(`Processing leg ${legIndex + 1}:`, JSON.stringify(leg, null, 2));
                    
                    // Extract departure and arrival information
                    const departurePort = leg.departureLocation?.unLocationCode || startPort;
                    const departurePortName = leg.departureLocation?.locationName || getPortNameFromCode(departurePort) || departurePort;
                    const arrivalPort = leg.arrivalLocation?.unLocationCode || endPort;
                    const arrivalPortName = leg.arrivalLocation?.locationName || getPortNameFromCode(arrivalPort) || arrivalPort;
                    
                    // Format dates properly
                    let departureTime = '';
                    let arrivalTime = '';
                    
                    // Check for departure date in various fields
                    if (leg.departureDateTime) {
                        console.log('Departure date from departureDateTime:', leg.departureDateTime);
                        const departureDate = new Date(leg.departureDateTime);
                        if (!isNaN(departureDate.getTime())) {
                            departureTime = formatDateForDisplay(departureDate);
                            console.log('Formatted departure time:', departureTime);
                        }
                    }
                    
                    if (leg.arrivalDateTime) {
                        console.log('Arrival date from arrivalDateTime:', leg.arrivalDateTime);
                        const arrivalDate = new Date(leg.arrivalDateTime);
                        if (!isNaN(arrivalDate.getTime())) {
                            arrivalTime = formatDateForDisplay(arrivalDate);
                            console.log('Formatted arrival time:', arrivalTime);
                        }
                    }
                    
                    // Extract vessel information
                    const shipId = leg.vesselDetails?.imoNumber || '';
                    const shipName = leg.vesselDetails?.name || '';
                    const voyageNumber = leg.voyageNumber || leg.scheduleVoyageNumber || '';
                    
                    // Create a voyage object for this leg
                    const voyage = {
                        shipId,
                        shipName,
                        voyage: voyageNumber,
                        departurePort,
                        departurePortName,
                        departureTime,
                        arrivalPort,
                        arrivalPortName,
                        arrivalTime,
                        duration: leg.transitTimeInDays || 0,
                        destinationPorts: [arrivalPort]
                    };
                    
                    // Add the voyage to the route tree if this is the first leg
                    if (legIndex === 0) {
                        result.routeTree.voyages.push(voyage);
                    }
                    
                    // Create a schedule for this leg
                    const schedule = [
                        {
                            port: departurePort,
                            portName: departurePortName,
                            etd: departureTime,
                            eta: ''
                        },
                        {
                            port: arrivalPort,
                            portName: arrivalPortName,
                            etd: '',
                            eta: arrivalTime
                        }
                    ];
                    
                    // Add the schedule to the voyage
                    voyage.schedule = schedule;
                    
                    // Add the voyage to the graph
                    if (!result.graph[departurePort]) {
                        result.graph[departurePort] = [];
                    }
                    
                    result.graph[departurePort].push(voyage);
                    
                    // If this is the last leg, create a complete route
                    if (legIndex === route.legs.length - 1) {
                        const completeRoute = {
                            path: [startPort, endPort],
                            totalDuration: route.transitTimeInDays || 0,
                            voyages: [voyage]
                        };
                        
                        // Add the complete route to the result
                        result.completeRoutes.push(completeRoute);
                    }
                });
            } else {
                // Handle routes without legs (legacy format)
                // Format dates properly
                let departureTime = '';
                let arrivalTime = '';
                
                // Check if the route has departure and arrival dates
                if (route.departureDate) {
                    console.log('Departure date from API:', route.departureDate);
                    // Parse the departure date
                    const departureDate = new Date(route.departureDate);
                    if (!isNaN(departureDate.getTime())) {
                        departureTime = formatDateForDisplay(departureDate);
                        console.log('Formatted departure time:', departureTime);
                    }
                }
                
                if (route.arrivalDate) {
                    console.log('Arrival date from API:', route.arrivalDate);
                    // Parse the arrival date
                    const arrivalDate = new Date(route.arrivalDate);
                    if (!isNaN(arrivalDate.getTime())) {
                        arrivalTime = formatDateForDisplay(arrivalDate);
                        console.log('Formatted arrival time:', arrivalTime);
                    }
                }
                
                // If we don't have departure or arrival times, try to extract them from other fields
                if (!departureTime && route.departure) {
                    console.log('Using departure field:', route.departure);
                    const departureDate = new Date(route.departure);
                    if (!isNaN(departureDate.getTime())) {
                        departureTime = formatDateForDisplay(departureDate);
                        console.log('Formatted departure time from departure field:', departureTime);
                    }
                }
                
                if (!arrivalTime && route.arrival) {
                    console.log('Using arrival field:', route.arrival);
                    const arrivalDate = new Date(route.arrival);
                    if (!isNaN(arrivalDate.getTime())) {
                        arrivalTime = formatDateForDisplay(arrivalDate);
                        console.log('Formatted arrival time from arrival field:', arrivalTime);
                    }
                }
                
                // If we still don't have departure or arrival times, try to extract them from other fields
                if (!departureTime && route.originDeparture) {
                    console.log('Using originDeparture field:', route.originDeparture);
                    const departureDate = new Date(route.originDeparture);
                    if (!isNaN(departureDate.getTime())) {
                        departureTime = formatDateForDisplay(departureDate);
                        console.log('Formatted departure time from originDeparture field:', departureTime);
                    }
                }
                
                if (!arrivalTime && route.destinationArrival) {
                    console.log('Using destinationArrival field:', route.destinationArrival);
                    const arrivalDate = new Date(route.destinationArrival);
                    if (!isNaN(arrivalDate.getTime())) {
                        arrivalTime = formatDateForDisplay(arrivalDate);
                        console.log('Formatted arrival time from destinationArrival field:', arrivalTime);
                    }
                }
                
                // Extract voyage information
                const voyage = {
                    shipId: route.vesselId || '',
                    shipName: route.vesselName || '',
                    voyage: route.voyageNumber || '',
                    departurePort: route.originLocation || startPort,
                    departurePortName: route.originLocationName || getPortNameFromCode(route.originLocation) || route.originLocation,
                    departureTime: departureTime,
                    arrivalPort: route.destinationLocation || endPort,
                    arrivalPortName: route.destinationLocationName || getPortNameFromCode(route.destinationLocation) || route.destinationLocation,
                    arrivalTime: arrivalTime,
                    duration: route.transitTime || 0,
                    destinationPorts: [endPort]
                };
                
                // Add the voyage to the route tree
                result.routeTree.voyages.push(voyage);
                
                // Create a complete route
                const completeRoute = {
                    path: [startPort, endPort],
                    totalDuration: route.transitTime || 0,
                    voyages: [voyage]
                };
                
                // Add the complete route to the result
                result.completeRoutes.push(completeRoute);
                
                // Update the graph
                if (!result.graph[startPort]) {
                    result.graph[startPort] = [];
                }
                
                result.graph[startPort].push(voyage);
            }
        });
        
        // Update stats
        result.stats.portsProcessed = 2; // Start and end ports
        result.stats.maxDepth = 1; // Direct route
        result.stats.totalRoutes = result.completeRoutes.length;
        
        return result;
    } catch (error) {
        logger.error('HapagLloydAPI', `Error transforming Hapag-Lloyd response: ${error.message}`);
        return { error: `Error transforming response: ${error.message}` };
    }
};

module.exports = {
    getNearestLocations,
    getVesselArrival,
    getVesselDetail,
    getPortCoordinates,
    getMultimodalGraph,
    getIntermediateShipRoutes
}; 

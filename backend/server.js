const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');
const CathayCargo = require('./CathayCargoApiExtractor');
const { parse } = require('node-html-parser');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const { exec } = require('child_process');
const cheerio = require('cheerio');
const csv = require('csv-parser');
const moment = require('moment');
const { hapagLloydController } = require('./controller/hapagLloydController');

const app = express();
const port = 3000;
global.Token =""

// Data paths for processed files
const PROCESSED_ROUTES_PATH = path.join(__dirname, 'data', 'processed_routes.json');
const PROCESSED_SHIPPING_PATH = path.join(__dirname, 'data', 'processed_shipping.json');

// Cache for processed data
let processedRoutesData = null;
let processedShippingData = null;

// Load processed data
function loadProcessedData() {
  try {
    if (fs.existsSync(PROCESSED_ROUTES_PATH)) {
      processedRoutesData = JSON.parse(fs.readFileSync(PROCESSED_ROUTES_PATH, 'utf8'));
      console.log(`Loaded ${processedRoutesData.stats.unique_routes} unique flight routes and ${processedRoutesData.stats.total_airports} airports`);
    } else {
      console.warn('Processed routes data file not found. API will use fallback data.');
    }
    
    if (fs.existsSync(PROCESSED_SHIPPING_PATH)) {
      processedShippingData = JSON.parse(fs.readFileSync(PROCESSED_SHIPPING_PATH, 'utf8'));
      console.log(`Loaded ${processedShippingData.stats.total_routes} shipping routes and ${processedShippingData.stats.total_ports} ports`);
    } else {
      console.warn('Processed shipping data file not found. API will use fallback data.');
    }
  } catch (err) {
    console.error('Error loading processed data:', err);
  }
}

// Call this on server startup
loadProcessedData();

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

const log = {
    info: (context, message) => console.log(`[${new Date().toISOString()}] [${context}] ${message}`),
    warn: (context, message) => console.warn(`[${new Date().toISOString()}] [${context}] WARN: ${message}`),
    error: (context, message) => console.error(`[${new Date().toISOString()}] [${context}] ERROR: ${message}`),
    debug: (context, message) => process.env.DEBUG && console.debug(`[${new Date().toISOString()}] [${context}] DEBUG: ${message}`)
};

const voyageCache = {
    data: {},
    
    getKey(port, startDate, endDate) {
        return `${port}-${startDate}-${endDate}`;
    },
    
    get(port, startDate, endDate) {
        const key = this.getKey(port, startDate, endDate);
        const cachedData = this.data[key];
        if (cachedData) {
            console.log(`[Cache] HIT for key: ${key} (${cachedData.length} voyages)`);
            return cachedData;
        }
        console.log(`[Cache] MISS for key: ${key}`);
        return undefined;
    },
    
    set(port, startDate, endDate, voyages) {
        const key = this.getKey(port, startDate, endDate);
        console.log(`[Cache] Setting data for key: ${key} (${voyages.length} voyages)`);
        

        const cleanVoyages = voyages.map(voyage => {

            return {
                shipId: this.cleanText(voyage.shipId),
                shipName: this.cleanText(voyage.shipName),
                voyage: this.cleanText(voyage.voyage),
                fromPort: voyage.fromPort,
                fromPortName: this.cleanText(voyage.fromPortName),
                toPort: voyage.toPort,
                toPortName: this.cleanText(voyage.toPortName),
                departureTime: voyage.departureTime,
                arrivalTime: voyage.arrivalTime,
                schedule: voyage.schedule ? voyage.schedule.map(stop => ({
                    port: stop.port,
                    portName: this.cleanText(stop.portName),
                    eta: stop.eta,
                    etd: stop.etd
                })) : [],
                isFallback: voyage.isFallback || false
            };
        });
        
        this.data[key] = cleanVoyages;
        

        this.saveToFile();
    },
    

    cleanText(text) {
        if (!text) return '';
        text = String(text);
        return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    },
    
    saveToFile() {
        const cachePath = path.join(__dirname, 'voyage-cache.json');
        try {
            fs.writeFileSync(cachePath, JSON.stringify(this.data, null, 2), 'utf8');
            console.log(`[Cache] Saved voyage cache (${Object.keys(this.data).length} entries) to ${cachePath}`);
        } catch (error) {
            console.error(`[Cache] ERROR saving voyage cache to ${cachePath}:`, error.message);
        }
    },
    
    loadFromFile() {
        const cachePath = path.join(__dirname, 'voyage-cache.json');
        try {
            if (fs.existsSync(cachePath)) {
                console.log(`[Cache] Attempting to load voyage cache from ${cachePath}`);
                const cacheData = fs.readFileSync(cachePath, 'utf8');
                

                if (!cacheData || cacheData.trim() === '') {
                    console.warn(`[Cache] WARN: Cache file ${cachePath} is empty. Starting with empty cache.`);
                    this.data = {};
                    return;
                }
                
                this.data = JSON.parse(cacheData);
                console.log(`[Cache] Successfully loaded voyage cache from ${cachePath} with ${Object.keys(this.data).length} entries.`);
                

                console.log('[Cache] Loaded data summary:');
                Object.keys(this.data).forEach(key => {
                    const [port, startDate, endDate] = key.split('-');
                    console.log(`  - ${port} [${startDate} to ${endDate}]: ${this.data[key].length} voyages`);
                });
            } else {
                console.log(`[Cache] No cache file found at ${cachePath}. Starting with empty cache.`);
                this.data = {};
            }
        } catch (error) {
            console.error(`[Cache] ERROR loading voyage cache from ${cachePath}:`, error.message);

            if (error instanceof SyntaxError) {
                console.error(`[Cache] Cache file appears corrupted. Consider deleting it and restarting.`);
                console.warn(`[Cache] Starting with an empty cache due to parsing error.`);
            } else {
                console.warn(`[Cache] Starting with an empty cache due to loading error.`);
            }
            this.data = {};
        }
    }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up Hapag-Lloyd controller routes
app.post('/api/hapag-lloyd/search', hapagLloydController.searchHapagRoutes);

// Add POST endpoint for hapag-routes to connect the frontend to the controller
app.post('/api/hapag-routes', hapagLloydController.searchHapagRoutes);

// Test endpoint to directly access Hapag-Lloyd API
app.get('/api/hapag-lloyd/test', async (req, res) => {
  const { startPort, endPort, startDate } = req.query;
  
  if (!startPort || !endPort) {
    return res.status(400).json({ error: 'Both startPort and endPort are required' });
  }
  
  try {
    // Format date if provided, otherwise use today
    let formattedDate = new Date().toISOString().split('T')[0];
    if (startDate) {
      // Convert from YYYYMMDD to YYYY-MM-DD
      const year = startDate.substring(0, 4);
      const month = startDate.substring(4, 6);
      const day = startDate.substring(6, 8);
      formattedDate = `${year}-${month}-${day}`;
    }
    
    // Make direct request to Hapag-Lloyd API
    const result = await hapagLloydController.searchHapagRoutes({
      body: {
        startLocation: startPort,
        endLocation: endPort,
        startDate: formattedDate,
        containerType: "45GP"
      }
    }, res);
    
    // Note: The controller will handle sending the response
  } catch (error) {
    console.error('Error testing Hapag-Lloyd API:', error);
    res.status(500).json({ error: error.message });
  }
});

const dbConfig = {
    user: 'postgres.vsmqelrvrqyjgevdovkv',
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    database: 'postgres',
    password: 'SupaBaseAsh@223',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000,
    query_timeout: 20000,
    idleTimeoutMillis: 30000,
    max: 10,
    min: 2,
    idle_in_transaction_session_timeout: 30000
};


const pool = new Pool(dbConfig);


pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
    console.log('New client connected to connection pool');
});

// Helper function to get database client
async function getDbClient() {
    try {
        const client = await pool.connect();
        console.log('Connected to database successfully');
        return client;
    } catch (err) {
        console.error('Error connecting to database:', err);
        throw err;
    }
}

app.get('/api/nearest', async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        console.error('Missing required parameters:', { lat, lng });
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    console.log('Processing nearest request for coordinates:', { lat, lng });
    let client = null;

    try {

        console.log('Connecting to database for nearest locations...');
        client = await getDbClient();
        console.log('Connected to database successfully');

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

        console.log('Executing queries with coordinates:', { lat, lng });
        const [airportResults, seaportResults] = await Promise.all([
            client.query(airportQuery, [lng, lat]),
            client.query(seaportQuery, [lng, lat])
        ]);

        console.log('Queries executed successfully');
        console.log(`Found ${airportResults.rows.length} airports and ${seaportResults.rows.length} seaports`);

        const response = {
            airports: airportResults.rows.map(airport => ({
                code: airport.iata_code,
                name: airport.airport_name || airport.iata_code,
                latitude_dd: parseFloat(airport.latitude_dd),
                longitude_dd: parseFloat(airport.longitude_dd),
                distance: parseFloat(airport.distance),
                type: 'airport'
            })),
            seaports: seaportResults.rows.map(port => ({
                code: port.world_port_index,
                name: port.main_port_name || port.world_port_index,
                latitude_dd: parseFloat(port.latitude_dd),
                longitude_dd: parseFloat(port.longitude_dd),
                distance: parseFloat(port.distance),
                type: 'seaport'
            }))
        };

        console.log('Sending response with:', {
            airportsCount: response.airports.length,
            seaportsCount: response.seaports.length
        });
        
        res.json(response);
    } catch (err) {
        console.error("Database query error:", err);

        res.json({
            airports: [],
            seaports: []
        });
    } finally {
        if (client) {
            try {

                client.release();
                console.log('Database client released back to pool');
            } catch (err) {
                console.error('Error releasing database client:', err);
            }
        }
    }
});


app.post('/api/vessel-arrival', async (req, res) => {
    try {
        const { port, startDate, endDate, page = 1 } = req.body;
        
        console.log(`[VesselArrival] REQUEST: Port=${port}, Dates=${startDate}-${endDate}, Page=${page}`);
        
        if (!port || !startDate || !endDate) {
            console.error('[VesselArrival] ERROR: Missing required parameters:', { port, startDate, endDate });
            return res.status(400).json({ error: 'Missing required parameters' });
        }


        const httpsAgent = new (require('https').Agent)({
            rejectUnauthorized: false,
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 1,
            maxFreeSockets: 1
        });

        console.log(`[VesselArrival] FETCH: Requesting page ${page} for port ${port}`);
        

        const formData = new URLSearchParams();
        

        const correctedPort = correctPortCode(port);
        console.log(`[VesselArrival] Using port code: ${correctedPort} (original: ${port})`);
        

        formData.append('queryBy', 'port');
        formData.append('fmMonth', startDate.substring(4, 6));
        formData.append('fmDay', startDate.substring(6, 8));
        formData.append('fmYear', startDate.substring(0, 4));
        formData.append('toMonth', endDate.substring(4, 6));
        formData.append('toDay', endDate.substring(6, 8));
        formData.append('toYear', endDate.substring(0, 4));
        formData.append('fmDate', startDate);
        formData.append('toDate', endDate);
        formData.append('tradecode', 'ALL');
        formData.append('port', correctedPort);
        formData.append('line', '');
        formData.append('vessel_voyage', '');
        formData.append('vessel_voyage_hidden', '');
        formData.append('queryByAfterSubmit', 'port');
        formData.append('usa_io', '');
        

        formData.append('sort', '1');
        formData.append('sort_Sailing', '1');
        formData.append('sort_US', '1');
        formData.append('sort_CA', '1');
        formData.append('sort_MX', '1');
        formData.append('sort_CN', '1');
        formData.append('sort_EU', '1');
        formData.append('sort_JP', '1');
        

        formData.append('thisPage', 'Vessel Sailing Schedule');
        

        const pageStr = page.toString();
        formData.append('nowPage', pageStr);
        

        formData.append('_nocache', Date.now().toString());
        

        console.log(`[VesselArrival] PARAMS: ${formData.toString()}`);
        

        const delay = Math.floor(Math.random() * 2000) + 1000;
        console.log(`[VesselArrival] DELAY: Waiting ${delay}ms before request`);
        await new Promise(resolve => setTimeout(resolve, delay));
        

        const url = 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_VesselArrivalTimeResult.jsp';
        
        const response = await axios.post(url, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Origin': 'https://ss.shipmentlink.com',
                'Referer': 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_VesselArrivalTime.jsp',
                'Connection': 'keep-alive',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'DNT': '1'
            },
            httpsAgent, 
            timeout: 60000,
            maxRedirects: 5
        });
        

        const responseSize = response.data.length;
        console.log(`[VesselArrival] RECEIVED: Page ${page} response, size=${responseSize} bytes, status=${response.status}`);
        

        try {
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM(response.data);
            const document = dom.window.document;
            

            const paginationDivs = document.querySelectorAll('.pagination');
            const paginationLinks = document.querySelectorAll('a');
            

            const hasNextLink = Array.from(paginationLinks).some(link => 
                link.textContent.includes('Next') && !link.classList.contains('disabled'));
            
            const hasPrevLink = Array.from(paginationLinks).some(link => 
                link.textContent.includes('Prev') && !link.classList.contains('disabled'));
            
            console.log(`[VesselArrival] PAGINATION: Next link: ${hasNextLink ? 'Found' : 'Not found'}, Prev link: ${hasPrevLink ? 'Found' : 'Not found'}`);
            

            const sailingDiv = document.querySelector('#Sailing');
            const tables = sailingDiv ? sailingDiv.querySelectorAll('table') : [];
            console.log(`[VesselArrival] TABLES: Found ${tables.length} tables in the response`);
            

            const pageIndicators = Array.from(paginationLinks)
                .filter(link => !isNaN(parseInt(link.textContent.trim())))
                .map(link => parseInt(link.textContent.trim()));
            
            if (pageIndicators.length > 0) {
                console.log(`[VesselArrival] PAGE_INDICATORS: Found page numbers ${pageIndicators.join(', ')}`);
            }
        } catch (parseError) {
            console.error('[VesselArrival] PARSE_ERROR: Failed to parse pagination info:', parseError.message);
        }
        
        
        
        res.send(response.data);
    } catch (error) {
        console.error('[VesselArrival] ERROR:', error.message);

        res.status(500).send('<html><body><div id="Sailing"><table><tr><td>No data available due to connectivity issues</td></tr></table></div></body></html>');
    }
});


app.post("/api/air-cargo", async (req, res) => {
  const { origin, destination, flightDate, debug } = req.body;

  if (global.Token === ""){
    const cargo = new CathayCargo();
    global.Token = await cargo.getApiToken();
    global.Token = global.Token["access_token"]
    console.log(global.Token)

    console.log("No tokens found FETCH new Token_key")
  }

  const url = "https://api.cathaypacific.com/cargo-flights/v1/flight-schedule/search";

  console.log(`[Air Cargo] REQUEST: Searching flights from ${origin} to ${destination} on ${flightDate}`);
  

  const isDebugMode = debug || req.headers['x-debug-mode'] === 'true';
  if (isDebugMode) {
    console.log('[Air Cargo] DEBUG MODE: Verbose logging enabled');
    console.log('[Air Cargo] Request details:', { origin, destination, flightDate });
  }

  const headers = {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    authorization: `Bearer ${global.Token}`,
    "content-type": "application/json; charset=UTF-8",
    origin: "https://www.cathaycargo.com",
    referer: "https://www.cathaycargo.com/",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
  };

  console.log("Locations",origin,destination)
  const payload = {
    origin,
    destination,
    flightDate,
    type: "byRoute",
    aircraftCategories: ["Freighter", "Wide-Body", "Narrow-Body"],
  };

  try {
    console.log(`[Air Cargo] Sending request to Cathay Pacific API: ${url}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    console.log(`[Air Cargo] Response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    

    let totalRoutes = 0;
    let totalSegments = 0;
    
    if (data.records && Array.isArray(data.records)) {
      totalRoutes = data.records.length;
      totalSegments = data.records.reduce((sum, route) => sum + route.length, 0);
    }
    
    console.log(`[Air Cargo] SUCCESS: Found ${totalRoutes} routes with ${totalSegments} total flight segments`);
    
    if (isDebugMode && totalRoutes > 0) {
      console.log('[Air Cargo] Sample route:', JSON.stringify(data.records[0], null, 2));
    }
    
    res.status(200).json(data); 
  } catch (err) {
    console.error(`[Air Cargo] ERROR: ${err.message}`);
    
    if (err.message.includes('401')) {
      console.error('[Air Cargo] Authentication error - Token may be expired');
    }
    
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vessel-detail', async (req, res) => {
    try {
        const { url, params, resolve } = req.body;
        
        console.log(`[VesselDetail] REQUEST: Fetching schedule for vessel_code=${params.vessel_code}, vessel_voyage=${params.vessel_voyage}`);
        

        const queryParams = {
            ...params,
            _nocache: Date.now()
        };
        
        const queryString = Object.entries(queryParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        

        const httpsAgent = new (require('https').Agent)({
            rejectUnauthorized: false,
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 1
        });

        console.log(`[VesselDetail] URL: ${url}?${queryString}`);
        

        const delay = Math.floor(Math.random() * 3000) + 2000;
        console.log(`[VesselDetail] DELAY: Waiting ${delay}ms before request`);
        await new Promise(resolve => setTimeout(resolve, delay));

        const response = await axios.get(`${url}?${queryString}`, {
            headers: {
                'Host': resolve.host,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_VesselArrivalTimeResult.jsp',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'DNT': '1'
            },
            httpsAgent,
            timeout: 60000,
            maxRedirects: 5
        });
        
        const responseSize = response.data.length;
        console.log(`[VesselDetail] RECEIVED: Response size=${responseSize} bytes, status=${response.status}`);
        

        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(response.data);
        const tables = dom.window.document.querySelectorAll('table');
        console.log(`[VesselDetail] TABLES: Found ${tables.length} tables in response`);
        
        res.send(response.data);
    } catch (error) {
        console.error('[VesselDetail] ERROR:', error.message);

        res.status(500).send('<html><body><table><tr><td>No schedule data available</td></tr></table></body></html>');
    }
});

/**
 * API endpoint to build a graph of ship routes between a start port and end port
 * Iteratively fetches voyages from ports until the destination is reached or no new ports are added
 */
app.get('/api/ship-routes-graph', async (req, res) => {
    const { startPort, endPort } = req.query;
    const startDate = req.query.startDate || formatDateYYYYMMDD(new Date());

    const userMaxHops = parseInt(req.query.maxHops) || 5;
    
    if (!startPort) {
        return res.status(400).json({ error: 'Start port is required' });
    }

    try {
        console.log(`[Route Search] START: ${startPort} -> ${endPort || 'Any'} from date ${startDate}, max hops: ${userMaxHops}`);
        

        const flatGraph = {};
        

        const portsToProcess = [{ 
            port: startPort, 
            arrivalDate: startDate, 
            depth: 0, 
            previousArrivalTime: null,
            path: [startPort]
        }];
        

        const processedPorts = new Set();

        const processedPortDates = new Set();

        const MAX_HOPS = Math.min(userMaxHops, 10);

        const MAX_TOTAL_PORTS = 50;
        const MAX_PROCESSING_TIME = 180 * 1000;

        const MAX_COMPLETE_ROUTES = 5;
        

        const completeRoutes = [];

        let endPortFound = false;

        let hops = 0;

        let totalPortsProcessed = 0;
        let maxDepth = 0;

        const startTime = Date.now();

        const uniqueVoyageKeys = new Map();
        
        console.log(`[Route Search] Building ship routes graph from ${startPort}${endPort ? ` to ${endPort}` : ''} starting from ${startDate}, max hops: ${MAX_HOPS}`);


        while (portsToProcess.length > 0) {

            totalPortsProcessed++;
            const elapsedTime = Date.now() - startTime;
            
            if (elapsedTime > MAX_PROCESSING_TIME) {
                console.log(`[Route Search] TIMEOUT: Maximum processing time (${MAX_PROCESSING_TIME/1000}s) reached, stopping search`);
                break;
            }
            
            if (totalPortsProcessed > MAX_TOTAL_PORTS) {
                console.log(`[Route Search] LIMIT REACHED: Maximum total ports (${MAX_TOTAL_PORTS}) processed, stopping search`);
                break;
            }
            

            portsToProcess.sort((a, b) => a.depth - b.depth);
            
            const { port: currentPort, arrivalDate, depth, previousArrivalTime, path } = portsToProcess.shift();
            

            if (depth > maxDepth) {
                maxDepth = depth;
            }
            

            if (depth >= MAX_HOPS) {
                console.log(`[Route Search] SKIP: Max hop depth reached (${MAX_HOPS}) for port ${currentPort}`);
                continue;
            }
            
            console.log(`[Route Search] PROCESSING: Port ${currentPort} (hop ${depth}/${MAX_HOPS}) from date ${arrivalDate}`);
            

            const portDateKey = `${currentPort}-${arrivalDate}`;
            if (processedPortDates.has(portDateKey)) {
                console.log(`[Route Search] SKIP: Port ${currentPort} with arrival date ${arrivalDate} already processed`);
                continue;
            }
            
            // Mark port-date combination as processed
            processedPortDates.add(portDateKey);
            // Don't mark the port itself as processed - allow the same port to be visited in different paths
            // This allows for exploring multiple routes through the same port with different arrival dates
            // processedPorts.add(currentPort);
            
            // Calculate a proper end date for voyage search (30 days after arrival)
            const searchEndDate = addDaysToDate(arrivalDate, 30);
            
            try {
                // Fetch voyages from current port
                console.log(`[Route Search] FETCH: Voyages from ${currentPort} between ${arrivalDate} and ${searchEndDate}`);
                const voyages = await fetchPortVoyages(currentPort, arrivalDate, searchEndDate);
                console.log(`[Route Search] RECEIVED: ${voyages.length} voyages from port ${currentPort}`);
                
                // Only continue if we have voyages
                if (voyages.length === 0) {
                    console.log(`[Route Search] INFO: No voyages found for port ${currentPort}, skipping`);
                    continue;
                }
                
                // Initialize port in graph if not exists
                if (!flatGraph[currentPort]) {
                    flatGraph[currentPort] = [];
                }
                
                // Process each voyage
                for (const voyage of voyages) {
                    // Skip incomplete voyages
                    if (!voyage.fromPort || !voyage.toPort || !voyage.departureTime || !voyage.arrivalTime) {
                        console.log(`[Route Search] SKIP: Incomplete voyage data`);
                        continue;
                    }
                    
                    // Create a unique key for this voyage to avoid duplicates
                    const voyageKey = `${voyage.shipId}-${voyage.voyage}-${voyage.fromPort}-${voyage.toPort}-${voyage.departureTime}`;
                    if (uniqueVoyageKeys.has(voyageKey)) {
                        console.log(`[Route Search] SKIP: Duplicate voyage ${voyage.shipName} (${voyage.voyage}) from ${voyage.fromPort} to ${voyage.toPort}`);
                        continue;
                    }
                    uniqueVoyageKeys.set(voyageKey, voyage);
                    
                    // Skip voyages with same source and destination (self-loops)
                    if (voyage.fromPort === voyage.toPort) {
                        console.log(`[Route Search] SKIP: Self-loop from ${voyage.fromPort} to ${voyage.toPort}`);
                        continue;
                    }
                    
                    // Skip voyages with placeholder destinations
                    if (!voyage.toPort || 
                        voyage.toPort === 'UNKNOWN' || 
                        voyage.toPort === 'PREVIOUS PORT' || 
                        voyage.toPort === 'NEXT PORT') {
                        console.log(`[Route Search] SKIP: Placeholder destination for ${voyage.shipName}`);
                        continue;
                    }
                    
                    // Check if this would create a cycle in our current path
                    // But allow same port to appear in different paths
                    if (path.includes(voyage.toPort)) {
                        console.log(`[Route Search] SKIP: Cycle detected in current path: ${path.join(' -> ')} -> ${voyage.toPort}`);
                        continue;
                    }
                    
                    // Check time feasibility: only consider voyages that depart after previous arrival
                    if (previousArrivalTime) {
                        const prevArrival = new Date(previousArrivalTime);
                        const thisDepart = new Date(voyage.departureTime);
                        
                        // Skip if this voyage departs before previous arrival (infeasible connection)
                        if (thisDepart < prevArrival) {
                            console.log(`[Route Search] SKIP: Infeasible timing - departs ${formatDateForDisplay(thisDepart)} before previous arrival ${formatDateForDisplay(prevArrival)}`);
                            continue;
                        }
                    }
                    
                    // Build enhanced voyage object
                    const enhancedVoyage = {
                        shipId: voyage.shipId,
                        shipName: voyage.shipName,
                        voyage: voyage.voyage,
                        fromPort: voyage.fromPort,
                        fromPortName: voyage.fromPortName || voyage.fromPort,
                        toPort: voyage.toPort,
                        toPortName: voyage.toPortName || voyage.toPort,
                        departureTime: voyage.departureTime,
                        arrivalTime: voyage.arrivalTime,
                        schedule: voyage.schedule || [],
                        etd: formatDateForDisplay(voyage.departureTime),
                        eta: formatDateForDisplay(voyage.arrivalTime),
                        depth: depth,
                        path: [...path, voyage.toPort], // Record the full path
                        parentVoyage: null // Will be set when building tree
                    };
                    
                    // Add voyage to graph
                    flatGraph[currentPort].push(enhancedVoyage);
                    
                    console.log(`[Route Search] ADDED: ${enhancedVoyage.shipName} (${enhancedVoyage.voyage}) from ${enhancedVoyage.fromPort} to ${enhancedVoyage.toPort} - Departs: ${enhancedVoyage.etd}, Arrives: ${enhancedVoyage.eta}`);
                    
                    // Check if this route reaches the end port
                    if (endPort && voyage.toPort === endPort) {
                        endPortFound = true;
                        
                        // Record full route for display
                        const completeRoute = {
                            path: [...path, voyage.toPort],
                            voyages: [enhancedVoyage],
                            shipNames: [voyage.shipName],
                            departureTime: voyage.departureTime,
                            arrivalTime: voyage.arrivalTime,
                            totalHops: depth + 1
                        };
                        completeRoutes.push(completeRoute);
                        
                        if (depth + 1 > hops) {
                            hops = depth + 1;
                        }
                        
                        console.log(`[Route Search] COMPLETE ROUTE #${completeRoutes.length}: ${path.join(' -> ')} -> ${voyage.toPort}`);
                        console.log(`[Route Search] DETAILS: ${voyage.shipName} (${voyage.voyage}), Departs: ${enhancedVoyage.etd}, Arrives: ${enhancedVoyage.eta}`);
                        
                        // Even if we found a route to the destination, continue exploring 
                        // We'll continue exploring all paths regardless of finding the destination
                    }
                    
                        // Calculate arrival date to use as the next start date
                        const nextStartDate = formatDateYYYYMMDD(new Date(voyage.arrivalTime));
                    const nextPath = [...path, voyage.toPort];
                    
                    // Add destination to queue for exploration, regardless of whether it's the end port
                    // This ensures we explore all paths up to MAX_HOPS
                    if (depth + 1 < MAX_HOPS) {
                        const nextPortDateKey = `${voyage.toPort}-${nextStartDate}`;
                        if (!processedPortDates.has(nextPortDateKey)) {
                        portsToProcess.push({ 
                            port: voyage.toPort, 
                            arrivalDate: nextStartDate,
                            depth: depth + 1,
                                previousArrivalTime: voyage.arrivalTime,
                                path: nextPath
                        });
                            console.log(`[Route Search] QUEUE: Added ${voyage.toPort} for processing with arrival date ${nextStartDate} (depth ${depth+1})`);
                        }
                    }
                }
            } catch (error) {
                console.error(`[Route Search] ERROR: Processing port ${currentPort}:`, error);
                // Continue with next port even if there's an error with current one
            }
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`[Route Search] COMPLETED in ${processingTime}ms: Processed ${totalPortsProcessed} ports, max depth ${maxDepth}, found ${completeRoutes.length} complete paths`);
        
        // Build the nested voyage tree from flat graph
        console.log("[Route Search] Building nested voyage tree...");
        
        // Function to build tree
        const buildNestedTree = (port, arrivalDate = null, visitedInPath = new Set(), depth = 0) => {
            // Prevent infinite recursion or exceeding max depth
            if (depth >= MAX_HOPS) {
                return { port, portName: getPortNameFromCode(port), voyages: [] };
            }
            
            // Create a copy of the visited set for this path - don't modify the original
            const visitedInThisPath = new Set([...visitedInPath]);
            
            // If this port is already in our current path, stop to prevent cycles
            // But allow the destination port to appear multiple times in different paths
            if (visitedInThisPath.has(port) && port !== endPort) {
                return { port, portName: getPortNameFromCode(port), voyages: [] };
            }
            
            // Mark this port as visited in the current path
            visitedInThisPath.add(port);
            
            console.log(`[Route Search] TREE: Building tree for port ${port} at depth ${depth}`);
            
            // If port not in graph, return empty node
            if (!flatGraph[port]) {
                return { port, portName: getPortNameFromCode(port), voyages: [] };
            }
            
            // Filter voyages by arrival date if provided
            let portVoyages = flatGraph[port] || [];
            if (arrivalDate) {
                const arrivalDateObj = new Date(arrivalDate);
                portVoyages = portVoyages.filter(voyage => {
                    const departureDate = new Date(voyage.departureTime);
                    return departureDate >= arrivalDateObj;
                });
            }
            
            // For each voyage, add its destination port's tree
            const voyages = portVoyages.map(voyage => {
                const destPort = voyage.toPort;
                
                // Only skip recursion for cycles within the same path or if we've reached max depth
                const skipRecursion = 
                    (visitedInThisPath.has(destPort) && destPort !== endPort) || 
                    depth + 1 >= MAX_HOPS;
                
                let destinationPorts = [];
                
                if (!skipRecursion) {
                    // Create a new copy of visited ports for this branch of recursion
                    // This is crucial for exploring multiple paths through the same ports
                    const newVisited = new Set([...visitedInThisPath]);
                
                // Recursively build the tree for the destination port
                    try {
                        console.log(`[Route Search] TREE: Processing destination ${destPort} from ${port} at depth ${depth+1}`);
                        const destTree = buildNestedTree(
                            destPort, 
                            voyage.arrivalTime, 
                            newVisited, // Pass the new visited set
                            depth + 1
                        );
                        
                        // Only add the destination if it's not empty
                        if (destTree && (destTree.voyages?.length > 0 || destPort === endPort)) {
                            destinationPorts = [destTree];
                            console.log(`[Route Search] TREE: Added ${destPort} with ${destTree.voyages?.length || 0} voyages as destination for ${port}`);
                        } else {
                            // Try to pull voyages directly from flatGraph even if we didn't process it
                            if (flatGraph[destPort] && flatGraph[destPort].length > 0) {
                                // Create an empty tree but with the port info
                                const simpleDest = { 
                                    port: destPort, 
                                    portName: getPortNameFromCode(destPort),
                                    voyages: []  // We'll build these on demand when expanded
                                };
                                destinationPorts = [simpleDest];
                                console.log(`[Route Search] TREE: Added ${destPort} as simple destination for ${port}`);
                            }
                        }
                    } catch (err) {
                        console.error(`[Route Search] ERROR: Building tree for ${destPort}:`, err.message);
                        destinationPorts = [{ port: destPort, portName: getPortNameFromCode(destPort), voyages: [] }];
                    }
                } else {
                    // Even for skipped recursion, add the destination port as an entry point
                    // This allows frontend to expand it and dynamically fetch data
                    console.log(`[Route Search] TREE: Adding basic entry for ${destPort} at depth ${depth + 1}`);
                    destinationPorts = [{ 
                        port: destPort, 
                        portName: getPortNameFromCode(destPort), 
                        voyages: [],
                        isEntryPoint: true  // Flag for frontend to know this can be expanded
                    }];
                }
                
                // Return the voyage with its destination ports
                return {
                    ...voyage,
                    destinationPorts
                };
            });
            
            return {
                port,
                portName: getPortNameFromCode(port),
                voyages
            };
        };
        
        // Create the nested route tree
        const routeTree = buildNestedTree(startPort);
        
        // Build complete routes with all voyage details
        const detailedCompleteRoutes = completeRoutes.map(route => {
            // For each complete route, include all voyage details
            return {
                path: route.path,
                portNames: route.path.map(getPortNameFromCode),
                voyages: route.voyages,
                totalHops: route.totalHops
            };
        });
        
        // Return both the tree and relevant metadata
        const response = {
            routeTree,
            graph: flatGraph,
            completeRoutes: detailedCompleteRoutes,
            stats: {
                portsProcessed: totalPortsProcessed,
                maxDepth,
                processingTime,
                uniqueVoyages: uniqueVoyageKeys.size
            }
        };
        
        console.log(`[Route Search] Sending response with ${Object.keys(flatGraph).length} ports, ${uniqueVoyageKeys.size} voyages`);
        res.json(response);
        
    } catch (error) {
        console.error('[Route Search] ERROR: Building ship routes graph:', error);
        res.status(500).json({ 
            error: 'Error building ship routes graph',
            details: error.message
        });
    }
});

/**
 * Get port name from port code using our port mapping
 */
function getPortNameFromCode(portCode) {
    // Reverse mapping of port codes to names
    const reversePortMap = {
        'INCOK': 'COCHIN',
        'LKCMB': 'COLOMBO',
        'AEJEA': 'JEBEL ALI',
        'AEDXB': 'DUBAI',
        'INMAA': 'CHENNAI',
        'INNSA': 'NHAVA SHEVA',
        'INMUN': 'MUNDRA',
        'SGSIN': 'SINGAPORE',
        'CNSHA': 'SHANGHAI',
        'CNSHG': 'SHANGHAI',
        'HKHKG': 'HONG KONG',
        'DEHAM': 'HAMBURG',
        'NLRTM': 'ROTTERDAM',
        'USNYC': 'NEW YORK',
        'KRPUS': 'BUSAN',
        'CNTXG': 'TIANJIN',
        'CNNGB': 'NINGBO'
        // Add more as needed
    };
    
    return reversePortMap[portCode] || portCode;
}

/**
 * Format date in a user-friendly format
 */
function formatDateForDisplay(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return dateStr; // Return original if parsing fails
        }
        return date.toLocaleDateString('en-US', { 
            month: '2-digit', 
            day: '2-digit',
            year: 'numeric'
        });
    } catch (e) {
        return dateStr; // Return original if format fails
    }
}

/**
 * Helper function to fetch voyages from a port within a date range
 * @param {string} port - Port code
 * @param {string} startDate - Start date (YYYYMMDD)
 * @param {string} endDate - End date (YYYYMMDD)
 * @returns {Promise<Array>} - Array of voyage objects
 */
async function fetchPortVoyages(port, startDate, endDate) {
    try {
        // Calculate end date as startDate + 30 days if not provided
        if (!endDate) {
            endDate = addDaysToDate(startDate, 30);
        }
        
        // Log the request details clearly
        console.log(`[Voyages] REQUEST: Fetching voyages for port ${port} from ${startDate} to ${endDate}`);
        
        // Check cache first for this port-date combination
        const cachedVoyages = voyageCache.get(port, startDate, endDate);
        if (cachedVoyages) {
            console.log(`[Voyages] CACHE_HIT: Using ${cachedVoyages.length} cached voyages for ${port}`);
            return cachedVoyages;
        }
        
        // Use the port correction function to ensure correct port code
        const correctedPort = correctPortCode(port);
        if (correctedPort !== port) {
            console.log(`[Voyages] PORT_CORRECTION: Using ${correctedPort} instead of ${port}`);
        }
        
        // Array to store all vessels from all pages
        let allVessels = [];
        let currentPage = 1;
        let hasMorePages = true;
        let totalPagesProcessed = 0;
        
        // Process and track unique vessels to avoid duplicates
        const uniqueVesselMap = new Map();
        
        // Set to track vessel HTML fingerprints to detect duplicated page content
        const vesselHtmlFingerprints = new Set();
        
        // Fetch all pages of vessel data
        while (hasMorePages) {
            console.log(`[Voyages] FETCH_PAGE: Requesting page ${currentPage} for port ${correctedPort}`);
            totalPagesProcessed++;
            
            // Safety check to avoid infinite loops
            if (totalPagesProcessed > 10) {
                console.log(`[Voyages] SAFETY_LIMIT: Reached maximum of 10 pages, stopping pagination`);
                break;
            }
            
            try {
                // We need at least 3 seconds between page requests to avoid getting blocked
                if (currentPage > 1) {
                    const pageDelay = 3000 + Math.floor(Math.random() * 2000);
                    console.log(`[Voyages] DELAY: Waiting ${pageDelay}ms before fetching next page`);
                    await new Promise(resolve => setTimeout(resolve, pageDelay));
                }
                
                // Request parameters for vessel arrival data with simplified pagination
                const requestParams = {
                    port: correctedPort,
            startDate,
                    endDate,
                    page: currentPage
                };
                console.log(`[Voyages] REQUEST_PARAMS: ${JSON.stringify(requestParams)}`);
                
                // Make the request to the vessel-arrival endpoint
                const response = await axios.post('http://localhost:3000/api/vessel-arrival', requestParams, {
                    timeout: 90000 // 90 seconds timeout
        });
        
        // Use JSDOM to parse HTML response
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(response.data);
        const document = dom.window.document;
        
                // Check for pagination indicators
                const paginationLinks = document.querySelectorAll('a');
                const pageNumbers = Array.from(paginationLinks)
                    .filter(link => !isNaN(parseInt(link.textContent.trim())))
                    .map(link => parseInt(link.textContent.trim()));
                
                if (pageNumbers.length > 0) {
                    console.log(`[Voyages] PAGE_INDICATORS: Found page numbers ${pageNumbers.join(', ')}`);
                    // Check if our current page is the highest page number (indicating we're on the last page)
                    const maxPageNumber = Math.max(...pageNumbers);
                    if (currentPage >= maxPageNumber) {
                        console.log(`[Voyages] LAST_PAGE_DETECTED: Current page ${currentPage} is >= max page ${maxPageNumber}`);
                        hasMorePages = false;
                    }
                } else {
                    console.log(`[Voyages] NO_PAGINATION: No page numbers found in response`);
                }
                
                // Find vessel table in the response
        const vesselTable = findVesselTable(document);
        
        if (!vesselTable) {
                    console.log(`[Voyages] NO_TABLE: No vessel table found for port ${correctedPort} on page ${currentPage}`);
                    hasMorePages = false;
                    continue;
                }
                
                // Check for duplicate page content by fingerprinting the table HTML
                const tableHtml = vesselTable.outerHTML;
                const tableFingerprint = tableHtml.length + '-' + tableHtml.substring(0, 100) + tableHtml.substring(tableHtml.length - 100);
                
                if (vesselHtmlFingerprints.has(tableFingerprint)) {
                    console.log(`[Voyages] DUPLICATE_PAGE: Page ${currentPage} appears to be a duplicate, stopping pagination`);
                    hasMorePages = false;
                    continue;
                }
                
                // Store fingerprint for future duplicate detection
                vesselHtmlFingerprints.add(tableFingerprint);
        
        // Extract vessel info (name, code, voyage number)
        const vessels = extractVesselsFromTable(vesselTable);
                console.log(`[Voyages] EXTRACTED: ${vessels.length} vessels from page ${currentPage}`);
        
        if (vessels.length === 0) {
                    console.log(`[Voyages] EMPTY_PAGE: No vessels found on page ${currentPage}, stopping pagination`);
                    hasMorePages = false;
                    continue;
                }
                
                // Count how many new vessels we found on this page
                let newVesselsAdded = 0;
                
                // Add new unique vessels to our collection - avoid duplicates
                for (const vessel of vessels) {
                    const vesselKey = `${vessel.vesselCode}-${vessel.voyage}`;
                    if (!uniqueVesselMap.has(vesselKey)) {
                        uniqueVesselMap.set(vesselKey, vessel);
                        allVessels.push(vessel);
                        newVesselsAdded++;
                        console.log(`[Voyages] VESSEL_ADDED: ${vessel.vesselName} (${vessel.vesselCode}) voyage ${vessel.voyage}`);
                    } else {
                        console.log(`[Voyages] VESSEL_DUPLICATE: ${vessel.vesselName} (${vessel.vesselCode}) voyage ${vessel.voyage}`);
                    }
                }
                
                console.log(`[Voyages] NEW_VESSELS: Added ${newVesselsAdded} new vessels from page ${currentPage}`);
                
                // If we didn't add any new vessels, assume we've reached the end
                if (newVesselsAdded === 0) {
                    console.log(`[Voyages] NO_NEW_VESSELS: No new vessels found on page ${currentPage}, stopping pagination`);
                    hasMorePages = false;
                    continue;
                }
                
                // Check if there's a "Next" page link that's not disabled
                const hasNextPage = Array.from(paginationLinks).some(
                    link => link.textContent.includes('Next') && !link.classList.contains('disabled')
                );
                
                if (hasNextPage) {
                    console.log(`[Voyages] NEXT_PAGE: Found next page link, will fetch page ${currentPage + 1}`);
                    currentPage++;
                } else {
                    console.log(`[Voyages] LAST_PAGE: No more pages available for port ${correctedPort}`);
                    hasMorePages = false;
                }
            } catch (error) {
                console.error(`[Voyages] ERROR: Failed to fetch page ${currentPage} for port ${correctedPort}: ${error.message}`);
                hasMorePages = false; // Stop trying if we hit an error
            }
        }
        
        console.log(`[Voyages] SUMMARY: Found ${allVessels.length} unique vessels for port ${correctedPort} across ${totalPagesProcessed} pages`);
        
        if (allVessels.length === 0) {
            console.log(`[Voyages] NO_VESSELS: No vessels found for port ${correctedPort} across any pages`);
            return [];
        }
        
        // For each vessel, fetch its complete voyage schedule
        const allVoyages = [];
        const processedVoyageKeys = new Set(); // Track processed voyage segments to avoid duplicates
        
        console.log(`[Voyages] FETCHING_SCHEDULES: Processing schedules for ${allVessels.length} vessels`);
        
        for (const vessel of allVessels) {
            try {
                console.log(`[Voyages] VESSEL_SCHEDULE: Fetching for ${vessel.vesselName} (${vessel.vesselCode}), voyage ${vessel.voyage}`);
                
                // Add delay between vessel schedule requests (3-5 seconds)
                const vesselDelay = 3000 + Math.floor(Math.random() * 2000);
                console.log(`[Voyages] DELAY: Waiting ${vesselDelay}ms before fetching vessel schedule`);
                await new Promise(resolve => setTimeout(resolve, vesselDelay));
                
                // Request parameters for vessel detail
                const detailParams = {
                    url: 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_ShowVesselSchedule.jsp',
                    params: {
                        vessel_code: vessel.vesselCode,
                        vessel_voyage: vessel.voyage
                    },
                    resolve: {
                        host: 'ss.shipmentlink.com',
                        port: 443,
                        address: '203.92.208.136'
                    }
                };
                console.log(`[Voyages] DETAIL_REQUEST: ${JSON.stringify(detailParams)}`);
                
                // Get complete voyage schedule using the vessel detail API
                const detailResponse = await axios.post('http://localhost:3000/api/vessel-detail', detailParams, {
                    timeout: 90000 // 90 seconds for vessel details
                });
                
                // Parse the schedule from the HTML response
                const scheduleData = extractScheduleFromResponse(detailResponse.data, vessel, correctedPort);
                console.log(`[Voyages] SCHEDULE_EXTRACTED: Found ${scheduleData.length} voyage segments for ${vessel.vesselName}`);
                
                // Add only unique voyage segments
                for (const voyageSegment of scheduleData) {
                    const voyageKey = `${voyageSegment.shipId}-${voyageSegment.fromPort}-${voyageSegment.toPort}-${voyageSegment.departureTime}`;
                    
                    if (!processedVoyageKeys.has(voyageKey)) {
                        processedVoyageKeys.add(voyageKey);
                        allVoyages.push(voyageSegment);
                        console.log(`[Voyages] SEGMENT_ADDED: ${voyageSegment.fromPort} -> ${voyageSegment.toPort} on ${voyageSegment.shipName}`);
                    } else {
                        console.log(`[Voyages] SEGMENT_DUPLICATE: ${voyageSegment.fromPort} -> ${voyageSegment.toPort} on ${voyageSegment.shipName}`);
                    }
                }
                
            } catch (error) {
                console.error(`[Voyages] ERROR: Failed to fetch schedule for vessel ${vessel.vesselName}: ${error.message}`);
                
                // Try to create a simple voyage using just the vessel info
                if (vessel.nextPort) {
                    console.log(`[Voyages] FALLBACK: Creating fallback voyage for ${vessel.vesselName} to ${vessel.nextPort}`);
                    
                    let departureDate = new Date();
                    let arrivalDate = new Date();
                    departureDate.setDate(departureDate.getDate() + 1);
                    arrivalDate.setDate(arrivalDate.getDate() + 5);
                    
                    const fallbackVoyage = {
                        shipId: `${vessel.vesselCode}${vessel.voyage}`,
                        shipName: vessel.vesselName,
                        voyage: vessel.voyage,
                        fromPort: mapPortToCode(correctedPort),
                        fromPortName: correctedPort,
                        toPort: mapPortToCode(vessel.nextPort),
                        toPortName: vessel.nextPort,
                        departureTime: departureDate.toISOString(),
                        arrivalTime: arrivalDate.toISOString(),
                        schedule: [
                            { port: mapPortToCode(correctedPort), portName: correctedPort, eta: '', etd: departureDate.toISOString() },
                            { port: mapPortToCode(vessel.nextPort), portName: vessel.nextPort, eta: arrivalDate.toISOString(), etd: '' }
                        ],
                        isFallback: true
                    };
                    
                    const fallbackKey = `${fallbackVoyage.shipId}-${fallbackVoyage.fromPort}-${fallbackVoyage.toPort}`;
                    if (!processedVoyageKeys.has(fallbackKey)) {
                        processedVoyageKeys.add(fallbackKey);
                        allVoyages.push(fallbackVoyage);
                        console.log(`[Voyages] FALLBACK_ADDED: ${fallbackVoyage.fromPort} -> ${fallbackVoyage.toPort} on ${fallbackVoyage.shipName}`);
                    }
                }
            }
        }
        
        console.log(`[Voyages] COMPLETE: Created ${allVoyages.length} unique voyage segments from ${allVessels.length} vessels`);
        
        // Cache the results for future use if we have data
        if (allVoyages.length > 0) {
            voyageCache.set(port, startDate, endDate, allVoyages);
        }
        
        return allVoyages;
    } catch (error) {
        console.error(`[Voyages] FATAL_ERROR: Failed to fetch voyages for port ${port}: ${error.message}`);
        return [];
    }
}

/**
 * Find the vessel schedule table in the HTML document
 * @param {Document} document - The HTML document
 * @returns {Element|null} - The vessel table element or null if not found
 */
function findVesselTable(document) {
    // First look for the Sailing tab
    const sailingTab = document.querySelector('div#Sailing');
    if (!sailingTab) {
        return null;
    }
    
    // Look for tables in the sailing tab
    const tables = sailingTab.querySelectorAll('table');
    
    // Find vessel table by looking for specific headers
    for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
            
            if (cellTexts.some(text => 
                text.includes('Vessel Name') || 
                text.includes('Voyage')
            )) {
                return table;
            }
        }
    }
    
    return null;
}

/**
 * Extract vessel information from the table
 * @param {Element} table - The vessel table element
 * @returns {Array} - Array of vessel objects
 */
function extractVesselsFromTable(table) {
    const vessels = [];
    const rows = table.querySelectorAll('tr');
    
    console.log(`[VesselExtract] Processing table with ${rows.length} rows`);
    
    // Find the index of header row to know where data rows start
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        const cellTexts = Array.from(cells).map(cell => (cell.textContent || '').trim());
        
        if (cellTexts.some(text => text.includes('Vessel Name') || text.includes('Voyage'))) {
            headerRowIndex = i;
            console.log(`[VesselExtract] Found header row at index ${i}`);
            break;
        }
    }
    
    // If no header row found, use default of 1 (assuming first row is header)
    if (headerRowIndex === -1) {
        headerRowIndex = 1;
        console.log(`[VesselExtract] No header row found, assuming row 1 is header`);
    }
    
    // Process data rows (start after header row)
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        
        if (cells.length < 6) {
            console.log(`[VesselExtract] Skipping row ${i}: insufficient cells (${cells.length})`);
            continue;
        }
        
        // Get text content and clean it thoroughly
        const cleanText = (cell) => {
            if (!cell) return '';
            const text = cell.textContent || '';
            return text.replace(/\s+/g, ' ').trim();
        };
        
        const vesselNameCell = cleanText(cells[0]);
        const voyageCell = cleanText(cells[1]);
        const lineCell = cleanText(cells[2]);
        const etaCell = cleanText(cells[6]);
        const etdCell = cleanText(cells[7] || cells[6]); // Try cell 7 first, fallback to 6
        const prevPortCell = cleanText(cells[8] || cells[7] || '');
        const nextPortCell = cleanText(cells[9] || cells[8] || '');
        
        console.log(`[VesselExtract] Row ${i}: ${vesselNameCell}, Voyage=${voyageCell}, Next=${nextPortCell}`);
            
            // Skip empty rows or header rows
        if (!vesselNameCell || 
            vesselNameCell === 'Vessel Name' || 
            vesselNameCell === 'Code)' ||
            vesselNameCell.includes('Vessel Name')) {
            console.log(`[VesselExtract] Skipping header or empty row: "${vesselNameCell}"`);
                continue;
            }
            
        // Extract vessel code - try different patterns
        let vesselCode = '';
        let codeMatch = vesselNameCell.match(/\(([A-Za-z0-9]+)\)/);
        
        if (codeMatch) {
            vesselCode = codeMatch[1];
        } else {
            // Try alternative pattern with square brackets
            codeMatch = vesselNameCell.match(/\[([A-Za-z0-9]+)\]/);
            if (codeMatch) {
                vesselCode = codeMatch[1];
            }
        }
        
        // Extract clean vessel name without the code
        let cleanVesselName = vesselNameCell;
        if (codeMatch) {
            cleanVesselName = vesselNameCell
                .replace(/\([A-Za-z0-9]+\)/, '')
                .replace(/\[[A-Za-z0-9]+\]/, '')
                .trim();
        }
        
        // If no vessel code but we have a name, generate a placeholder code
        if (!vesselCode && cleanVesselName) {
            // Use first 3-4 chars of vessel name as a code
            vesselCode = cleanVesselName.replace(/\s+/g, '').substring(0, 4).toUpperCase();
            console.log(`[VesselExtract] Generated placeholder code ${vesselCode} for vessel ${cleanVesselName}`);
        }
        
        if (vesselCode && cleanVesselName) {
                vessels.push({
                vesselName: cleanVesselName,
                    vesselCode,
                voyage: voyageCell,
                line: lineCell,
                eta: etaCell,
                etd: etdCell,
                prevPort: prevPortCell,
                nextPort: nextPortCell
            });
            
            console.log(`[VesselExtract] Added: ${cleanVesselName} (${vesselCode}), voyage ${voyageCell}`);
        } else {
            console.warn(`[VesselExtract] Could not extract vessel info from row ${i}: ${vesselNameCell}`);
        }
    }
    
    console.log(`[VesselExtract] Total extracted: ${vessels.length} vessels from ${rows.length} rows`);
    return vessels;
}

/**
 * Extract voyage schedule from the vessel detail response
 * @param {string} html - The HTML response
 * @param {Object} vessel - The vessel information
 * @param {string} currentPort - The current port code
 * @returns {Array} - Array of voyage segments
 */
function extractScheduleFromResponse(html, vessel, currentPort) {
    const voyages = [];
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Clean the vessel info to ensure no HTML garbage
    vessel = {
        ...vessel,
        vesselName: vessel.vesselName ? vessel.vesselName.replace(/\s+/g, ' ').trim() : '',
        voyage: vessel.voyage ? vessel.voyage.replace(/\s+/g, ' ').trim() : '',
        vesselCode: vessel.vesselCode ? vessel.vesselCode.replace(/\s+/g, ' ').trim() : ''
    };
    
    // Log the full HTML for debugging (truncated)
    const htmlPreview = html?.substring(0, 300) || '';
    console.log(`[Schedule] Raw HTML preview for ${vessel.vesselName}: ${htmlPreview.length} chars`);
    
    // Find the schedule table - look for any table in the document
    let scheduleTable = document.querySelector('table');
    
    // If table not found, try alternative selectors
    if (!scheduleTable) {
        console.log('[Schedule] No table found with standard selector, trying alternatives');
        const tables = document.querySelectorAll('table');
        if (tables.length > 0) {
            console.log(`[Schedule] Found ${tables.length} tables with direct table selector`);
            scheduleTable = tables[0];
        }
    }
    
    if (!scheduleTable) {
        console.warn(`[Schedule] No schedule table found for vessel ${vessel.vesselName}`);
        
        // Create a direct voyage from current port to next port based on vessel info
        if (vessel.nextPort) {
            console.log(`[Schedule] Creating direct voyage from ${currentPort} to ${vessel.nextPort}`);
            
            // Use vessel.eta and vessel.etd to create dates
            let departureDate = new Date();
            let arrivalDate = new Date();
            departureDate.setDate(departureDate.getDate() + 1); // Default to tomorrow
            arrivalDate.setDate(arrivalDate.getDate() + 5);     // Default to 5 days later
            
            try {
                // Try to extract a date from ETD in format YYYY-MM-DD
                const dateMatch = vessel.etd?.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    departureDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
                    arrivalDate = new Date(departureDate);
                    arrivalDate.setDate(departureDate.getDate() + 5); // 5 days after departure
                }
            } catch (error) {
                console.error('[Schedule] Error parsing dates from vessel info:', error.message);
            }
            
            // Clean next port data
            const cleanNextPort = vessel.nextPort.replace(/\s+/g, ' ').trim();
            
            voyages.push({
                shipId: `${vessel.vesselCode}${vessel.voyage}`,
                shipName: vessel.vesselName,
                voyage: vessel.voyage,
                fromPort: mapPortToCode(currentPort),
                fromPortName: currentPort,
                toPort: mapPortToCode(cleanNextPort),
                toPortName: cleanNextPort,
                departureTime: departureDate.toISOString(),
                arrivalTime: arrivalDate.toISOString(),
                schedule: [
                    { 
                        port: mapPortToCode(currentPort), 
                        portName: currentPort, 
                        eta: '', 
                        etd: departureDate.toISOString() 
                    },
                    { 
                        port: mapPortToCode(cleanNextPort), 
                        portName: cleanNextPort, 
                        eta: arrivalDate.toISOString(), 
                        etd: '' 
                    }
                ],
                isFallback: true
            });
            
            console.log(`[Schedule] Created fallback voyage: ${currentPort} -> ${cleanNextPort}`);
        }
        
        return voyages;
    }
    
    // Extract schedule rows
    const rows = scheduleTable.querySelectorAll('tr');
    console.log(`[Schedule] Found ${rows.length} rows in schedule table for ${vessel.vesselName}`);
    
    const schedule = [];
    
    // Helper function to clean text
    const cleanText = (text) => {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
    };
    
    // Find the header row first
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        const cellTexts = Array.from(cells).map(cell => cleanText(cell?.textContent));
        
        if (cellTexts.some(text => 
            text.includes('Port') || 
            text.includes('ETA') || 
            text.includes('ETD')
        )) {
            headerRowIndex = i;
            console.log(`[Schedule] Found header row at index ${i}: ${cellTexts.join(' | ')}`);
            break;
        }
    }
    
    // If no header found, assume it's at row 1
    if (headerRowIndex === -1) {
        headerRowIndex = 1;
        console.log('[Schedule] No header row found, assuming row 1');
    }
    
    // Process data rows (skip header rows)
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 3) {
            const portCell = cleanText(cells[0]?.textContent);
            const etaCell = cleanText(cells[1]?.textContent);
            const etdCell = cleanText(cells[2]?.textContent);
            
            console.log(`[Schedule] Row ${i}: Port=${portCell}, ETA=${etaCell}, ETD=${etdCell}`);
            
            // Skip empty or header rows
            if (!portCell || portCell.includes('Port Name') || portCell === 'Port') {
                console.log(`[Schedule] Skipping header or empty row`);
                continue;
            }
            
            // Extract port information
            let portCode = null;
            let portName = portCell;
            
            // First try with standard port code format (5 letter code)
            const portCodeMatch = portCell.match(/\(([A-Z]{5})\)/);
            if (portCodeMatch) {
                portCode = portCodeMatch[1];
            } else {
                // Try to extract the port name (use the full name as code if no parentheses)
                const anyCodeMatch = portCell.match(/\(([A-Za-z0-9]+)\)/);
                if (anyCodeMatch) {
                    portCode = anyCodeMatch[1];
                } else {
                    // If no port code found, use the port name and try to map it
                    portCode = mapPortToCode(portCell);
                }
            }
            
            if (portCode || portName) {
                schedule.push({
                    port: portCode,
                    portName: portName,
                    eta: etaCell,
                    etd: etdCell
                });
            }
        }
    }
    
    console.log(`[Schedule] Found ${schedule.length} ports in schedule for ${vessel.vesselName}`);
    schedule.forEach((port, idx) => {
        console.log(`[Schedule] Port ${idx+1}: ${port.portName} (${port.port}), ETA: ${port.eta}, ETD: ${port.etd}`);
    });
    
    // If we have no schedule but have nextPort in vessel info, create a simple segment
    if (schedule.length === 0 && vessel.nextPort) {
        console.log(`[Schedule] No port schedule found but have nextPort: ${vessel.nextPort}`);
        
        let departureDate = new Date();
        let arrivalDate = new Date();
        departureDate.setDate(departureDate.getDate() + 1); // tomorrow
        arrivalDate.setDate(arrivalDate.getDate() + 5);     // 5 days later
        
        // Clean next port data
        const cleanNextPort = vessel.nextPort.replace(/\s+/g, ' ').trim();
        
        voyages.push({
            shipId: `${vessel.vesselCode}${vessel.voyage}`,
            shipName: vessel.vesselName,
            voyage: vessel.voyage,
            fromPort: mapPortToCode(currentPort),
            fromPortName: currentPort,
            toPort: mapPortToCode(cleanNextPort),
            toPortName: cleanNextPort,
            departureTime: departureDate.toISOString(),
            arrivalTime: arrivalDate.toISOString(),
            schedule: [
                { 
                    port: mapPortToCode(currentPort), 
                    portName: currentPort, 
                    eta: '', 
                    etd: departureDate.toISOString() 
                },
                { 
                    port: mapPortToCode(cleanNextPort), 
                    portName: cleanNextPort, 
                    eta: arrivalDate.toISOString(), 
                    etd: '' 
                }
            ],
            isFallback: true
        });
        
        return voyages;
    }
    
    // Try to find the current port in the schedule
    // First try with exact match
    let currentPortIndex = schedule.findIndex(stop => stop.port === currentPort);
    
    // If not found, try case-insensitive match
    if (currentPortIndex === -1) {
        currentPortIndex = schedule.findIndex(stop => 
            stop.port?.toLowerCase() === currentPort?.toLowerCase() || 
            stop.portName?.toLowerCase().includes(currentPort?.toLowerCase())
        );
    }
    
    // If still not found, but we have vessel.nextPort, create a direct segment
    if (currentPortIndex === -1 && vessel.nextPort) {
        console.warn(`[Schedule] Current port ${currentPort} not found in schedule, but have nextPort`);
        
        let departureDate = new Date();
        departureDate.setDate(departureDate.getDate() + 1); // tomorrow
        
        let arrivalDate = new Date();
        arrivalDate.setDate(arrivalDate.getDate() + 5); // 5 days later
        
        // Clean next port data
        const cleanNextPort = vessel.nextPort.replace(/\s+/g, ' ').trim();
        
        voyages.push({
            shipId: `${vessel.vesselCode}${vessel.voyage}`,
            shipName: vessel.vesselName,
            voyage: vessel.voyage,
            fromPort: mapPortToCode(currentPort),
            fromPortName: currentPort,
            toPort: mapPortToCode(cleanNextPort),
            toPortName: cleanNextPort,
            departureTime: departureDate.toISOString(),
            arrivalTime: arrivalDate.toISOString(),
            schedule: [
                { 
                    port: mapPortToCode(currentPort), 
                    portName: currentPort, 
                    eta: '', 
                    etd: departureDate.toISOString() 
                },
                { 
                    port: mapPortToCode(cleanNextPort), 
                    portName: cleanNextPort, 
                    eta: arrivalDate.toISOString(), 
                    etd: '' 
                }
            ],
            isFallback: true
        });
        
        return voyages;
    }
    
    if (currentPortIndex === -1) {
        console.warn(`[Schedule] Current port ${currentPort} not found in schedule for ${vessel.vesselName}`);
    return voyages;
}

    // For each port after the current one, create a voyage segment
    for (let i = currentPortIndex + 1; i < schedule.length; i++) {
        const nextPort = schedule[i];
        
        // Skip empty or placeholder ports
        if (!nextPort.port || nextPort.port === 'UNKNOWN' || 
            nextPort.port === 'PREVIOUS PORT' || nextPort.port === 'NEXT PORT') {
            console.log(`[Schedule] Skipping placeholder port: ${nextPort.portName}`);
            continue;
        }
        
        // Parse dates from ETA/ETD fields
        let departureDate, arrivalDate;
        try {
            // Try to convert MM/DD date format to a full date
            const parseDateString = (dateStr) => {
                if (!dateStr) return null;
                
                // First check for YYYY-MM-DD format
                const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                    return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
                }
                
                // Check for MM/DD format
                const mmddMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                if (mmddMatch) {
                    const month = mmddMatch[1];
                    const day = mmddMatch[2];
                    const year = new Date().getFullYear(); // Current year as default
                    return new Date(`${year}-${month}-${day}`);
                }
                
                return null;
            };
            
            departureDate = parseDateString(schedule[currentPortIndex].etd);
            arrivalDate = parseDateString(nextPort.eta);
            
            // If dates couldn't be parsed, use defaults
            if (!departureDate) {
                departureDate = new Date();
                departureDate.setDate(departureDate.getDate() + 1); // tomorrow
            }
            
            if (!arrivalDate) {
                arrivalDate = new Date(departureDate);
                arrivalDate.setDate(departureDate.getDate() + 5); // 5 days after departure
            }
            
            console.log(`[Schedule] Parsed dates: Departure=${departureDate.toISOString()}, Arrival=${arrivalDate.toISOString()}`);
        } catch (error) {
            console.error(`[Schedule] Error parsing dates:`, error.message);
            departureDate = new Date();
            departureDate.setDate(departureDate.getDate() + 1);
            arrivalDate = new Date();
            arrivalDate.setDate(arrivalDate.getDate() + 6);
        }
        
        // Create a voyage segment
            voyages.push({
            shipId: `${vessel.vesselCode}${vessel.voyage}`,
            shipName: vessel.vesselName,
            voyage: vessel.voyage,
            fromPort: schedule[currentPortIndex].port,
            fromPortName: schedule[currentPortIndex].portName,
            toPort: nextPort.port,
            toPortName: nextPort.portName,
                departureTime: departureDate.toISOString(),
            arrivalTime: arrivalDate.toISOString(),
            schedule: schedule.slice(currentPortIndex, i + 1),
            etd: schedule[currentPortIndex].etd,
            eta: nextPort.eta
        });
        
        console.log(`[Schedule] Created voyage segment: ${schedule[currentPortIndex].portName} -> ${nextPort.portName}`);
    }
    
    console.log(`[Schedule] Created ${voyages.length} voyage segments from ${vessel.vesselName}`);
    return voyages;
}

/**
 * Helper function to map port names to standard port codes
 * @param {string} port - Port name or code
 * @returns {string} - Standardized port code
 */
function mapPortToCode(port) {
    if (!port) return 'UNKNW';
    
    // Try to clean up the port name first
    const cleanPort = port.trim().toUpperCase();
    
    // Common port mappings
    const portMap = {
        // Exact port names in the Shipment Link system
        'COCHIN': 'INCOK',
        'COLOMBO': 'LKCMB',
        'JEBEL ALI': 'AEJEA',
        'DUBAI': 'AEDXB',
        'HAMBURG': 'DEHAM',
        'ROTTERDAM': 'NLRTM',
        'AMSTERDAM': 'NLAMS',
        'SINGAPORE': 'SGSIN',
        'SHANGHAI': 'CNSHA',
        'HONG KONG': 'HKHKG',
        'NAGOYA': 'JPNGO',
        'NEW YORK': 'USNYC',
        'LOS ANGELES': 'USLAX',
        'BUSAN': 'KRPUS',
        'PUSAN': 'KRPUS',
        'TIANJIN': 'CNTXG',
        'XINGANG': 'CNTXG',
        'NINGBO': 'CNNGB',
        
        // Port name variations
        'CHENNAI': 'INMAA',
        'MADRAS': 'INMAA',
        'NHAVA SHEVA': 'INNSA',
        'MUNDRA': 'INMUN',
        'CALCUTTA': 'INCCU',
        'KOLKATA': 'INCCU',
        'MUMBAI': 'INBOM',
        'BOMBAY': 'INBOM',
        'TUTICORIN': 'INTUT',
        'VISAKHAPATNAM': 'INVTZ',
        'KARACHI': 'PKKAR',
        'PORT KLANG': 'MYPKG',
        'KLANG': 'MYPKG',
        'PENANG': 'MYPEN',
        'JAKARTA': 'IDJKT',
        'HO CHI MINH': 'VNSGN',
        'SAIGON': 'VNSGN',
        'MANILA': 'PHMNL',
        'BANGKOK': 'THBKK',
        'LAEM CHABANG': 'THLCH',
        'QINGDAO': 'CNTAO',
        'NINGBO': 'CNNGB',
        'DALIAN': 'CNDLC',
        'XIAMEN': 'CNXMN',
        'FUZHOU': 'CNFOC',
        'INCHEON': 'KRINC',
        'KOBE': 'JPUKB',
        'OSAKA': 'JPOSA',
        'TOKYO': 'JPTYO',
        'YOKOHAMA': 'JPYOK',
        'SEATTLE': 'USSEA',
        'TACOMA': 'USTIW',
        'LONG BEACH': 'USLGB',
        'OAKLAND': 'USOAK',
        'SAN FRANCISCO': 'USSFO',
        'MIAMI': 'USMIA',
        'SAVANNAH': 'USSAV',
        'CHARLESTON': 'USCHA',
        'NORFOLK': 'USORF',
        'BALTIMORE': 'USBAL',
        'PHILADELPHIA': 'USPHL',
        'BOSTON': 'USBOS',
        'MONTREAL': 'CAMTR',
        'VANCOUVER': 'CAVAN',
        'HALIFAX': 'CAHAL',
        'TORONTO': 'CATOR',
        'ANTWERP': 'BEANR',
        'FELIXSTOWE': 'GBFXT',
        'SOUTHAMPTON': 'GBSOU',
        'LONDON': 'GBLON',
        'LIVERPOOL': 'GBLIV',
        'BREMERHAVEN': 'DEBRV',
        'BREMEN': 'DEBRV',
        'LE HAVRE': 'FRLEH',
        'MARSEILLE': 'FRMRS',
        'ALGECIRAS': 'ESALG',
        'BARCELONA': 'ESBCN',
        'VALENCIA': 'ESVLC',
        'GENOA': 'ITGOA',
        'NAPLES': 'ITNAP',
        'PIRAEUS': 'GRPIR',
        'ALEXANDRIA': 'EGALY',
        'PORT SAID': 'EGPSD',
        'CASABLANCA': 'MACAS',
        'TANGIER': 'MATNG',
        'DURBAN': 'ZADUR',
        'CAPE TOWN': 'ZACPT',
        'MOMBASA': 'KEMBA',
        'DAR ES SALAAM': 'TZDAR',
        'SYDNEY': 'AUSYD',
        'MELBOURNE': 'AUMEL',
        'BRISBANE': 'AUBNE',
        'AUCKLAND': 'NZAKL',
        'WELLINGTON': 'NZWLG',
        'SANTOS': 'BRSSZ',
        'RIO DE JANEIRO': 'BRRIO',
        'BUENOS AIRES': 'ARBUE',
        'CALLAO': 'PECLL',
        'GUAYAQUIL': 'ECGYE',
        'VALPARAISO': 'CLVAP',
        'CARTAGENA': 'COCTG',
        'PANAMA': 'PAPAN',
        'COLON': 'PAPAN',
        'VERACRUZ': 'MXVER',
        'MANZANILLO': 'MXZLO'
    };
    
    // If the port is already a standard 5-letter code (like INCOK), return it
    if (/^[A-Z]{5}$/.test(cleanPort)) {
        return cleanPort;
    }
    
    // Try direct mapping first
    if (portMap[cleanPort]) {
        return portMap[cleanPort];
    }
    
    // Try partial matching for ports with spaces or partial names
    for (const [name, code] of Object.entries(portMap)) {
        if (cleanPort.includes(name) || name.includes(cleanPort)) {
            return code;
        }
    }
    
    // Return the original if no mapping found
    return cleanPort;
}

/**
 * Helper function to format date as YYYYMMDD
 * @param {Date} date - Date object
 * @returns {string} - Formatted date string
 */
function formatDateYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Helper function to add days to a date in YYYYMMDD format
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @param {number} days - Number of days to add
 * @returns {string} - Resulting date in YYYYMMDD format
 */
function addDaysToDate(dateStr, days) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.substring(6, 8));
    
    const date = new Date(year, month, day);
    date.setDate(date.getDate() + days);
    
    return formatDateYYYYMMDD(date);
}

/**
 * Corrects known port code issues
 * @param {string} portCode - Original port code
 * @returns {string} - Corrected port code
 */
function correctPortCode(portCode) {
    if (!portCode) return portCode;
    
    // Specific corrections for known problematic ports
    const portCorrections = {
        'CNSHA': 'CNSHG', // Shanghai - API uses CNSHG instead of CNSHA
        'SGSIN': 'SGSIN', // Singapore
        'PUSAN': 'KRPUS', // Pusan/Busan
        'XINGANG': 'CNTXG', // Xingang/Tianjin
        'NINGBO': 'CNNGB', // Ningbo
        // Add more corrections as needed
    };
    
    return portCorrections[portCode] || portCode;
}

app.listen(port, async () => {
    console.log(`Server listening on port ${port}`);
    try {
        // Load voyage cache from disk
        voyageCache.loadFromFile();
        
        const connected = await getDbClient();
        if (!connected) {
            console.warn('Warning: Database connection test failed. The server will continue running but database operations may fail.');
        }
    } catch (err) {
        console.error('Failed to connect to database on startup:', err);
    }
});

/**
 * API endpoint to fetch port coordinates by port code from seaports table
 * This endpoint queries the seaports table to get lat/long for a specific port code
 */
app.get('/api/port-coordinates', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        console.error('Missing required parameter: code');
        return res.status(400).json({ error: 'Port code is required.' });
    }

    console.log(`Processing port coordinates request for code: ${code}`);
    let client = null;

    try {
        console.log('Getting database client from pool for port coordinates...');
        client = await getDbClient();
        console.log('Successfully got client from pool');

        // Query for exact match on world_port_index (primary port code)
        let portQuery = `
            SELECT 
                world_port_index AS code,
                main_port_name AS name,
                country_code,
                latitude_dd,
                longitude_dd
            FROM seaports
            WHERE world_port_index = $1
            LIMIT 1
        `;

        console.log(`Executing query for port code: ${code}`);
        let portResult = await client.query(portQuery, [code]);

        // If no results found, try with a different approach - check if the code is in the 
        // UN/LOCODE format (5-letter code like SGSIN, CNSHA, etc.)
        if (portResult.rows.length === 0 && /^[A-Z]{5}$/.test(code)) {
            console.log(`No port found with world_port_index ${code}, trying UN/LOCODE match`);
            
            // Try to match on UN/LOCODE format - first 2 letters are country code, last 3 are port code
            const countryCode = code.substring(0, 2);
            const portCodePart = code.substring(2, 5);
            
            portQuery = `
                SELECT 
                    world_port_index AS code,
                    main_port_name AS name,
                    country_code,
                    latitude_dd,
                    longitude_dd
                FROM seaports
                WHERE country_code = $1 AND main_port_name ILIKE $2
                LIMIT 1
            `;
            
            portResult = await client.query(portQuery, [countryCode, `%${portCodePart}%`]);
        }

        if (portResult.rows.length > 0) {
            console.log(`Found port coordinates for ${code}`);
            
            const port = portResult.rows[0];
            res.json({
                port: {
                    code: port.code,
                    name: port.name,
                    country_code: port.country_code,
                    latitude_dd: port.latitude_dd,
                    longitude_dd: port.longitude_dd
                }
            });
        } else {
            console.log(`No port found for code ${code}`);
            res.json({ port: null });
        }
    } catch (err) {
        console.error("Database query error:", err);
        res.status(500).json({ error: "Failed to fetch port coordinates", details: err.message });
    } finally {
        if (client) {
            try {
                // Release the client back to the pool instead of ending it
                client.release();
                console.log('Database client released back to pool');
            } catch (err) {
                console.error('Error releasing database client:', err);
            }
        }
    }
});

// Add new API routes for airports with full Supabase loading
app.get('/api/airports', async (req, res) => {
  console.log('API airports endpoint called');
  try {
    const client = await getDbClient();
    console.log('Successfully connected to database for airports request');
    
    // Let's check what columns are actually in the table
    const columnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'airports'
    `;
    
    const columnsResult = await client.query(columnsQuery);
    console.log('Available columns in airports table:', columnsResult.rows.map(r => r.column_name).join(', '));
    
    // Safely query all available data
    const airportsQuery = `
      SELECT * FROM airports 
      WHERE latitude_dd IS NOT NULL AND longitude_dd IS NOT NULL
    `;
    
    const result = await client.query(airportsQuery);
    client.release();
    
    if (result.rows && result.rows.length > 0) {
      console.log(`Loaded ${result.rows.length} airports from Supabase database`);
      
      // Let's see what fields are available in the first row
      console.log('Sample airport data fields:', Object.keys(result.rows[0]).join(', '));
      
      const airports = result.rows.map(airport => ({
        code: airport.iata_code,
        name: airport.airport_name || airport.iata_code,
        latitude: parseFloat(airport.latitude_dd),
        longitude: parseFloat(airport.longitude_dd),
        type: 'airport'
      }));
      
      return res.json(airports);
    } else {
      console.log('No airport data found in database');
      return res.status(404).json({ error: 'No airport data available in database' });
    }
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ error: 'Failed to fetch airport data', details: error.message });
  }
});

// Add new API routes for seaports with full Supabase loading
app.get('/api/seaports', async (req, res) => {
  try {
    const client = await getDbClient();
    const seaportsQuery = `
      SELECT * FROM seaports
      WHERE latitude_dd IS NOT NULL AND longitude_dd IS NOT NULL
    `;
    
    const result = await client.query(seaportsQuery);
    client.release();
    
    if (result.rows && result.rows.length > 0) {
      console.log(`Loaded ${result.rows.length} seaports from Supabase database`);
      
      const seaports = result.rows.map(port => ({
        world_port_index: port.world_port_index,
        main_port_name: port.main_port_name,
        latitude_dd: parseFloat(port.latitude_dd),
        longitude_dd: parseFloat(port.longitude_dd),
        type: 'seaport'
      }));
      
      return res.json(seaports);
    } else {
      return res.status(404).json({ error: 'No seaport data available in database' });
    }
  } catch (error) {
    console.error('Error fetching seaports:', error);
    res.status(500).json({ error: 'Failed to fetch seaport data', details: error.message });
  }
});

// Add new API endpoint for all ports (both airports and seaports)
app.get('/api/all-ports', async (req, res) => {
  console.log('API all-ports endpoint called');
  try {
    const client = await getDbClient();
    console.log('Successfully connected to database for all ports request');
    
    // Query for airports
    const airportsQuery = `
      SELECT * FROM airports 
      WHERE latitude_dd IS NOT NULL AND longitude_dd IS NOT NULL
    `;
    
    // Query for seaports
    const seaportsQuery = `
      SELECT * FROM seaports
      WHERE latitude_dd IS NOT NULL AND longitude_dd IS NOT NULL
    `;
    
    // Execute both queries in parallel
    const [airportResults, seaportResults] = await Promise.all([
      client.query(airportsQuery),
      client.query(seaportsQuery)
    ]);
    
    client.release();
    
    // Format airport data
    const airports = airportResults.rows.map(airport => ({
      id: airport.iata_code,
      code: airport.iata_code,
      name: airport.airport_name || airport.iata_code,
      latitude: parseFloat(airport.latitude_dd),
      longitude: parseFloat(airport.longitude_dd),
      type: 'airport'
    }));
    
    // Format seaport data
    const seaports = seaportResults.rows.map(port => ({
      id: port.world_port_index,
      code: port.world_port_index,
      name: port.main_port_name || port.world_port_index,
      latitude: parseFloat(port.latitude_dd),
      longitude: parseFloat(port.longitude_dd),
      type: 'seaport'
    }));
    
    // Combine both datasets
    const allPorts = [...airports, ...seaports];
    
    console.log(`Returning ${airports.length} airports and ${seaports.length} seaports (${allPorts.length} total)`);
    
    return res.json(allPorts);
  } catch (error) {
    console.error('Error fetching all ports:', error);
    res.status(500).json({ error: 'Failed to fetch port data', details: error.message });
  }
});

// Add route for flight connections
app.get('/api/flights', (req, res) => {
  if (!processedRoutesData || !processedRoutesData.routes) {
    return res.status(404).json({ error: 'Flight data not available' });
  }
  
  const { source, destination, min_frequency } = req.query;
  const minFreq = parseInt(min_frequency) || 1;
  
  let routes = processedRoutesData.routes;
  
  // Filter by source/destination if provided
  if (source) {
    routes = routes.filter(route => route.source === source);
  }
  
  if (destination) {
    routes = routes.filter(route => route.destination === destination);
  }
  
  // Filter by minimum frequency
  routes = routes.filter(route => route.frequency >= minFreq);
  
  // Limit results
  const limit = parseInt(req.query.limit) || 100;
  routes = routes.slice(0, limit);
  
  res.json(routes);
});

// Add route for shipping connections
app.get('/api/shipping', (req, res) => {
  if (!processedShippingData || !processedShippingData.routes) {
    return res.status(404).json({ error: 'Shipping data not available' });
  }
  
  const { from_id, to_id, limit } = req.query;
  const resultLimit = parseInt(limit) || 100;
  
  let routes = processedShippingData.routes;
  
  // Filter by source/destination if provided
  if (from_id) {
    routes = routes.filter(route => route.from_id === from_id);
  }
  
  if (to_id) {
    routes = routes.filter(route => route.to_id === to_id);
  }
  
  // Limit results
  routes = routes.slice(0, resultLimit);
  
  res.json(routes);
});

// Add a new endpoint to get edges in batches
app.get('/api/edges', async (req, res) => {
  const limit = parseInt(req.query.limit) || 1000;
  const offset = parseInt(req.query.offset) || 0;
  const sourceId = req.query.source_id;
  const targetId = req.query.target_id;
  const mode = req.query.mode; // Optional filter by mode (flight, ship)
  
  try {
    // First check if simulation is running
    const simulationRes = await axios.get(`http://localhost:5000/status`);
    
    if (!simulationRes.data.simulation_initialized) {
      return res.status(503).json({
        status: 'error',
        message: 'Simulation not initialized'
      });
    }
    
    // Use the existing /graph endpoint but slice the results for pagination
    const graphRes = await axios.get(`http://localhost:5000/graph?include_edges=true`);
    
    if (!graphRes.data || !graphRes.data.edges) {
      return res.status(404).json({
        status: 'error',
        message: 'No edges data available'
      });
    }
    
    let edges = graphRes.data.edges;
    
    // Apply filters
    if (sourceId) {
      edges = edges.filter(edge => edge.source === sourceId);
    }
    
    if (targetId) {
      edges = edges.filter(edge => edge.destination === targetId);
    }
    
    if (mode) {
      edges = edges.filter(edge => edge.mode === mode);
    }
    
    // Get total count before pagination
    const totalEdges = edges.length;
    
    // Apply pagination
    edges = edges.slice(offset, offset + limit);
    
    return res.json({
      status: 'ok',
      edges: edges,
      total: totalEdges,
      offset: offset,
      limit: limit,
      has_more: offset + edges.length < totalEdges
    });
    
  } catch (error) {
    console.error('Error fetching edges:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch edges from simulation',
      error: error.message
    });
  }
});

// Add or update an endpoint to initialize or reinitialize the simulation
app.post('/api/simulation/init', (req, res) => {
  try {
    console.log('Initializing simulation with latest data...');
    
    // Initialize or reinitialize simulation with current data files
    const flightDataPath = path.join(__dirname, 'data', 'routes.dat');
    const shippingDataPath = path.join(__dirname, 'data', 'shipping_lanes.geojson');
    
    if (!fs.existsSync(flightDataPath)) {
      return res.status(404).json({ error: 'Flight data file not found' });
    }
    
    if (!fs.existsSync(shippingDataPath)) {
      return res.status(404).json({ error: 'Shipping data file not found' });
    }
    
    try {
      // Initialize the simulation with the data files
      simulation = new FreightSimulation().initialize(flightDataPath, shippingDataPath);
      
      // Generate some random weather data and pain points
      simulation.generate_weather();
      simulation.generate_pain_points(20);
      
      const stats = {
        nodes: Object.keys(simulation.nodes).length,
        edges: simulation.edges.length,
        airports: Object.values(simulation.nodes).filter(n => n.node_type === 'airport').length,
        seaports: Object.values(simulation.nodes).filter(n => n.node_type === 'seaport').length,
        flight_routes: simulation.edges.filter(e => e.mode === 'flight').length,
        shipping_lanes: simulation.edges.filter(e => e.mode === 'ship').length
      };
      
      console.log('Simulation initialized with the following stats:', stats);
      
      res.json({
        success: true,
        message: 'Simulation initialized successfully',
        stats: stats
      });
    } catch (simError) {
      console.error('Error initializing simulation:', simError);
      res.status(500).json({ error: 'Failed to initialize simulation', details: simError.message });
    }
  } catch (err) {
    console.error('Error in initialization endpoint:', err);
    res.status(500).json({ error: 'Server error during initialization', details: err.message });
  }
});

/**
 * API endpoint to build a graph of ship routes using Hapag-Lloyd API
 * This replaces the previous ShipmentLink API implementation
 */
app.get('/api/hapag-routes-graph', async (req, res) => {
    const { startPort, endPort } = req.query;
    const startDate = req.query.startDate || formatDateYYYYMMDD(new Date());
    
    if (!startPort) {
        return res.status(400).json({ error: 'Start port is required' });
    }

    try {
        console.log(`[Hapag Route Search] START: ${startPort} -> ${endPort || 'Any'} from date ${startDate}`);
        
        // Convert YYYYMMDD format to YYYY-MM-DD for Hapag API
        const formattedDate = `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}`;
        
        // Call the Hapag-Lloyd API
        const hapagResponse = await fetch(`http://localhost:${PORT}/api/hapag-lloyd/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                startLocation: startPort,
                endLocation: endPort,
                startDate: formattedDate,
                containerType: "45GP" // Default container type
            })
        });
        
        if (!hapagResponse.ok) {
            throw new Error(`Hapag-Lloyd API error: ${hapagResponse.status}`);
        }
        
        const hapagData = await hapagResponse.json();
        console.log(`[Hapag Route Search] Retrieved ${hapagData.routes?.length || 0} routes from Hapag-Lloyd API`);
        
        // Transform Hapag-Lloyd data to match the expected format for the frontend
        const routeTree = buildRouteTreeFromHapagData(hapagData, startPort);
        const flatGraph = buildFlatGraphFromHapagData(hapagData, startPort);
        const completeRoutes = buildCompleteRoutesFromHapagData(hapagData, startPort, endPort);
        
        // Return both the tree and relevant metadata
        const response = {
            routeTree,
            graph: flatGraph,
            completeRoutes,
            stats: {
                portsProcessed: hapagData.routes?.length || 0,
                maxDepth: getMaxDepthFromHapagRoutes(hapagData.routes || []),
                processingTime: 0,
                uniqueVoyages: hapagData.routes?.length || 0
            }
        };
        
        console.log(`[Hapag Route Search] Sending response with ${Object.keys(flatGraph).length} ports, ${hapagData.routes?.length || 0} voyages`);
        res.json(response);
        
    } catch (error) {
        console.error('[Hapag Route Search] ERROR:', error);
        res.status(500).json({ 
            error: 'Error building Hapag-Lloyd ship routes graph',
            details: error.message
        });
    }
});

/**
 * Helper function to build a route tree from Hapag-Lloyd data
 */
function buildRouteTreeFromHapagData(hapagData, startPort) {
    // Start with the origin port as the root
    const routeTree = {
        port: startPort,
        portName: getPortNameFromCode(startPort),
        voyages: []
    };
    
    // Iterate through routes and build voyages
    (hapagData.routes || []).forEach(route => {
        // Each route becomes a voyage from the start port
        if (route.legs && route.legs.length > 0) {
            const firstLeg = route.legs[0];
            const voyage = createVoyageFromLeg(firstLeg, route, 0);
            
            // Add destination ports for multi-leg routes
            if (route.legs.length > 1) {
                voyage.destinationPorts = buildDestinationPortsFromRoute(route, 1);
            }
            
            routeTree.voyages.push(voyage);
        }
    });
    
    return routeTree;
}

/**
 * Helper function to recursively build destination ports from route legs
 */
function buildDestinationPortsFromRoute(route, legIndex) {
    if (legIndex >= route.legs.length) return [];
    
    const leg = route.legs[legIndex];
    const port = {
        port: leg.destinationLocation.locationCode,
        portName: leg.destinationLocation.locationName,
        voyages: []
    };
    
    if (legIndex < route.legs.length - 1) {
        const nextLeg = route.legs[legIndex + 1];
        const voyage = createVoyageFromLeg(nextLeg, route, legIndex);
        
        // Recursively add subsequent legs
        if (legIndex + 1 < route.legs.length - 1) {
            voyage.destinationPorts = buildDestinationPortsFromRoute(route, legIndex + 2);
        }
        
        port.voyages.push(voyage);
    }
    
    return [port];
}

/**
 * Helper function to build a flat graph representation from Hapag-Lloyd data
 */
function buildFlatGraphFromHapagData(hapagData, startPort) {
    const flatGraph = {};
    
    // Initialize with start port
    flatGraph[startPort] = [];
    
    // Process each route and its legs
    (hapagData.routes || []).forEach(route => {
        let previousPort = null;
        
        route.legs.forEach((leg, index) => {
            const originPort = leg.originLocation.locationCode;
            const destPort = leg.destinationLocation.locationCode;
            
            // Initialize port entries if they don't exist
            if (!flatGraph[originPort]) {
                flatGraph[originPort] = [];
            }
            
            if (!flatGraph[destPort]) {
                flatGraph[destPort] = [];
            }
            
            // Create voyage and add to origin port
            const voyage = createVoyageFromLeg(leg, route, index);
            flatGraph[originPort].push(voyage);
            
            previousPort = destPort;
        });
    });
    
    return flatGraph;
}

/**
 * Helper function to build complete routes from Hapag-Lloyd data
 */
function buildCompleteRoutesFromHapagData(hapagData, startPort, endPort) {
    const completeRoutes = [];
    
    (hapagData.routes || []).forEach((route, routeIndex) => {
        // Skip if no legs
        if (!route.legs || route.legs.length === 0) return;
        
        // Build the path and voyages for this route
        const path = [startPort];
        const voyages = [];
        
        route.legs.forEach((leg, index) => {
            const destPort = leg.destinationLocation.locationCode;
            path.push(destPort);
            
            const voyage = createVoyageFromLeg(leg, route, index);
            voyages.push(voyage);
        });
        
        const completeRoute = {
            id: `route-${routeIndex}`,
            path,
            voyages,
            totalDuration: calculateTotalDuration(route),
            totalStops: route.legs.length,
            departureTime: voyages[0]?.departureTime || '',
            arrivalTime: voyages[voyages.length - 1]?.arrivalTime || ''
        };
        
        completeRoutes.push(completeRoute);
    });
    
    return completeRoutes;
}

/**
 * Create a voyage object from a Hapag-Lloyd leg
 */
function createVoyageFromLeg(leg, route, legIndex) {
    const scheduleItems = [];
    
    // Add origin port to schedule
    scheduleItems.push({
        port: leg.originLocation.locationCode,
        portName: leg.originLocation.locationName,
        eta: '', // No arrival at origin
        etd: formatDateForDisplay(leg.departureDateTime)
    });
    
    // Add destination port to schedule
    scheduleItems.push({
        port: leg.destinationLocation.locationCode,
        portName: leg.destinationLocation.locationName,
        eta: formatDateForDisplay(leg.arrivalDateTime),
        etd: '' // No departure at destination for this leg
    });
    
    // Add transit stops if available
    if (leg.transitStops && leg.transitStops.length > 0) {
        leg.transitStops.forEach(stop => {
            scheduleItems.splice(scheduleItems.length - 1, 0, {
                port: stop.locationCode,
                portName: stop.locationName,
                eta: formatDateForDisplay(stop.arrivalDateTime),
                etd: formatDateForDisplay(stop.departureDateTime)
            });
        });
    }
    
    // Build voyage object
    return {
        shipId: leg.service?.serviceCode || `service-${legIndex}`,
        shipName: leg.service?.serviceName || `Service ${legIndex + 1}`,
        voyage: leg.service?.serviceCode || `voyage-${legIndex}`,
        fromPort: leg.originLocation.locationCode,
        fromPortName: leg.originLocation.locationName,
        toPort: leg.destinationLocation.locationCode,
        toPortName: leg.destinationLocation.locationName,
        departureTime: leg.departureDateTime,
        arrivalTime: leg.arrivalDateTime,
        schedule: scheduleItems,
        etd: formatDateForDisplay(leg.departureDateTime),
        eta: formatDateForDisplay(leg.arrivalDateTime),
        depth: legIndex,
        path: [], // Will be populated by caller
        parentVoyage: null,
        routeId: route.routeId || `route-${legIndex}`
    };
}

/**
 * Calculate total duration of a route in days
 */
function calculateTotalDuration(route) {
    if (!route.legs || route.legs.length === 0) return 0;
    
    const firstLeg = route.legs[0];
    const lastLeg = route.legs[route.legs.length - 1];
    
    const startDate = new Date(firstLeg.departureDateTime);
    const endDate = new Date(lastLeg.arrivalDateTime);
    
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * Get maximum depth (number of hops) from Hapag-Lloyd routes
 */
function getMaxDepthFromHapagRoutes(routes) {
    let maxDepth = 0;
    
    routes.forEach(route => {
        if (route.legs && route.legs.length > maxDepth) {
            maxDepth = route.legs.length;
        }
    });
    
    return maxDepth;
}

/**
 * Get port name from port code, if available
 */
function getPortNameFromCode(portCode) {
    // Try to use map function if available
    if (typeof mapPortToName === 'function') {
        return mapPortToName(portCode) || portCode;
    }
    
    // Common ports as fallback
    const portMap = {
        'INCOK': 'Cochin, India',
        'NLAMS': 'Amsterdam, Netherlands',
        'USNYC': 'New York, USA',
        'SGSIN': 'Singapore',
        'CNSHA': 'Shanghai, China',
        'AEDXB': 'Dubai, UAE',
        'DEHAM': 'Hamburg, Germany',
        'JPNGO': 'Nagoya, Japan',
        'GBSOU': 'Southampton, UK',
        'AUBNE': 'Brisbane, Australia'
    };
    
    return portMap[portCode] || portCode;
}

/**
 * Format date for display in a human-readable format
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date string
 */
function formatDateForDisplay(dateString) {
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
}
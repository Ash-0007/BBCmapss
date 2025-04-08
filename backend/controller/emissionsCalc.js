// emissions-calculator.js
const { getDbClient } = require('../config/db');
// Cache for emissions calculations
const emissionsCache = {
    air: new Map(),
    sea: new Map(),
    transfer: new Map(),
    
    // Generate a cache key for air emissions
    getAirKey(latFrom, lngFrom, latTo, lngTo, weight) {
        return `${latFrom},${lngFrom}-${latTo},${lngTo}-${weight}`;
    },
    
    // Generate a cache key for air emissions by airport codes
    getAirportKey(fromCode, toCode, weight) {
        return `${fromCode}-${toCode}-${weight}`;
    },
    
    // Generate a cache key for sea emissions
    getSeaKey(fromPort, toPort, shippingLine) {
        return `${fromPort}-${toPort}-${shippingLine}`;
    },
    
    // Generate a cache key for transfer emissions
    getTransferKey(distance, mode) {
        return `${distance}-${mode}`;
    },
    
    // Get cached air emissions
    getAir(latFrom, lngFrom, latTo, lngTo, weight) {
        const key = this.getAirKey(latFrom, lngFrom, latTo, lngTo, weight);
        return this.air.get(key);
    },
    
    // Get cached air emissions by airport codes
    getAirByAirports(fromCode, toCode, weight) {
        const key = this.getAirportKey(fromCode, toCode, weight);
        return this.air.get(key);
    },
    
    // Get cached sea emissions
    getSea(fromPort, toPort, shippingLine) {
        const key = this.getSeaKey(fromPort, toPort, shippingLine);
        return this.sea.get(key);
    },
    
    // Get cached transfer emissions
    getTransfer(distance, mode) {
        const key = this.getTransferKey(distance, mode);
        return this.transfer.get(key);
    },
    
    // Set cached air emissions
    setAir(latFrom, lngFrom, latTo, lngTo, weight, value) {
        const key = this.getAirKey(latFrom, lngFrom, latTo, lngTo, weight);
        this.air.set(key, value);
    },
    
    // Set cached air emissions by airport codes
    setAirByAirports(fromCode, toCode, weight, value) {
        const key = this.getAirportKey(fromCode, toCode, weight);
        this.air.set(key, value);
    },
    
    // Set cached sea emissions
    setSea(fromPort, toPort, shippingLine, value) {
        const key = this.getSeaKey(fromPort, toPort, shippingLine);
        this.sea.set(key, value);
    },
    
    // Set cached transfer emissions
    setTransfer(distance, mode, value) {
        const key = this.getTransferKey(distance, mode);
        this.transfer.set(key, value);
    }
};

// Airport coordinates cache
const airportCache = new Map();

/**
 * Get airport coordinates from the database
 * @param {string} airportCode - IATA airport code
 * @returns {Promise<Object|null>} - Airport coordinates or null if not found
 */
async function getAirportCoordinates(airportCode) {
    console.log(`Getting coordinates for airport: ${airportCode}`);
    
    // Check cache first
    if (airportCache.has(airportCode)) {
        console.log(`Using cached coordinates for ${airportCode}`);
        return airportCache.get(airportCode);
    }
    
    let client;
    try {
        console.log('Connecting to database...');
        client = await getDbClient();
        console.log('Database connection established');
        
        const query = `
            SELECT 
                iata_code,
                latitude_dd,
                longitude_dd,
                airport_name
            FROM airports
            WHERE iata_code = $1
        `;
        
        console.log(`Executing query for airport code: ${airportCode}`);
        const result = await client.query(query, [airportCode]);
        
        if (result.rows.length === 0) {
            console.error(`Airport with code ${airportCode} not found in database`);
            
            // Try to find similar airport codes for debugging
            try {
                const similarQuery = `
                    SELECT iata_code, airport_name
                    FROM airports
                    WHERE iata_code LIKE $1
                    LIMIT 5
                `;
                const similarResult = await client.query(similarQuery, [`%${airportCode}%`]);
                if (similarResult.rows.length > 0) {
                    console.log(`Similar airport codes found: ${similarResult.rows.map(row => row.iata_code).join(', ')}`);
                }
            } catch (similarError) {
                console.error('Error finding similar airport codes:', similarError);
            }
            
            return null;
        }
        
        const airport = {
            code: result.rows[0].iata_code,
            name: result.rows[0].airport_name,
            latitude: parseFloat(result.rows[0].latitude_dd),
            longitude: parseFloat(result.rows[0].longitude_dd)
        };
        
        console.log(`Found airport: ${airport.name} (${airport.code}) at coordinates: ${airport.latitude}, ${airport.longitude}`);
        
        // Cache the result
        airportCache.set(airportCode, airport);
        
        return airport;
    } catch (error) {
        console.error(`Error fetching airport coordinates for ${airportCode}:`, error);
        return null;
    } finally {
        if (client) {
            console.log('Releasing database connection');
            client.release();
        }
    }
}

// Shared token function
async function getToken() {
    const url = "https://www.searates.com/auth/platform-token?id=1";
    const headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.searates.com",
        "Referer": "https://www.searates.com/carbon-emissions-calculator/",
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error getting token:', error);
        return null;
    }
}

/**
 * Calculate air emissions by airport codes
 * @param {string} fromAirport - IATA code of origin airport
 * @param {string} toAirport - IATA code of destination airport
 * @param {number} weight - Weight of cargo in tons (default: 0.001)
 * @returns {Promise<number|null>} - CO2 emissions or null if calculation failed
 */
async function calculateAirEmissionsByAirportCodes(fromAirport, toAirport, weight = 0.001) {
    console.log(`Calculating air emissions from ${fromAirport} to ${toAirport} with weight ${weight}`);
    
    // Handle extreme weight values
    if (weight > 1000) {
        console.warn(`Very large weight value: ${weight} tons. This may cause calculation issues.`);
    }
    
    // Check cache first
    const cachedValue = emissionsCache.getAirByAirports(fromAirport, toAirport, weight);
    if (cachedValue !== undefined) {
        console.log(`Using cached air emissions for ${fromAirport} to ${toAirport}`);
        return cachedValue;
    }
    
    // Get coordinates for both airports
    console.log(`Fetching coordinates for ${fromAirport}...`);
    const originAirport = await getAirportCoordinates(fromAirport);
    
    console.log(`Fetching coordinates for ${toAirport}...`);
    const destinationAirport = await getAirportCoordinates(toAirport);
    
    if (!originAirport) {
        console.error(`Could not find coordinates for origin airport: ${fromAirport}`);
        return null;
    }
    
    if (!destinationAirport) {
        console.error(`Could not find coordinates for destination airport: ${toAirport}`);
        return null;
    }
    
    console.log(`Found coordinates for ${fromAirport}: ${originAirport.latitude}, ${originAirport.longitude}`);
    console.log(`Found coordinates for ${toAirport}: ${destinationAirport.latitude}, ${destinationAirport.longitude}`);
    
    // Calculate emissions using coordinates
    console.log(`Calculating emissions with coordinates: ${originAirport.latitude},${originAirport.longitude} to ${destinationAirport.latitude},${destinationAirport.longitude}`);
    
    try {
        const emissions = await calculateAirEmissions({
            latFrom: originAirport.latitude,
            lngFrom: originAirport.longitude,
            latTo: destinationAirport.latitude,
            lngTo: destinationAirport.longitude,
            weight
        });
        
        if (emissions === null) {
            console.error(`Failed to calculate emissions for ${fromAirport} to ${toAirport}`);
            return null;
        }
        
        console.log(`Successfully calculated emissions: ${emissions} metric tons`);
        
        // Cache the result by airport codes
        emissionsCache.setAirByAirports(fromAirport, toAirport, weight, emissions);
        
        return emissions;
    } catch (error) {
        console.error(`Error calculating emissions for ${fromAirport} to ${toAirport}:`, error);
        return null;
    }
}

// Air Emissions Calculator
async function calculateAirEmissions(params) {
    const { latFrom, lngFrom, latTo, lngTo, weight = 0.001 } = params;
    
    console.log(`Calculating air emissions with coordinates: ${latFrom},${lngFrom} to ${latTo},${lngTo} with weight ${weight}`);
    
    // Check cache first
    const cachedValue = emissionsCache.getAir(latFrom, lngFrom, latTo, lngTo, weight);
    if (cachedValue !== undefined) {
        console.log(`Using cached air emissions for ${latFrom},${lngFrom} to ${latTo},${lngTo}`);
        return cachedValue;
    }
    
    console.log('Getting token for API call...');
    const tokenData = await getToken();
    
    if (!tokenData || !tokenData['s-token']) {
        console.error('Failed to get valid token');
        return null;
    }
    
    const token = tokenData['s-token'];
    console.log('Token received successfully');
    
    const url = "https://www.searates.com/graphql_co2";
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Authorization": `Bearer ${token}`,
        "Origin": "https://www.searates.com",
        "Referer": "https://www.searates.com/logistics-explorer/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
    };
    
    const query = `
    {
        co2ByCoordinates(
            latFrom: ${latFrom}
            lngFrom: ${lngFrom}
            latTo: ${latTo}
            lngTo: ${lngTo}
            shippingType: "air"
            transportType: "default"
            isRef: false
            weight: ${weight}
        ) {
            amount
            price
        }
    }`;
    
    console.log('Making API request to calculate emissions...');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`);
            console.error('Response text:', await response.text());
            return null;
        }
        
        const result = await response.json();
        console.log('API response received:', JSON.stringify(result, null, 2));
        
        if (result.errors) {
            console.error('GraphQL errors:', result.errors);
            return null;
        }
        
        // Extract just the amount
        let emissions = result.data?.co2ByCoordinates?.amount || null;
        
        if (emissions === null) {
            console.error('No emissions data found in response');
            return null;
        }
        
        // Convert the emissions value from grams to metric tons for more reasonable numbers
        // 1 metric ton = 1,000,000 grams
        emissions = parseFloat(emissions) / 1000000;
        
        console.log(`Emissions calculated: ${emissions} metric tons`);
        
        // Cache the result (already converted to metric tons)
        emissionsCache.setAir(latFrom, lngFrom, latTo, lngTo, weight, emissions);
        
        return emissions;
    } catch (error) {
        console.error('Error calculating air emissions:', error);
        return null;
    }
}

// Shipping Emissions Calculator
async function getShippingRates(codeFrom, codeTo) {
    const tokenData = await getToken();
    if (!tokenData || !tokenData['s-token']) {
        console.error('Failed to get valid token');
        return null;
    }
    const token = tokenData['s-token'];
    const url = "https://www.searates.com/graphql_co2";
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Authorization": `Bearer ${token}`,
        "Origin": "https://www.searates.com",
        "Referer": "https://www.searates.com/logistics-explorer/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
    };
    const query = `
    {
        co2ByLines(
            codeFrom: "${codeFrom}"
            codeTo: "${codeTo}"
            shippingLine: "MAEU,ONEY,EGLV,HLCU,COSU,CMDU,ZIMU,YMLU,HDMU,MSCU"
            isRef: false
            placeCo2: true
            containerType: "st40"
        ) {
            transShipments {
                type
                distance
                co2 {
                    amount
                    price
                }
            }
            general {
                amount
                price
            }
            transitTime
            scac
            shippingLineName
        }
    }`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error getting shipping rates:', error);
        return null;
    }
}

// Get emissions for specific shipping line (defaults to Hapag-Lloyd)
async function getShippingLineEmissions(codeFrom, codeTo, shippingLine = 'HLCU') {
    // Check cache first
    const cachedValue = emissionsCache.getSea(codeFrom, codeTo, shippingLine);
    if (cachedValue !== undefined) {
        console.log(`Using cached sea emissions for ${codeFrom} to ${codeTo} (${shippingLine})`);
        return cachedValue;
    }
    
    const result = await getShippingRates(codeFrom, codeTo);
    
    if (result && result.data && result.data.co2ByLines) {
        const shippingData = result.data.co2ByLines.find(
            route => route.scac === shippingLine
        );
        
        if (shippingData) {
            // Convert CO2 amount from grams to metric tons
            const totalCO2 = parseFloat(shippingData.general.amount) / 1000000;
            
            // Also convert the transshipment CO2 values if they exist
            const routeDetails = shippingData.transShipments.map(shipment => ({
                ...shipment,
                co2: shipment.co2 ? {
                    amount: parseFloat(shipment.co2.amount) / 1000000,
                    price: shipment.co2.price
                } : shipment.co2
            }));
            
            const emissionsData = {
                shippingLine: shippingData.shippingLineName,
                totalCO2, // Already converted to metric tons
                co2Price: shippingData.general.price,
                transitTime: shippingData.transitTime,
                routeDetails,
                units: 'metric tons'
            };
            
            console.log(`Sea emissions calculated: ${totalCO2} metric tons`);
            
            // Cache the result
            emissionsCache.setSea(codeFrom, codeTo, shippingLine, emissionsData);
            
            return emissionsData;
        } else {
            console.log(`Shipping line ${shippingLine} not found in results`);
            return null;
        }
    } else {
        console.log('No valid shipping rates data received');
        return null;
    }
}

// Calculate transfer emissions
function calculateTransferEmissions(distance, mode = 'road') {
    // Check cache first
    const cachedValue = emissionsCache.getTransfer(distance, mode);
    if (cachedValue !== undefined) {
        console.log(`Using cached transfer emissions for ${distance}km (${mode})`);
        return cachedValue;
    }
    
    // Simple emissions calculation for road transport
    // Average car emits about 0.2 kg CO2 per km
    // 1 metric ton = 1000 kg
    const emissionsKg = distance * 0.2;
    const emissions = emissionsKg / 1000; // Convert to metric tons
    
    console.log(`Transfer emissions calculated: ${emissions} metric tons`);
    
    // Cache the result
    emissionsCache.setTransfer(distance, mode, emissions);
    
    return emissions;
}

// Cache clearing function
function clearEmissionsCache() {
    console.log('Clearing emissions cache');
    emissionsCache.air.clear();
    emissionsCache.sea.clear();
    emissionsCache.transfer.clear();
    console.log('Emissions cache cleared');
}

// Set up periodic cache clearing (every 24 hours)
setInterval(clearEmissionsCache, 24 * 60 * 60 * 1000);

// Export all functions for use in other files
module.exports = {
    getToken,
    calculateAirEmissions,
    calculateAirEmissionsByAirportCodes,
    getAirportCoordinates,
    getShippingRates,
    getShippingLineEmissions,
    calculateTransferEmissions,
    clearEmissionsCache
};
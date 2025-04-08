const fs = require('fs');
const path = require('path');

const voyageCache = {
    data: {},
    typeData: {}, // Additional cache for non-voyage data types
    
    getKey(port, startDate, endDate) {
        return `${port}-${startDate}-${endDate}`;
    },
    
    get(type, key) {
        // If type is provided, use the typeData cache
        if (type && key) {
            if (this.typeData[type] && this.typeData[type][key]) {
                console.log(`[Cache] HIT for ${type}:${key}`);
                return this.typeData[type][key];
            }
            console.log(`[Cache] MISS for ${type}:${key}`);
            return undefined;
        }
        
        // Otherwise, use the legacy method for voyages
        const port = type;
        const startDate = key;
        const endDate = arguments[2];
        
        const legacyKey = this.getKey(port, startDate, endDate);
        const cachedData = this.data[legacyKey];
        if (cachedData) {
            console.log(`[Cache] HIT for key: ${legacyKey} (${cachedData.length} voyages)`);
            return cachedData;
        }
        console.log(`[Cache] MISS for key: ${legacyKey}`);
        return undefined;
    },
    
    set(type, key, data) {
        // If all three arguments are provided and third is not an array, use the typeData cache
        if (type && key && data && !Array.isArray(data)) {
            // Initialize type if not exists
            if (!this.typeData[type]) {
                this.typeData[type] = {};
            }
            
            console.log(`[Cache] Setting data for ${type}:${key}`);
            this.typeData[type][key] = data;
            this.saveToFile();
            return;
        }
        
        // Otherwise, use the legacy method for voyages
        const port = type;
        const startDate = key;
        const endDate = arguments[2];
        const voyages = arguments[3] || data;
        
        if (!Array.isArray(voyages)) {
            console.error('[Cache] ERROR: Voyages must be an array for legacy cache method');
            return;
        }
        
        const legacyKey = this.getKey(port, startDate, endDate);
        console.log(`[Cache] Setting data for key: ${legacyKey} (${voyages.length} voyages)`);
        
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
        
        this.data[legacyKey] = cleanVoyages;
        this.saveToFile();
    },
    
    cleanText(text) {
        if (!text) return '';
        text = String(text);
        return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    },
    
    saveToFile() {
        const cachePath = path.join(__dirname, '..', 'voyage-cache.json');
        const typeDataCachePath = path.join(__dirname, '..', 'type-data-cache.json');
        
        try {
            // Save legacy voyage cache
            fs.writeFileSync(cachePath, JSON.stringify(this.data, null, 2), 'utf8');
            console.log(`[Cache] Saved voyage cache (${Object.keys(this.data).length} entries) to ${cachePath}`);
            
            // Save type data cache
            fs.writeFileSync(typeDataCachePath, JSON.stringify(this.typeData, null, 2), 'utf8');
            
            // Count total entries in typeData
            let totalTypeEntries = 0;
            Object.keys(this.typeData).forEach(type => {
                totalTypeEntries += Object.keys(this.typeData[type]).length;
            });
            
            console.log(`[Cache] Saved type data cache (${totalTypeEntries} entries) to ${typeDataCachePath}`);
        } catch (error) {
            console.error(`[Cache] ERROR saving cache:`, error.message);
        }
    },
    
    loadFromFile() {
        const cachePath = path.join(__dirname, '..', 'voyage-cache.json');
        const typeDataCachePath = path.join(__dirname, '..', 'type-data-cache.json');
        
        // Load legacy voyage cache
        try {
            if (fs.existsSync(cachePath)) {
                console.log(`[Cache] Attempting to load voyage cache from ${cachePath}`);
                const cacheData = fs.readFileSync(cachePath, 'utf8');
                
                if (!cacheData || cacheData.trim() === '') {
                    console.warn(`[Cache] WARN: Cache file ${cachePath} is empty. Starting with empty cache.`);
                    this.data = {};
                } else {
                    this.data = JSON.parse(cacheData);
                    console.log(`[Cache] Successfully loaded voyage cache from ${cachePath} with ${Object.keys(this.data).length} entries.`);
                    
                    console.log('[Cache] Loaded voyage data summary:');
                    Object.keys(this.data).forEach(key => {
                        if (key.includes('-')) {
                            const [port, startDate, endDate] = key.split('-');
                            console.log(`  - ${port} [${startDate} to ${endDate}]: ${this.data[key].length} voyages`);
                        } else {
                            console.log(`  - ${key}: ${this.data[key].length} entries`);
                        }
                    });
                }
            } else {
                console.log(`[Cache] No voyage cache file found at ${cachePath}. Starting with empty cache.`);
                this.data = {};
            }
        } catch (error) {
            console.error(`[Cache] ERROR loading voyage cache from ${cachePath}:`, error.message);
            console.warn(`[Cache] Starting with an empty cache due to error.`);
            this.data = {};
        }
        
        // Load type data cache
        try {
            if (fs.existsSync(typeDataCachePath)) {
                console.log(`[Cache] Attempting to load type data cache from ${typeDataCachePath}`);
                const typeDataCache = fs.readFileSync(typeDataCachePath, 'utf8');
                
                if (!typeDataCache || typeDataCache.trim() === '') {
                    console.warn(`[Cache] WARN: Type data cache file ${typeDataCachePath} is empty. Starting with empty type data cache.`);
                    this.typeData = {};
                } else {
                    this.typeData = JSON.parse(typeDataCache);
                    
                    // Count total entries in typeData
                    let totalTypeEntries = 0;
                    Object.keys(this.typeData).forEach(type => {
                        totalTypeEntries += Object.keys(this.typeData[type]).length;
                    });
                    
                    console.log(`[Cache] Successfully loaded type data cache from ${typeDataCachePath} with ${totalTypeEntries} entries.`);
                    
                    console.log('[Cache] Loaded type data summary:');
                    Object.keys(this.typeData).forEach(type => {
                        console.log(`  - ${type}: ${Object.keys(this.typeData[type]).length} entries`);
                    });
                }
            } else {
                console.log(`[Cache] No type data cache file found at ${typeDataCachePath}. Starting with empty type data cache.`);
                this.typeData = {};
            }
        } catch (error) {
            console.error(`[Cache] ERROR loading type data cache from ${typeDataCachePath}:`, error.message);
            console.warn(`[Cache] Starting with an empty type data cache due to error.`);
            this.typeData = {};
        }
    }
};

module.exports = voyageCache; 
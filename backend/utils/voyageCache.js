const fs = require('fs');
const path = require('path');

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
        const cachePath = path.join(__dirname, '..', 'voyage-cache.json');
        try {
            fs.writeFileSync(cachePath, JSON.stringify(this.data, null, 2), 'utf8');
            console.log(`[Cache] Saved voyage cache (${Object.keys(this.data).length} entries) to ${cachePath}`);
        } catch (error) {
            console.error(`[Cache] ERROR saving voyage cache to ${cachePath}:`, error.message);
        }
    },
    
    loadFromFile() {
        const cachePath = path.join(__dirname, '..', 'voyage-cache.json');
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

module.exports = voyageCache; 
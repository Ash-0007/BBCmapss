const logger = {
    info: (context, message) => console.log(`[${new Date().toISOString()}] [${context}] ${message}`),
    warn: (context, message) => console.warn(`[${new Date().toISOString()}] [${context}] WARN: ${message}`),
    error: (context, message) => console.error(`[${new Date().toISOString()}] [${context}] ERROR: ${message}`),
    debug: (context, message) => process.env.DEBUG && console.debug(`[${new Date().toISOString()}] [${context}] DEBUG: ${message}`)
};

module.exports = logger; 
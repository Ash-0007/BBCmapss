/**
 * Get port name from code using the shipping data
 * @param {string} portCode - Port code
 * @returns {string} Port name or original code if not found
 */
function getPortNameFromCode(portCode) {
    // This is a placeholder. In the actual implementation, you'd want to use
    // the shippingData loaded from your data files
    const portMappings = {
        // Common ports, can be expanded
        'CNSHA': 'Shanghai',
        'HKHKG': 'Hong Kong',
        'SGSIN': 'Singapore',
        'USNYC': 'New York',
        'USLAX': 'Los Angeles',
        'NLRTM': 'Rotterdam',
        'DEHAM': 'Hamburg',
        'JPNGY': 'Nagoya',
        'GBFXT': 'Felixstowe',
        'USLGB': 'Long Beach',
        'CNNGB': 'Ningbo',
        'CNSZX': 'Shenzhen',
        'KRPUS': 'Busan',
        'MAPTM': 'Port Klang',
        'AEDXB': 'Dubai',
        'TWKHH': 'Kaohsiung',
        'BRRIG': 'Rio Grande',
        'ITGOA': 'Genoa',
        'ESVLC': 'Valencia',
    };

    return portMappings[portCode] || portCode;
}

/**
 * Correct a port code by standardizing format
 * @param {string} portCode - Port code to correct
 * @returns {string} Corrected port code
 */
function correctPortCode(portCode) {
    if (!portCode) return '';
    
    // Convert to uppercase and remove non-alphanumeric characters
    portCode = portCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Handle special cases or known port code formats
    // If it's already a valid 5-character port code
    if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(portCode)) {
        return portCode;
    }
    
    // More logic can be added for specific port code formats
    
    return portCode;
}

/**
 * Map port name to port code
 * @param {string} port - Port name
 * @returns {string} Port code
 */
function mapPortToCode(port) {
    // This mapping should be expanded based on your data
    const portCodeMap = {
        'Shanghai': 'CNSHA',
        'Hong Kong': 'HKHKG',
        'Singapore': 'SGSIN',
        'New York': 'USNYC',
        'Los Angeles': 'USLAX',
        'Rotterdam': 'NLRTM',
        'Hamburg': 'DEHAM',
        'Nagoya': 'JPNGY',
        'Felixstowe': 'GBFXT',
        'Long Beach': 'USLGB'
    };
    
    // Try direct mapping
    if (portCodeMap[port]) {
        return portCodeMap[port];
    }
    
    // If the port is already a code (like CNSHA), return as is
    if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(port)) {
        return port;
    }
    
    // Otherwise return the port as is
    return port;
}

module.exports = {
    getPortNameFromCode,
    correctPortCode,
    mapPortToCode
}; 
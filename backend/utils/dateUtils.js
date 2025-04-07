/**
 * Formats a date in YYYYMMDD format
 * @param {Date} date - The date to format
 * @returns {string} Formatted date
 */
function formatDateYYYYMMDD(date) {
    if (!date) date = new Date();
    if (!(date instanceof Date)) date = new Date(date);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}${month}${day}`;
}

/**
 * Adds days to a date string in YYYYMMDD format
 * @param {string} dateStr - Date in YYYYMMDD format
 * @param {number} days - Days to add
 * @returns {string} New date in YYYYMMDD format
 */
function addDaysToDate(dateStr, days) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    
    const date = new Date(year, month, day);
    date.setDate(date.getDate() + days);
    
    return formatDateYYYYMMDD(date);
}

/**
 * Format a date string for display (MM/DD/YYYY)
 * @param {string} dateStr - Date string
 * @returns {string} Formatted date
 */
function formatDateForDisplay(dateStr) {
    // Handle MMM DD, YYYY format
    if (dateStr.match(/[A-Za-z]{3} \d{1,2}, \d{4}/)) {
        return dateStr;
    }
    
    // Try to parse as ISO or similar
    try {
        const date = new Date(dateStr);
        
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
    } catch (e) {
        // If parsing fails, continue with manual parsing
    }
    
    // Try YYYYMMDD format
    if (dateStr.length === 8 && !isNaN(parseInt(dateStr))) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        const monthNames = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];
        
        const monthIndex = parseInt(month, 10) - 1;
        return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
    }
    
    // Default fallback
    return dateStr;
}

module.exports = {
    formatDateYYYYMMDD,
    addDaysToDate,
    formatDateForDisplay
}; 
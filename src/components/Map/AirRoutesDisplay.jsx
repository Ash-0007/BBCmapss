import React from 'react';
import AirRoutesPage from '../AirRoutes/AirRoutesPage'; // Import the simplified page component
import styles from '../../assets/MapComponent.module.scss';

// Fix the prop list to include startAirport and endAirport again
const AirRoutesDisplay = ({ startAirport, endAirport, flightDate }) => {
    // Check if all required props are available
    if (!flightDate) {
        return (
            <div className={styles.airRoutesContainer}>
                <h4 className={styles.airRoutesTitle}>Air Routes</h4>
                <p className={styles.infoMessage}>Please select a date to search for air routes.</p>
            </div>
        );
    }

    if (!startAirport || !endAirport) {
        return (
            <div className={styles.airRoutesContainer}>
                <h4 className={styles.airRoutesTitle}>Air Routes</h4>
                <p className={styles.infoMessage}>Please select both origin and destination airports.</p>
            </div>
        );
    }

    // Format the date if it's a Date object
    const formattedDate = flightDate instanceof Date 
        ? flightDate.toISOString().split('T')[0] 
        : flightDate;

    // Sanitize airport codes
    const originCode = startAirport.code ? startAirport.code.replace(/[^\x00-\x7F]/g, '') : '';
    const destCode = endAirport.code ? endAirport.code.replace(/[^\x00-\x7F]/g, '') : '';

    // Render AirRoutesPage with all necessary props
    return (
        <div className={styles.airRoutesContainer}>
            <h4 className={styles.airRoutesTitle}>
                Air Routes
                <span style={{ fontSize: '0.9rem', marginLeft: '8px', color: '#64748b' }}>
                    {originCode} → {destCode}
                </span>
            </h4>
            <AirRoutesPage 
                origin={originCode}
                destination={destCode}
                flightDate={formattedDate}
            />
        </div>
    );
};

export default AirRoutesDisplay; 
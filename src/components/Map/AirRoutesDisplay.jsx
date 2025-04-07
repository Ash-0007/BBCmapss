import React, { useState, useEffect } from 'react';
import styles from '../../assets/MapComponent.module.scss';
import { fetchAirRoutes } from '@/services/api';

const AirRoutesDisplay = ({ startAirport, endAirport, dateRange }) => {
    const [airRoutes, setAirRoutes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [serverResponse, setServerResponse] = useState(null); // Store raw server response for debugging
    const [showDebugInfo, setShowDebugInfo] = useState(false); // Toggle for debug information

    useEffect(() => {
        if (!startAirport || !endAirport) return;
        

        const sanitizeCode = (code) => {
            if (!code) return '';

            return code.replace(/[^\x00-\x7F]/g, '');
        };
        
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setErrorType(null);
            setServerResponse(null);
            
            try {
                const formattedDate = dateRange ? dateRange.startDate : new Date().toISOString().split('T')[0];
                

                const originCode = sanitizeCode(startAirport.code);
                const destCode = sanitizeCode(endAirport.code);
                
                console.log(`Fetching air routes from ${originCode} to ${destCode} on ${formattedDate}`);
                
                const data = await fetchAirRoutes(originCode, destCode, formattedDate);
                

                console.log('============= FETCHED AIR CARGO DATA =============');
                console.log('Request parameters:', { 
                    origin: originCode, 
                    destination: destCode,
                    date: formattedDate 
                });
                console.log('Response data:', JSON.stringify(data, null, 2));
                console.log('=================================================');
                
                if (data.records && Array.isArray(data.records)) {
                    setAirRoutes(data.records);
                    console.log(`Successfully loaded ${data.records.length} air routes`);
                } else {
                    console.warn('Unexpected API response format:', data);
                    setAirRoutes([]);

                    setServerResponse(data);
                }
            } catch (err) {
                console.error('Error fetching air routes:', err);
                

                let errorDetails = err.message || 'Unknown error';
                setServerResponse({ error: errorDetails });
                

                if (err.message.includes('500')) {
                    setError('The air cargo API server encountered an error. This may be due to an expired authentication token or malformed request data.');
                    setErrorType('server');
                } else if (err.message.includes('401')) {
                    setError('Authentication with the cargo API failed. The API token has expired or is invalid.');
                    setErrorType('auth');
                } else if (err.message.includes('ByteString') || err.message.includes('character')) {
                    setError('The API encountered an encoding error. Some special characters in airport data are not supported.');
                    setErrorType('encoding');
                } else {
                    setError(err.message);
                    setErrorType('general');
                }
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, [startAirport, endAirport, dateRange]);
    
    const formatDateTime = (dateTimeStr) => {
        if (!dateTimeStr) return "";
        
        const date = new Date(dateTimeStr);
        

        const day = new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
        

        const time = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(date);
        
        return (
            <div>
                <div className={styles.day}>{day}</div>
                <div className={styles.time}>{time}</div>
            </div>
        );
    };
    

    const calculateDuration = (departureTime, arrivalTime) => {
        if (!departureTime || !arrivalTime) return "";
        
        const departure = new Date(departureTime);
        const arrival = new Date(arrivalTime);
        const durationMs = arrival - departure;
        
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    };
    

    const toggleDebugInfo = () => {
        setShowDebugInfo(prev => !prev);
    };
    
    if (loading) {
        return <div className={styles.loadingContainer}>Loading air routes</div>;
    }
    
    if (error) {
        return (
            <div className={styles.errorContainer}>
                <div className={styles.errorTitle}>Error</div>
                <div className={styles.errorMessage}>{error}</div>
                <div className={styles.errorHelp}>
                    {errorType === 'auth' && (
                        "The API authentication token needs to be updated. Please contact the administrator."
                    )}
                    {errorType === 'encoding' && (
                        "The system can't process some special characters in the airport data. Try different airports."
                    )}
                    {errorType === 'server' && (
                        "The server encountered an error processing your request. Check the server logs for details."
                    )}
                    {errorType === 'general' && (
                        "Please try again later or contact the administrator for assistance."
                    )}
                </div>
                
                <button className={styles.debugButton} onClick={toggleDebugInfo}>
                    {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
                </button>
                
                {showDebugInfo && serverResponse && (
                    <div className={styles.debugInfo}>
                        <h4>Server Response Details:</h4>
                        <pre>
                            {JSON.stringify(serverResponse, null, 2)}
                        </pre>
                        <h4>Request Information:</h4>
                        <ul>
                            <li><strong>Origin:</strong> {startAirport.code}</li>
                            <li><strong>Destination:</strong> {endAirport.code}</li>
                            <li><strong>Date:</strong> {dateRange ? dateRange.startDate : new Date().toISOString().split('T')[0]}</li>
                        </ul>
                        <p className={styles.debugTip}>
                            Check your browser console and server logs for more detailed error information.
                        </p>
                    </div>
                )}
            </div>
        );
    }
    
    if (!airRoutes.length) {
        return <div className={styles.noRoutesContainer}>No air routes found between selected airports.</div>;
    }
    
    return (
        <div className={styles.airRoutesContainer}>
            <h4 className={styles.airRoutesTitle}>
                Air Routes
                <span style={{ fontSize: '0.9rem', marginLeft: '8px', color: '#64748b' }}>
                    {startAirport.code} → {endAirport.code}
                </span>
            </h4>
            <div className={styles.airRoutesList}>
                {airRoutes.map((route, routeIndex) => (
                    <div key={routeIndex} className={styles.airRouteItem}>
                        <h5>
                            Route Option {routeIndex + 1}
                            {route.length > 1 && (
                                <span className={styles.connectionIndicator}>
                                    {route.length - 1} {route.length - 1 === 1 ? 'Connection' : 'Connections'}
                                </span>
                            )}
                        </h5>
                        {route.map((flight, flightIndex) => (
                            <div key={flightIndex} className={styles.flightSegment}>
                                <div className={styles.flightHeader}>
                                    <span className={styles.flightNumber}>
                                        {flight.carrierCode} {flight.flightNo}
                                    </span>
                                    <span className={styles.aircraftType}>{flight.aircraftType}</span>
                                </div>
                                
                                <div className={styles.flightRoute}>
                                    <div className={styles.routePoint}>
                                        <div className={styles.airportCode}>{flight.origin}</div>
                                        <div className={styles.flightDateTime}>
                                            {formatDateTime(flight.deptDateTimesLocal[0])}
                                        </div>
                                    </div>
                                    
                                    <div className={styles.routeDivider}>
                                        <div className={styles.routeLine}></div>
                                        {flight.deptDateTimesLocal[0] && flight.arrDateTimesLocal[0] && (
                                            <div className={styles.flightDuration}>
                                                {calculateDuration(flight.deptDateTimesLocal[0], flight.arrDateTimesLocal[0])}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className={styles.routePoint}>
                                        <div className={styles.airportCode}>{flight.destination}</div>
                                        <div className={styles.flightDateTime}>
                                            {formatDateTime(flight.arrDateTimesLocal[0])}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className={styles.flightInfo}>
                                    <span className={styles.duration}>
                                        Flight {flightIndex + 1} of {route.length}
                                    </span>
                                    <div>
                                        <span>Stops: {flight.numberOfStop}</span>
                                        {flight.flightCancelled && (
                                            <span className={styles.flightCancelled}>CANCELLED</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AirRoutesDisplay; 
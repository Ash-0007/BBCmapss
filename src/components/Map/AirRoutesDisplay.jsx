import React, { useState, useEffect } from 'react';
import AirRoutesPage from '../AirRoutes/AirRoutesPage'; // Import the simplified page component
import styles from '../../assets/MapComponent.module.scss';
import { dataStore, transformIntermediateAirRoutesToGraph } from '../../services/api';

// Fix the prop list to include startAirport and endAirport again
const AirRoutesDisplay = ({ startAirport, endAirport, flightDate }) => {
    const [showAirGraph, setShowAirGraph] = useState(false);
    const [airGraphStatus, setAirGraphStatus] = useState('checking');
    const [airGraphInfo, setAirGraphInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Check if air routes graph is available in dataStore
    useEffect(() => {
        const checkAirRoutesGraph = () => {
            if (dataStore && dataStore.airRoutesGraph) {
                const airports = Object.keys(dataStore.airRoutesGraph).length;
                if (airports > 0) {
                    setAirGraphStatus('available');
                    setAirGraphInfo({
                        airports,
                        routes: Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)
                    });
                    console.log(`Air routes graph available with ${airports} airports`);
                    return true;
                } else {
                    setAirGraphStatus('empty');
                }
            } else {
                setAirGraphStatus('unavailable');
            }
            return false;
        };

        // Create the air routes graph if we have intermediate routes in memory
        const createAirRoutesGraph = () => {
            if (checkAirRoutesGraph()) return; // Already exists, no need to create

            if (window.intermediateRoutes) {
                setIsLoading(true);
                console.log('Creating air routes graph from intermediate routes data...');
                try {
                    transformIntermediateAirRoutesToGraph(window.intermediateRoutes);
                    checkAirRoutesGraph(); // Check again after transformation
                } catch (error) {
                    console.error('Error creating air routes graph:', error);
                } finally {
                    setIsLoading(false);
                }
            }
        };

        // Initial check and creation
        createAirRoutesGraph();
        
        // Only check periodically, don't recreate
        const intervalId = setInterval(checkAirRoutesGraph, 5000);
        
        return () => clearInterval(intervalId);
    }, []);

    // Get the enhanced air routes graph
    const getEnhancedAirGraph = () => {
        if (dataStore.airRoutesGraph) {
            setShowAirGraph(true);
            console.log('ENHANCED AIR ROUTES GRAPH:', dataStore.airRoutesGraph);
            window.enhancedAirGraph = dataStore.airRoutesGraph;
            alert('Enhanced Air Routes Graph is now available in the console and at window.enhancedAirGraph');
        } else if (window.intermediateRoutes) {
            setIsLoading(true);
            try {
                const airGraph = transformIntermediateAirRoutesToGraph(window.intermediateRoutes);
                window.enhancedAirGraph = airGraph;
                setShowAirGraph(true);
                console.log('ENHANCED AIR ROUTES GRAPH CREATED:', airGraph);
                alert('Enhanced Air Routes Graph created and available in the console and at window.enhancedAirGraph');
            } catch (error) {
                console.error('Error creating air routes graph:', error);
                alert(`Error: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        } else {
            alert('No intermediate routes data available to transform');
        }
    };

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
                
                {/* Direct button to get enhanced air graph */}
                <button 
                    onClick={getEnhancedAirGraph}
                    style={{
                        marginLeft: '15px',
                        padding: '5px 10px',
                        background: '#4f46e5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }}
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : 'Get Enhanced Air Graph'}
                </button>
            </h4>
            
            {/* Display enhanced air routes graph info */}
            {showAirGraph && dataStore.airRoutesGraph && (
                <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '12px 15px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '0.9rem'
                }}>
                    <h5 style={{ margin: '0 0 8px 0', color: '#1e40af' }}>Enhanced Air Routes Graph</h5>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div><strong>Airports:</strong> {Object.keys(dataStore.airRoutesGraph).length}</div>
                            <div><strong>Total Routes:</strong> {Object.values(dataStore.airRoutesGraph).reduce((sum, routes) => sum + routes.length, 0)}</div>
                        </div>
                        <div>
                            <button 
                                onClick={() => {
                                    console.log('ENHANCED AIR ROUTES GRAPH DETAILS:');
                                    // Log the airports
                                    const airports = Object.keys(dataStore.airRoutesGraph);
                                    console.log(`Airports (${airports.length}):`, airports.join(', '));
                                    
                                    // Log routes count per airport
                                    console.log('Routes per airport:');
                                    airports.forEach(airport => {
                                        const routes = dataStore.airRoutesGraph[airport];
                                        console.log(`- ${airport}: ${routes.length} routes`);
                                        if (routes.length > 0) {
                                            console.log(`  Sample route:`, routes[0]);
                                        }
                                    });
                                    
                                    alert('Enhanced Air Routes Graph details logged to console');
                                }}
                                style={{
                                    padding: '5px 10px',
                                    background: '#1e40af',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                View Detailed Graph
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <AirRoutesPage 
                origin={originCode}
                destination={destCode}
                flightDate={formattedDate}
            />
        </div>
    );
};

export default AirRoutesDisplay; 
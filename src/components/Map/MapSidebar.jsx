import React, { useState, useMemo, useCallback, useEffect } from 'react';
import EfficiencyCard from '../../components/UI/EfficiencyCard.jsx';
import LocationSearch from './LocationSearch';
import DateRangeSelector from './DateRangeSelector';
import ShipRoutesDisplay from './ShipRoutesDisplay';
import AirRoutesDisplay from './AirRoutesDisplay';
import styles from '../../assets/MapComponent.module.scss';
import { fetchMultimodalGraph } from '../../services/api';
import MultimodalGraphVisualization from './MultimodalGraphVisualization';

const MapSidebar = ({ isLoading, nearest = [{ airports: [], seaports: [], trainports: [] }, { airports: [], seaports: [], trainports: [] }], routes = [[], []], onLocationSelect }) => {
    const [dateRange, setDateRange] = useState(null);
    const [showShipRoutes, setShowShipRoutes] = useState(false);
    const [showAirRoutes, setShowAirRoutes] = useState(false);
    const [showTrainRoutes, setShowTrainRoutes] = useState(false);
   
    
    

    const [customStartAirport, setCustomStartAirport] = useState(null);
    const [customEndAirport, setCustomEndAirport] = useState(null);
    const [editingStartAirport, setEditingStartAirport] = useState(false);
    const [editingEndAirport, setEditingEndAirport] = useState(false);
    const [startAirportCode, setStartAirportCode] = useState('');
    const [endAirportCode, setEndAirportCode] = useState('');
    

    // Memoized nearest seaports
    const [startSeaport, endSeaport] = useMemo(() => {
        if (!nearest || !nearest[0] || !nearest[1]) return [null, null];
        return [
            nearest[0]?.seaports?.[0] || null,
            nearest[1]?.seaports?.[0] || null
        ];
    }, [nearest]);
    
    // Memoized nearest trainports
    const [startTrainport, endTrainport] = useMemo(() => {
        if (!nearest || !nearest[0] || !nearest[1]) return [null, null];
        return [
            nearest[0]?.trainports?.[0] || null,
            nearest[1]?.trainports?.[0] || null
        ];
    }, [nearest]);

    const startAirport = useMemo(() => {
        if (customStartAirport) return customStartAirport;
        if (nearest[0]?.airports?.length > 0) {
            const airport = nearest[0].airports[0];
            if (!startAirportCode) setStartAirportCode(airport.code || '');
            return airport;
        }
        return null;
    }, [nearest, customStartAirport, startAirportCode]);

    const endAirport = useMemo(() => {
        if (customEndAirport) return customEndAirport;
        if (nearest[1]?.airports?.length > 0) {
            const airport = nearest[1].airports[0];
            if (!endAirportCode) setEndAirportCode(airport.code || '');
            return airport;
        }
        return null;
    }, [nearest, customEndAirport, endAirportCode]);


    // Can show ship routes if both start and end seaports exist
    const canShowShipRoutes = startSeaport && endSeaport && startSeaport.latitude_dd && endSeaport.latitude_dd;
    
    // Can show train routes if both start and end trainports exist
    const canShowTrainRoutes = startTrainport && endTrainport && startTrainport.latitude_dd && endTrainport.latitude_dd;
    
    // Can show air routes if both start and end airports exist
    const canShowAirRoutes = startAirport && endAirport && startAirport.latitude_dd && endAirport.latitude_dd;

    const nearestPorts = useMemo(() => {
        if (!nearest || !nearest[0]) return [];
        
        const airports = nearest[0].airports.map(airport => ({
            ...airport,
            type: 'airport',
            code: airport.code || `AIR${airport.latitude_dd}${airport.longitude_dd}`.replace(/\./g, '')
        }));
        
        const seaports = nearest[0].seaports.map(seaport => ({
            ...seaport,
            type: 'seaport',
            code: seaport.code || `SEA${seaport.latitude_dd}${seaport.longitude_dd}`.replace(/\./g, '')
        }));
        
        const trainports = (nearest[0].trainports || []).map(trainport => ({
            ...trainport,
            type: 'trainport',
            code: trainport.code || `TRN${trainport.latitude_dd}${trainport.longitude_dd}`.replace(/\./g, ''),
            name: trainport.name || `Train Station ${trainport.latitude_dd.toFixed(2)}, ${trainport.longitude_dd.toFixed(2)}`
        }));
        
        return [...airports, ...seaports, ...trainports];
    }, [nearest]);

    const calculateEfficiency = (type, index) => {
        let items;
        if (type === 'airport') {
            items = nearest[index].airports;
        } else if (type === 'seaport') {
            items = nearest[index].seaports;
        } else if (type === 'trainport') {
            items = nearest[index].trainports || [];
        } else {
            items = [];
        }
        
        return items.map(item => {
            const route = routes[index].find(r => {
                if (type === 'trainport') {
                    return r.name === item.name || 
                        (r.lat === item.latitude_dd && r.lng === item.longitude_dd);
                }
                return r.name === (item.name || item.code) ||
                    (r.lat === item.latitude_dd && r.lng === item.longitude_dd);
            });
            
            return {
                ...item,
                distance: route?.distance || 0,
                time: route?.time || 0,
                efficiency: route ? (route.time / route.distance).toFixed(2) : 'N/A'
            };
        });
    };

    const [selectedOrigin, setSelectedOrigin] = useState(null);
    const [selectedDestination, setSelectedDestination] = useState(null);
    const [startDate, setStartDate] = useState(null);

    const handleDateRangeSelect = (range) => {
        setDateRange(range);
        if (range && range.startDate) {
            setStartDate(range.startDate);
        }
        console.log('Date range selected:', range);
    };

    const handleLocationSelection = useCallback((location, index) => {
        onLocationSelect(location, index);
        
        if (index === 0) {
            setSelectedOrigin(location);
        } else if (index === 1) {
            setSelectedDestination(location);
        }
    }, [onLocationSelect]);

    const toggleShipRoutes = () => {
        setShowShipRoutes(!showShipRoutes);
        if (showAirRoutes) setShowAirRoutes(false);
        if (showTrainRoutes) setShowTrainRoutes(false);
    };

    const toggleAirRoutes = () => {
        setShowAirRoutes(!showAirRoutes);
        if (showShipRoutes) setShowShipRoutes(false);
        if (showTrainRoutes) setShowTrainRoutes(false);
    };
    
    const toggleTrainRoutes = () => {
        setShowTrainRoutes(!showTrainRoutes);
        if (showAirRoutes) setShowAirRoutes(false);
        if (showShipRoutes) setShowShipRoutes(false);
    };
    
    const startEditingAirport = (isStart) => {
        if (isStart) {
            setEditingStartAirport(true);
            setStartAirportCode(startAirport?.code || '');
        } else {
            setEditingEndAirport(true);
            setEndAirportCode(endAirport?.code || '');
        }
    };
    
    const saveAirportCode = (isStart) => {
        if (isStart) {
            setEditingStartAirport(false);
            if (startAirportCode && startAirportCode.trim() !== '') {

                setCustomStartAirport({
                    code: startAirportCode.trim().toUpperCase(),
                    name: startAirportCode.trim().toUpperCase(),
                    latitude_dd: startAirport?.latitude_dd || 0,
                    longitude_dd: startAirport?.longitude_dd || 0,
                    type: 'airport',
                    isCustom: true
                });
            }
        } else {
            setEditingEndAirport(false);
            if (endAirportCode && endAirportCode.trim() !== '') {

                setCustomEndAirport({
                    code: endAirportCode.trim().toUpperCase(),
                    name: endAirportCode.trim().toUpperCase(),
                    latitude_dd: endAirport?.latitude_dd || 0,
                    longitude_dd: endAirport?.longitude_dd || 0,
                    type: 'airport',
                    isCustom: true
                });
            }
        }
    };

    const airports1 = calculateEfficiency('airport', 0);
    const seaports1 = calculateEfficiency('seaport', 0);
    const trainports1 = calculateEfficiency('trainport', 0);
    const airports2 = calculateEfficiency('airport', 1);
    const seaports2 = calculateEfficiency('seaport', 1);
    const trainports2 = calculateEfficiency('trainport', 1);

    useEffect(() => {
        if (startAirport && !editingStartAirport) {
            setStartAirportCode(startAirport.code);
        }
        if (endAirport && !editingEndAirport) {
            setEndAirportCode(endAirport.code);
        }
    }, [startAirport, endAirport, editingStartAirport, editingEndAirport]);

    // Inside the MapSidebar component, add a new state for multimodal graph data
    const [multimodalGraph, setMultimodalGraph] = useState(null);
    const [isLoadingMultimodal, setIsLoadingMultimodal] = useState(false);
    const [multimodalError, setMultimodalError] = useState(null);
    const [showMultimodal, setShowMultimodal] = useState(false);

    // Add a function to fetch multimodal graph data
    const handleFetchMultimodalGraph = useCallback(async () => {
        if (!selectedOrigin || !selectedDestination) {
            setMultimodalError('Please select both origin and destination points');
            return;
        }

        setIsLoadingMultimodal(true);
        setMultimodalError(null);
        
        try {
            const result = await fetchMultimodalGraph(
                selectedOrigin,
                selectedDestination,
                startDate ? new Date(startDate) : new Date(),
                {
                    includeRoad: true,
                    includeSea: true, 
                    includeAir: true,
                    maxSeaConnections: 5,
                    maxAirConnections: 5
                }
            );
            
            console.log('Multimodal graph data:', result);
            setMultimodalGraph(result);
            setShowMultimodal(true);
        } catch (error) {
            console.error('Error fetching multimodal graph:', error);
            setMultimodalError(error.message || 'Failed to fetch multimodal transport graph');
        } finally {
            setIsLoadingMultimodal(false);
        }
    }, [selectedOrigin, selectedDestination, startDate]);

    // Add a useEffect to initialize selectedOrigin and selectedDestination
    useEffect(() => {
        // Check if we have any initial locations in the nearest array
        if (nearest && nearest.length >= 2) {
            if (nearest[0] && nearest[0].location && !selectedOrigin) {
                setSelectedOrigin(nearest[0].location);
            }
            if (nearest[1] && nearest[1].location && !selectedDestination) {
                setSelectedDestination(nearest[1].location);
            }
        }
    }, [nearest, selectedOrigin, selectedDestination]);

    return (
        <aside className={styles.sidebar}>
            {isLoading && <div className={styles.loadingOverlay}>Loading...</div>}

            <h3>Transport Efficiency</h3>

            <div className={styles.searchSection}>
                <h4>Search Locations</h4>
                <LocationSearch onLocationSelect={handleLocationSelection} index={0} />
                <LocationSearch onLocationSelect={handleLocationSelection} index={1} />
                <DateRangeSelector 
                    onDateRangeSelect={handleDateRangeSelect} 
                    nearestPorts={nearestPorts}
                />
                
                {canShowShipRoutes && (
                    <div className={styles.portCodesContainer}>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Origin Port:</span>
                            <span className={styles.portCode}>{startSeaport?.code}</span>
                            <span className={styles.portName}>{startSeaport?.name || startSeaport?.main_port_name}</span>
                        </div>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Destination Port:</span>
                            <span className={styles.portCode}>{endSeaport?.code}</span>
                            <span className={styles.portName}>{endSeaport?.name || endSeaport?.main_port_name}</span>
                        </div>
                        <button 
                            className={styles.shipRoutesButton} 
                            onClick={toggleShipRoutes}
                        >
                            {showShipRoutes ? 'Hide Ship Routes' : 'Show Ship Routes'}
                        </button>
                    </div>
                )}
                
                {canShowTrainRoutes && (
                    <div className={styles.portCodesContainer}>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Origin Station:</span>
                            <span className={styles.portCode}>{startTrainport?.code || 'TRAIN'}</span>
                            <span className={styles.portName}>{startTrainport?.name}</span>
                        </div>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Destination Station:</span>
                            <span className={styles.portCode}>{endTrainport?.code || 'TRAIN'}</span>
                            <span className={styles.portName}>{endTrainport?.name}</span>
                        </div>
                        <button 
                            className={styles.trainRoutesButton} 
                            onClick={toggleTrainRoutes}
                        >
                            {showTrainRoutes ? 'Hide Train Routes' : 'Show Train Routes'}
                        </button>
                    </div>
                )}
                
                {canShowAirRoutes && (
                    <div className={styles.portCodesContainer}>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Origin Airport:</span>
                            <div className={styles.airportCodeWrapper}>
                                {editingStartAirport ? (
                                    <div className={styles.airportCodeEdit}>
                                        <input
                                            type="text"
                                            value={startAirportCode}
                                            onChange={(e) => setStartAirportCode(e.target.value)}
                                            className={styles.airportCodeInput}
                                            maxLength="3"
                                        />
                                        <button className={styles.saveButton} onClick={() => saveAirportCode(true)}>
                                            ✓
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.airportCode} onClick={() => startEditingAirport(true)}>
                                        <span className={styles.portCode}>{startAirport?.code}</span>
                                        <span className={styles.editIcon}>✎</span>
                                    </div>
                                )}
                            </div>
                            <span className={styles.portName}>{startAirport?.name}</span>
                        </div>
                        <div className={styles.portCodeInfo}>
                            <span className={styles.portCodeLabel}>Destination Airport:</span>
                            <div className={styles.airportCodeWrapper}>
                                {editingEndAirport ? (
                                    <div className={styles.airportCodeEdit}>
                                        <input
                                            type="text"
                                            value={endAirportCode}
                                            onChange={(e) => setEndAirportCode(e.target.value)}
                                            className={styles.airportCodeInput}
                                            maxLength="3"
                                        />
                                        <button className={styles.saveButton} onClick={() => saveAirportCode(false)}>
                                            ✓
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.airportCode} onClick={() => startEditingAirport(false)}>
                                        <span className={styles.portCode}>{endAirport?.code}</span>
                                        <span className={styles.editIcon}>✎</span>
                                    </div>
                                )}
                            </div>
                            <span className={styles.portName}>{endAirport?.name}</span>
                        </div>
                        <button 
                            className={styles.airRoutesButton}
                            onClick={toggleAirRoutes}
                        >
                            {showAirRoutes ? 'Hide Air Routes' : 'Show Air Routes'}
                        </button>
                    </div>
                )}
            </div>
            
            {showShipRoutes && canShowShipRoutes && (
                <ShipRoutesDisplay 
                    startSeaport={startSeaport} 
                    endSeaport={endSeaport} 
                    dateRange={dateRange}
                />
            )}
            
            {showAirRoutes && canShowAirRoutes && (
                <AirRoutesDisplay 
                    startAirport={customStartAirport || startAirport} 
                    endAirport={customEndAirport || endAirport} 
                    flightDate={startDate} 
                />
            )}

            <h4>Location 1</h4>
            <div className={styles.section}>
                <h5>Airports</h5>
                {airports1.length > 0 ? (
                    airports1.map(airport => (
                        <EfficiencyCard key={airport.code} item={airport} type="airport" routes={routes[0]} />
                    ))
                ) : (
                    <p>No airports found</p>
                )}
            </div>
            <div className={styles.section}>
                <h5>Seaports</h5>
                {seaports1.length > 0 ? (
                    seaports1.map(seaport => (
                        <EfficiencyCard key={seaport.code} item={seaport} type="seaport" routes={routes[0]} />
                    ))
                ) : (
                    <p>No seaports found</p>
                )}
            </div>
            <div className={styles.section}>
                <h5>Trainports</h5>
                {trainports1.length > 0 ? (
                    trainports1.map(trainport => (
                        <EfficiencyCard key={trainport.code} item={trainport} type="trainport" routes={routes[0]} />
                    ))
                ) : (
                    <p>No trainports found</p>
                )}
            </div>

            <h4>Location 2</h4>
            <div className={styles.section}>
                <h5>Airports</h5>
                {airports2.length > 0 ? (
                    airports2.map(airport => (
                        <EfficiencyCard key={airport.code} item={airport} type="airport" routes={routes[1]} />
                    ))
                ) : (
                    <p>No airports found</p>
                )}
            </div>
            <div className={styles.section}>
                <h5>Seaports</h5>
                {seaports2.length > 0 ? (
                    seaports2.map(seaport => (
                        <EfficiencyCard key={seaport.code} item={seaport} type="seaport" routes={routes[1]} />
                    ))
                ) : (
                    <p>No seaports found</p>
                )}
            </div>
            <div className={styles.section}>
                <h5>Trainports</h5>
                {trainports2.length > 0 ? (
                    trainports2.map(trainport => (
                        <EfficiencyCard key={trainport.code} item={trainport} type="trainport" routes={routes[1]} />
                    ))
                ) : (
                    <p>No trainports found</p>
                )}
            </div>

            {showTrainRoutes && canShowTrainRoutes && (
                <div className={styles.trainRoutesContainer}>
                    <h4 className={styles.trainRoutesTitle}>Train Routes</h4>
                    <p>Train routes between {startTrainport?.name} and {endTrainport?.name}</p>
                    <div className={styles.trainStations}>
                        <div className={styles.trainStation}>
                            <h5>🚂 {startTrainport?.name}</h5>
                            <p>Coordinates: {startTrainport?.latitude_dd?.toFixed(4)}, {startTrainport?.longitude_dd?.toFixed(4)}</p>
                        </div>
                        <div className={styles.trainConnector}>→</div>
                        <div className={styles.trainStation}>
                            <h5>🚂 {endTrainport?.name}</h5>
                            <p>Coordinates: {endTrainport?.latitude_dd?.toFixed(4)}, {endTrainport?.longitude_dd?.toFixed(4)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Multimodal Transport Section */}
            <div className={styles.transportEfficiencyPanel}>
                <h3 className={styles.sectionTitle}>Multimodal Transport</h3>
                <p className={styles.sectionDescription}>
                    Analyze and visualize all possible transport connections between origin and destination
                </p>
                
                <div className={styles.controls}>
                    {(!selectedOrigin || !selectedDestination) ? (
                        <div className={styles.infoMessage}>
                            Please select both origin and destination locations to generate a multimodal transport graph.
                        </div>
                    ) : (
                        <button
                            className={styles.actionButton}
                            onClick={handleFetchMultimodalGraph}
                            disabled={isLoadingMultimodal}
                        >
                            {isLoadingMultimodal ? 'Loading...' : 'Generate Multimodal Graph'}
                        </button>
                    )}
                    
                    {showMultimodal && multimodalGraph && (
                        <button
                            className={`${styles.actionButton} ${styles.secondaryButton}`}
                            onClick={() => setShowMultimodal(false)}
                        >
                            Hide Graph
                        </button>
                    )}
                </div>
                
                {multimodalError && (
                    <div className={styles.errorMessage}>
                        {multimodalError}
                    </div>
                )}
                
                {isLoadingMultimodal && (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner}></div>
                        <p>Building multimodal transport graph...</p>
                    </div>
                )}
                
                {showMultimodal && multimodalGraph && (
                    <div className={styles.multimodalContent}>
                        <MultimodalGraphVisualization graphData={multimodalGraph} />
                        
                        {multimodalGraph.pathOptions && multimodalGraph.pathOptions.length > 0 && (
                            <div className={styles.multimodalOptionsList}>
                                <h4>Available Route Options</h4>
                                
                                {multimodalGraph.pathOptions.map((option, index) => (
                                    <div key={index} className={styles.multimodalOption}>
                                        <div className={styles.multimodalOptionHeader}>
                                            <span className={styles.optionTitle}>
                                                Option {index + 1}
                                            </span>
                                            <div>
                                                {option.score && (
                                                    <span className={styles.optionScore}>
                                                        Score: {option.score.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className={styles.transportModes}>
                                            {option.modes.includes('road') && (
                                                <span className={`${styles.transportMode} ${styles.roadMode}`}>
                                                    🚚 Road
                                                </span>
                                            )}
                                            {option.modes.includes('sea') && (
                                                <span className={`${styles.transportMode} ${styles.seaMode}`}>
                                                    🚢 Sea
                                                </span>
                                            )}
                                            {option.modes.includes('air') && (
                                                <span className={`${styles.transportMode} ${styles.airMode}`}>
                                                    ✈️ Air
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className={styles.routeStats}>
                                            <div className={styles.routeStat}>
                                                <span className={styles.value}>{option.totalDistance?.toFixed(0)} km</span>
                                                <span className={styles.label}>Distance</span>
                                            </div>
                                            <div className={styles.routeStat}>
                                                <span className={styles.value}>{option.totalDuration?.toFixed(1)} hrs</span>
                                                <span className={styles.label}>Duration</span>
                                            </div>
                                            <div className={styles.routeStat}>
                                                <span className={styles.value}>${option.totalCost?.toFixed(0)}</span>
                                                <span className={styles.label}>Est. Cost</span>
                                            </div>
                                            <div className={styles.routeStat}>
                                                <span className={styles.value}>{option.totalEmission?.toFixed(0)} kg</span>
                                                <span className={styles.label}>CO₂</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default MapSidebar;
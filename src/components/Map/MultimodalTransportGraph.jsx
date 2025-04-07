import React, { useState, useEffect, useRef } from 'react';
import { fetchMultimodalGraph } from '../../services/api';
import styles from '../../assets/MapComponent.module.scss';

const MultimodalTransportGraph = ({ originLocation, destinationLocation, startDate, options = {} }) => {
    const [graphData, setGraphData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list', 'graph', 'map'
    const canvasRef = useRef(null);
    const mapRef = useRef(null);
    
    // Fetch multimodal graph data when inputs change
    useEffect(() => {
        const fetchGraph = async () => {
            if (!originLocation || !destinationLocation) {
                setError("Origin and destination locations are required");
                return;
            }
            
            setIsLoading(true);
            setError(null);
            
            try {
                console.log('Fetching multimodal graph for:', {
                    origin: originLocation,
                    destination: destinationLocation,
                    startDate,
                    options
                });
                
                const data = await fetchMultimodalGraph(
                    originLocation,
                    destinationLocation,
                    startDate,
                    options
                );
                
                setGraphData(data);
                console.log('Received multimodal graph data:', data);
            } catch (err) {
                console.error('Error fetching multimodal graph:', err);
                setError(err.message || 'Failed to load multimodal transport graph');
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchGraph();
    }, [originLocation, destinationLocation, startDate, options]);
    
    // Draw the transport graph on canvas
    useEffect(() => {
        if (!graphData || !canvasRef.current || viewMode !== 'graph') return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set up colors based on transport mode
        const colors = {
            road: '#4a89dc',   // blue
            sea: '#3d8eb9',    // dark blue
            air: '#5d9cec',    // light blue
            transfer: '#969fa9' // gray
        };
        
        // Calculate node positions based on geographic coordinates
        const nodes = {};
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        // Find coordinate bounds
        Object.values(graphData.nodes).forEach(node => {
            if (node.lat && node.lng) {
                minLat = Math.min(minLat, node.lat);
                maxLat = Math.max(maxLat, node.lat);
                minLng = Math.min(minLng, node.lng);
                maxLng = Math.max(maxLng, node.lng);
            }
        });
        
        // Add padding
        const padding = 40;
        const latRange = maxLat - minLat || 1;
        const lngRange = maxLng - minLng || 1;
        
        // Calculate node positions
        Object.entries(graphData.nodes).forEach(([id, node]) => {
            if (node.lat && node.lng) {
                const x = padding + ((node.lng - minLng) / lngRange) * (width - 2 * padding);
                const y = height - padding - ((node.lat - minLat) / latRange) * (height - 2 * padding);
                nodes[id] = { ...node, x, y };
            } else {
                // Fall back to a calculated position for nodes without coordinates
                const index = Object.keys(nodes).length;
                const x = 100 + (index % 5) * 150;
                const y = 100 + Math.floor(index / 5) * 100;
                nodes[id] = { ...node, x, y };
            }
        });
        
        // Draw edges
        graphData.edges.forEach(edge => {
            const source = nodes[edge.source];
            const target = nodes[edge.target];
            
            if (source && target) {
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.strokeStyle = colors[edge.mode] || colors.transfer;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw arrow at the midpoint
                const midX = (source.x + target.x) / 2;
                const midY = (source.y + target.y) / 2;
                const angle = Math.atan2(target.y - source.y, target.x - source.x);
                
                ctx.beginPath();
                ctx.moveTo(midX, midY);
                ctx.lineTo(midX - 10 * Math.cos(angle - Math.PI / 6), midY - 10 * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(midX - 10 * Math.cos(angle + Math.PI / 6), midY - 10 * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fillStyle = colors[edge.mode] || colors.transfer;
                ctx.fill();
            }
        });
        
        // Draw nodes
        Object.values(nodes).forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
            
            let color;
            switch (node.type) {
                case 'origin':
                case 'destination':
                    color = '#34c38f'; // green
                    break;
                case 'airport':
                    color = '#5d9cec'; // light blue
                    break;
                case 'seaport':
                    color = '#3d8eb9'; // dark blue
                    break;
                default:
                    color = '#969fa9'; // gray
            }
            
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Node label
            ctx.font = '12px Arial';
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.fillText(node.name || node.id, node.x, node.y - 15);
        });
        
    }, [graphData, viewMode]);
    
    // Initialize map view
    useEffect(() => {
        if (!graphData || !mapRef.current || viewMode !== 'map' || !window.google) return;
        
        const map = new window.google.maps.Map(mapRef.current, {
            zoom: 4,
            mapTypeId: 'terrain'
        });
        
        const bounds = new window.google.maps.LatLngBounds();
        const markers = [];
        const polylines = [];
        
        // Add markers for nodes
        Object.values(graphData.nodes).forEach(node => {
            if (node.lat && node.lng) {
                const position = { lat: node.lat, lng: node.lng };
                bounds.extend(position);
                
                let icon;
                switch (node.type) {
                    case 'origin':
                    case 'destination':
                        icon = { url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' };
                        break;
                    case 'airport':
                        icon = { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' };
                        break;
                    case 'seaport':
                        icon = { url: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' };
                        break;
                    default:
                        icon = { url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' };
                }
                
                const marker = new window.google.maps.Marker({
                    position,
                    map,
                    title: node.name || node.id,
                    icon
                });
                
                markers.push(marker);
            }
        });
        
        // Add lines for connections
        graphData.edges.forEach(edge => {
            const source = graphData.nodes[edge.source];
            const target = graphData.nodes[edge.target];
            
            if (source?.lat && source?.lng && target?.lat && target?.lng) {
                let color;
                switch (edge.mode) {
                    case 'road': color = '#4a89dc'; break;
                    case 'sea': color = '#3d8eb9'; break;
                    case 'air': color = '#5d9cec'; break;
                    default: color = '#969fa9';
                }
                
                const polyline = new window.google.maps.Polyline({
                    path: [
                        { lat: source.lat, lng: source.lng },
                        { lat: target.lat, lng: target.lng }
                    ],
                    geodesic: true,
                    strokeColor: color,
                    strokeOpacity: 0.8,
                    strokeWeight: 3
                });
                
                polyline.setMap(map);
                polylines.push(polyline);
            }
        });
        
        // Fit bounds to show all markers
        map.fitBounds(bounds);
        
        // Clean up on unmount
        return () => {
            markers.forEach(marker => marker.setMap(null));
            polylines.forEach(polyline => polyline.setMap(null));
        };
    }, [graphData, viewMode]);
    
    // Calculate optimal routes
    const calculateOptimalRoutes = () => {
        if (!graphData) return [];
        
        // Sort paths by different metrics
        const fastestRoute = [...graphData.paths].sort((a, b) => a.duration - b.duration)[0];
        const cheapestRoute = [...graphData.paths].sort((a, b) => a.cost - b.cost)[0];
        const lowestEmissionsRoute = [...graphData.paths].sort((a, b) => a.emissions - b.emissions)[0];
        
        return [
            { type: 'fastest', ...fastestRoute },
            { type: 'cheapest', ...cheapestRoute },
            { type: 'eco-friendly', ...lowestEmissionsRoute }
        ];
    };
    
    // Format duration for display
    const formatDuration = (hours) => {
        if (!hours && hours !== 0) return 'N/A';
        
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);
        
        if (days > 0) {
            return `${days}d ${remainingHours}h`;
        } else {
            return `${remainingHours}h`;
        }
    };
    
    // Format cost for display
    const formatCost = (cost) => {
        if (!cost && cost !== 0) return 'N/A';
        return `$${cost.toFixed(2)}`;
    };
    
    // Render route card
    const renderRouteCard = (route, index, isSelected) => (
        <div 
            key={`route-${index}`}
            className={`${styles.routeCard} ${isSelected ? styles.selectedRoute : ''}`}
            onClick={() => setSelectedRoute(isSelected ? null : index)}
        >
            <div className={styles.routeCardHeader}>
                <div className={styles.routeBadge}>
                    {route.type === 'fastest' ? '⚡ Fastest' :
                     route.type === 'cheapest' ? '💰 Cheapest' :
                     '🌿 Eco-friendly'}
                </div>
                <div className={styles.routeMetrics}>
                    <div className={styles.routeMetric}>
                        <span className={styles.metricIcon}>⏱</span>
                        <span className={styles.metricValue}>{formatDuration(route.duration)}</span>
                    </div>
                    <div className={styles.routeMetric}>
                        <span className={styles.metricIcon}>💸</span>
                        <span className={styles.metricValue}>{formatCost(route.cost)}</span>
                    </div>
                    <div className={styles.routeMetric}>
                        <span className={styles.metricIcon}>🌍</span>
                        <span className={styles.metricValue}>{route.emissions?.toFixed(2) || 'N/A'} CO2</span>
                    </div>
                </div>
            </div>
            
            {isSelected && (
                <div className={styles.routeDetails}>
                    <div className={styles.routeSegments}>
                        {route.segments.map((segment, segIdx) => (
                            <div key={`segment-${segIdx}`} className={styles.routeSegment}>
                                <div className={styles.segmentHeader}>
                                    <div className={styles.segmentMode}>
                                        {segment.mode === 'air' ? '✈️ Flight' :
                                         segment.mode === 'sea' ? '🚢 Ship' :
                                         segment.mode === 'road' ? '🚚 Road' : '🔄 Transfer'}
                                    </div>
                                    <div className={styles.segmentDuration}>
                                        {formatDuration(segment.duration)}
                                    </div>
                                </div>
                                <div className={styles.segmentPath}>
                                    <div className={styles.segmentLocation}>
                                        <div className={styles.locationDot}></div>
                                        <div className={styles.locationDetails}>
                                            <div className={styles.locationName}>{segment.from.name}</div>
                                            <div className={styles.locationTime}>{segment.departureTime}</div>
                                        </div>
                                    </div>
                                    <div className={styles.pathLine}>
                                        <div className={styles.pathLineInner}></div>
                                    </div>
                                    <div className={styles.segmentLocation}>
                                        <div className={styles.locationDot}></div>
                                        <div className={styles.locationDetails}>
                                            <div className={styles.locationName}>{segment.to.name}</div>
                                            <div className={styles.locationTime}>{segment.arrivalTime}</div>
                                        </div>
                                    </div>
                                </div>
                                {segment.provider && (
                                    <div className={styles.segmentProvider}>
                                        {segment.provider} {segment.service || ''}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
    
    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingGlobe}>
                    <div className={styles.globe}></div>
                    <div className={styles.globeOverlay}></div>
                </div>
                <div className={styles.loadingText}>Building multimodal transport graph...</div>
            </div>
        );
    }
    
    if (error) {
        return <div className={styles.error}>{error}</div>;
    }
    
    if (!graphData) {
        return <div className={styles.noDataMessage}>No route data available</div>;
    }
    
    const optimalRoutes = calculateOptimalRoutes();
    
    return (
        <div className={styles.multimodalGraphContainer}>
            <div className={styles.graphHeader}>
                <h2 className={styles.graphTitle}>
                    Multimodal Transport: {graphData.metadata?.originName || 'Origin'} → {graphData.metadata?.destinationName || 'Destination'}
                </h2>
                <div className={styles.graphStats}>
                    <div className={styles.graphStat}>
                        <span className={styles.statIcon}>📍</span>
                        <span className={styles.statValue}>{Object.keys(graphData.nodes).length}</span>
                        <span className={styles.statLabel}>Locations</span>
                    </div>
                    <div className={styles.graphStat}>
                        <span className={styles.statIcon}>🔄</span>
                        <span className={styles.statValue}>{graphData.edges.length}</span>
                        <span className={styles.statLabel}>Connections</span>
                    </div>
                    <div className={styles.graphStat}>
                        <span className={styles.statIcon}>🛣️</span>
                        <span className={styles.statValue}>{graphData.paths?.length || 0}</span>
                        <span className={styles.statLabel}>Possible Routes</span>
                    </div>
                </div>
            </div>
            
            <div className={styles.viewControls}>
                <button 
                    className={`${styles.viewTab} ${viewMode === 'list' ? styles.activeTab : ''}`}
                    onClick={() => setViewMode('list')}
                >
                    Routes
                </button>
                <button 
                    className={`${styles.viewTab} ${viewMode === 'graph' ? styles.activeTab : ''}`}
                    onClick={() => setViewMode('graph')}
                >
                    Graph
                </button>
                <button 
                    className={`${styles.viewTab} ${viewMode === 'map' ? styles.activeTab : ''}`}
                    onClick={() => setViewMode('map')}
                >
                    Map
                </button>
            </div>
            
            <div className={styles.graphContent}>
                {viewMode === 'list' && (
                    <div className={styles.routesList}>
                        <div className={styles.routesListHeader}>
                            <h3>Optimal Transport Routes</h3>
                            <p className={styles.routesExplanation}>
                                These routes combine road, sea, and air connections for optimal transport.
                            </p>
                        </div>
                        
                        <div className={styles.routeCards}>
                            {optimalRoutes.map((route, index) => 
                                renderRouteCard(route, index, selectedRoute === index)
                            )}
                        </div>
                    </div>
                )}
                
                {viewMode === 'graph' && (
                    <div className={styles.graphView}>
                        <canvas 
                            ref={canvasRef} 
                            width={800} 
                            height={600} 
                            className={styles.graphCanvas}
                        />
                        <div className={styles.graphLegend}>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColor} ${styles.roadColor}`}></div>
                                <div className={styles.legendLabel}>Road</div>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColor} ${styles.seaColor}`}></div>
                                <div className={styles.legendLabel}>Sea</div>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColor} ${styles.airColor}`}></div>
                                <div className={styles.legendLabel}>Air</div>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColor} ${styles.transferColor}`}></div>
                                <div className={styles.legendLabel}>Transfer</div>
                            </div>
                        </div>
                    </div>
                )}
                
                {viewMode === 'map' && (
                    <div 
                        ref={mapRef} 
                        className={styles.mapView}
                        style={{ width: '100%', height: '600px' }}
                    ></div>
                )}
            </div>
        </div>
    );
};

export default MultimodalTransportGraph; 
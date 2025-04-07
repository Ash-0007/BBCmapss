import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap, Circle, LayerGroup, GeoJSON, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './FreightSimulation.css';
import { fetchAllPorts, fetchFreightPorts, fetchSeaRoute } from '../../services/api';

// Map Control component to handle map interactions
function MapController({ nodes, edges, selectedSource, selectedTarget, currentRoute, onNodeSelect, setMap }) {
  const map = useMap();
  
  // Store map reference on mount
  useEffect(() => {
    if (map) {
      setMap(map);
      
      // Force redraw after mounting
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }
  }, [map, setMap]);

  // Update map when bounds or zoom changes
  useEffect(() => {
    if (!map) return;
    
    const handleMoveEnd = () => {
      map.invalidateSize();
    };
    
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);
    
    return () => {
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
    };
  }, [map]);
  
  // Pan to selected nodes
  useEffect(() => {
    if (!map || !selectedSource || !selectedTarget) return;
    
    // If both nodes are the same, zoom to that node
    if (selectedSource.id === selectedTarget.id) {
      map.setView([selectedSource.lat, selectedSource.lon], 6);
    } 
    // If two different nodes selected, fit bounds to include both
    else {
      const bounds = [
        [selectedSource.lat, selectedSource.lon],
        [selectedTarget.lat, selectedTarget.lon]
      ];
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 6 });
    }
  }, [map, selectedSource, selectedTarget]);
  
  return null;
}

// Helper component for rendering edges efficiently
const EdgeRenderer = React.memo(({ edges, nodeMap, currentRoute, selectedSource, selectedTarget, maxRoutesPerBatch = 10000 }) => {
  const [renderedBatches, setRenderedBatches] = useState(1);
  const batchSize = 10000;
  const totalBatches = Math.ceil(edges.length / batchSize);
  
  // Load more batches progressively
  useEffect(() => {
    if (renderedBatches < totalBatches && edges.length > batchSize) {
      const timer = setTimeout(() => {
        setRenderedBatches(prev => Math.min(prev + 1, totalBatches));
        console.log(`Rendering routes batch ${renderedBatches+1} of ${totalBatches}`);
      }, 500); // Delay between batches to prevent UI blocking
      
      return () => clearTimeout(timer);
    }
  }, [renderedBatches, totalBatches, edges.length, batchSize]);
  
  // Calculate edges to show in current batches
  const visibleEdges = edges.slice(0, renderedBatches * batchSize);
  
  // Pre-process and count routes by type
  const routesByType = useMemo(() => {
    const counts = { flight: 0, ship: 0 };
    visibleEdges.forEach(edge => {
      if (edge.mode === 'flight') counts.flight++;
      else if (edge.mode === 'ship') counts.ship++;
    });
    return counts;
  }, [visibleEdges]);
  
  return (
    <>
      {visibleEdges.map((edge, index) => {
        const sourceNode = nodeMap[edge.source];
        const destNode = nodeMap[edge.destination];
        
        // Skip invalid edges
        if (!sourceNode || !destNode || 
            !sourceNode.lat || !sourceNode.lon || 
            !destNode.lat || !destNode.lon) {
          return null;
        }
        
        // Check if this edge is part of the route
        const isRouteEdge = currentRoute && currentRoute.edges && 
                           currentRoute.edges.some(r => 
                               r.source === edge.source && r.destination === edge.destination);
        
        // Check if connected to selected nodes
        const isSelectedEdge = (selectedSource && (edge.source === selectedSource.id || 
                                edge.destination === selectedSource.id)) ||
                               (selectedTarget && (edge.source === selectedTarget.id || 
                                edge.destination === selectedTarget.id));
        
        // Style based on edge properties - make sure ship routes are clearly orange
        const isShipRoute = edge.mode === 'ship';
        const isFlightRoute = edge.mode === 'flight';
        const isTrainRoute = edge.mode === 'train';
        console.log(edge.mode)
        
        // Color scheme - make ship routes (orange) more distinctive from flight routes (blue)
        const color = isRouteEdge ? '#ff3300' : 
                     isShipRoute ? '#ff6f00' : // Bright orange for ship routes
                     isFlightRoute ? '#3388ff' : // Blue for flight routes
                     '#999999'; // Gray fallback
                     
        const weight = isRouteEdge ? 3 : isSelectedEdge ? 2 : 1;
        
        // Make routes more visible in expanded mode
        const opacity = isRouteEdge ? 0.9 : 
                       isSelectedEdge ? 0.8 : 
                       isShipRoute ? 0.5 : 0.3;
        
        // Use different dash patterns for visual distinction
        const dashArray = isFlightRoute ? '4,7' : isShipRoute ? '1,3' : null;
        
        return (
          <Polyline
            key={`edge-${index}`}
            positions={[[sourceNode.lat, sourceNode.lon], [destNode.lat, destNode.lon]]}
            pathOptions={{
              color,
              weight,
              opacity,
              dashArray
            }}
          >
            {(isRouteEdge || isSelectedEdge) && (
              <Popup>
                <div className="edge-popup">
                  <h3>{isShipRoute ? '🚢 Shipping' : '✈️ Flight'} Route</h3>
                  <p>From: {sourceNode.name || sourceNode.id}</p>
                  <p>To: {destNode.name || destNode.id}</p>
                  <p>Duration: {Math.round(edge.duration * 10) / 10} hours</p>
                  <p>Emissions: {Math.round(edge.emissions * 100) / 100} tons CO₂</p>
                  <p>Cost: ${Math.round(edge.cost * 100) / 100}</p>
                </div>
              </Popup>
            )}
          </Polyline>
        );
      })}
      
      {renderedBatches < totalBatches && (
        <div className="loading-more-routes">
          Loaded {renderedBatches * batchSize} of {edges.length} routes 
          ({Math.round((renderedBatches / totalBatches) * 100)}%)
        </div>
      )}
      
      <div className="route-type-stats">
        <div>Flight Routes: {routesByType.flight}</div>
        <div>Ship Routes: {routesByType.ship}</div>
      </div>
    </>
  );
});

// Main FreightMap component
const FreightMap = ({
  nodes,
  edges,
  weatherGrid,
  painPoints,
  selectedSource,
  selectedTarget,
  currentRoute,
  onNodeSelect,
  onWeatherUpdate
}) => {
  const [map, setMap] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [allPorts, setAllPorts] = useState([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(false);
  
  // Sea route state
  const [seaRoute, setSeaRoute] = useState(null);
  const [portsAlongRoute, setPortsAlongRoute] = useState([]);
  const [isLoadingSeaRoute, setIsLoadingSeaRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);
  
  // Fetch all ports when component mounts
  useEffect(() => {
    const loadAllPorts = async () => {
      setIsLoadingPorts(true);
      try {
        const portsData = await fetchAllPorts();
        setAllPorts(portsData);
        console.log(`Loaded ${portsData.length} ports from database`);
      } catch (error) {
        console.error('Error loading ports:', error);
      } finally {
        setIsLoadingPorts(false);
      }
    };
    
    loadAllPorts();
  }, []);
  
  // Function to find sea routes between selected seaports
  const findSeaRoute = useCallback(async () => {
    // Only try to find routes between seaports
    if (!selectedSource || !selectedTarget || 
        selectedSource.type !== 'seaport' || 
        selectedTarget.type !== 'seaport') {
      setSeaRoute(null);
      setPortsAlongRoute([]);
      return;
    }
    
    setIsLoadingSeaRoute(true);
    setRouteError(null);
    
    try {
      // Fetch sea route using port IDs
      const result = await fetchSeaRoute({
        from_port_id: selectedSource.id,
        to_port_id: selectedTarget.id
      });
      
      if (result && result.status === 'ok') {
        setSeaRoute(result.route);
        // Store ports along route for highlighting
        if (result.ports_along_route) {
          setPortsAlongRoute(result.ports_along_route);
        }
      } else {
        setRouteError(result?.error || 'Failed to find a sea route between these ports');
        setSeaRoute(null);
        setPortsAlongRoute([]);
      }
    } catch (error) {
      console.error('Error fetching sea route:', error);
      // Show a more user-friendly error message
      if (error.message.includes('500')) {
        setRouteError('Server error: Check if searoute.jar exists in the backend/data directory');
      } else if (error.message.includes('404')) {
        setRouteError('Sea route endpoint not found. Check backend implementation.');
      } else {
        setRouteError(`Error: ${error.message}`);
      }
      setSeaRoute(null);
      setPortsAlongRoute([]);
    } finally {
      setIsLoadingSeaRoute(false);
    }
  }, [selectedSource, selectedTarget]);
  
  // Find route when source and target change
  useEffect(() => {
    if (selectedSource && selectedTarget && 
        selectedSource.type === 'seaport' && 
        selectedTarget.type === 'seaport') {
      findSeaRoute();
    } else {
      // Clear previous sea route if not looking at seaports
      setSeaRoute(null);
      setPortsAlongRoute([]);
    }
  }, [selectedSource, selectedTarget, findSeaRoute]);
  
  // Filter nodes to display based on a reasonable limit
  const visibleNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    // Always include selected nodes
    const selectedNodes = [];
    if (selectedSource) selectedNodes.push(selectedSource);
    if (selectedTarget && selectedTarget.id !== (selectedSource?.id || '')) {
      selectedNodes.push(selectedTarget);
    }
    
    // For performance, limit the number of displayed nodes
    const maxNodesToShow = isExpanded ? 2000 : 1000;
    
    // First add airports (usually more important), then seaports
    const airports = nodes
      .filter(node => node.type === 'airport' && node.lat && node.lon)
      .slice(0, maxNodesToShow / 2);
      
    const seaports = nodes
      .filter(node => node.type === 'seaport' && node.lat && node.lon)
      .slice(0, maxNodesToShow / 2);
    
    // Combine selected nodes with filtered nodes, removing duplicates
    const nodeIds = new Set(selectedNodes.map(n => n.id));
    const combinedNodes = [...selectedNodes];
    
    [...airports, ...seaports].forEach(node => {
      if (!nodeIds.has(node.id)) {
        combinedNodes.push(node);
        nodeIds.add(node.id);
      }
    });
    
    return combinedNodes.slice(0, maxNodesToShow);
  }, [nodes, selectedSource, selectedTarget, isExpanded]);
  
  // Create a node lookup for faster edge rendering
  const nodeMap = useMemo(() => {
    const map = {};
    if (nodes && nodes.length > 0) {
      nodes.forEach(node => {
        if (node.id) map[node.id] = node;
      });
    }
    return map;
  }, [nodes]);
  
  // Function to check if an edge is part of the current route
  function isRouteEdge(edge) {
    return currentRoute && currentRoute.edges && 
           currentRoute.edges.some(r => 
               r.source === edge.source && r.destination === edge.destination);
  }
  
  // Function to check if an edge connects to a selected endpoint
  function isEndpointEdge(edge) {
    return (selectedSource && (edge.source === selectedSource.id || 
                              edge.destination === selectedSource.id)) ||
           (selectedTarget && (edge.source === selectedTarget.id || 
                              edge.destination === selectedTarget.id));
  }

  // Filter edges for display
  const visibleEdges = useMemo(() => {
    // Create a subset of edges to display based on current view bounds
    if (!edges || edges.length === 0 || !map) return [];
    
    // Get current map bounds
    const bounds = map.getBounds();
    
    // For performance, even if expanded, limit the maximum routes shown
    const maxRoutesToShow = isExpanded ? 5000 : 1000;
    
    // Filter edges - only show shipping routes by default, hide air routes
    const filteredEdges = edges.filter(edge => {
      // Skip flight routes for display, but keep for route calculation
      if (edge.mode === 'flight' && !isRouteEdge(edge) && !isEndpointEdge(edge)) {
        return false;
      }
      
      // For performance, check if the edge has any endpoint within current view
      const sourceNode = nodeMap[edge.source];
      const destNode = nodeMap[edge.destination];
      
      if (!sourceNode || !destNode || 
          !sourceNode.lat || !sourceNode.lon || 
          !destNode.lat || !destNode.lon) {
        return false;
      }
      
      // Always include edges that are part of the selected route
      if (isRouteEdge(edge) || isEndpointEdge(edge)) {
        return true;
      }
      
      // Check if either endpoint is within view bounds
      const isSourceInView = bounds.contains([sourceNode.lat, sourceNode.lon]);
      const isDestInView = bounds.contains([destNode.lat, destNode.lon]);
      
      return isSourceInView || isDestInView;
    });
    
    // If too many edges, limit to the most important ones
    if (filteredEdges.length > maxRoutesToShow) {
      return filteredEdges
        .slice(0, maxRoutesToShow);
    }
    
    return filteredEdges;
  }, [edges, map, isExpanded, nodeMap, selectedSource, selectedTarget, currentRoute]);
  
  // Handle map click for weather
  const handleMapClick = useCallback((e) => {
    if (!onWeatherUpdate) return;
    
    const { lat, lng } = e.latlng;
    const severity = 0.5; // Default severity
    
    if (window.confirm(`Set weather at [${lat.toFixed(2)}, ${lng.toFixed(2)}] to ${Math.round(severity * 100)}% severity?`)) {
      onWeatherUpdate(Math.floor(lat), Math.floor(lng), severity);
    }
  }, [onWeatherUpdate]);
  
  // Add a useMemo to count routes in normal mode too
  const routeTypeCounts = useMemo(() => {
    if (!visibleEdges || visibleEdges.length === 0) return { flight: 0, ship: 0 };
    
    const counts = { flight: 0, ship: 0 };
    visibleEdges.forEach(edge => {
      if (edge.mode === 'flight') counts.flight++;
      else if (edge.mode === 'ship') counts.ship++;
    });
    return counts;
  }, [visibleEdges]);
  
  return (
    <div className="freight-map-container">
      {isLoadingPorts && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading ports...</p>
        </div>
      )}
      
      {/* Toggle button for showing all routes */}
      <div className="map-controls">
        <button 
          className={`toggle-routes-btn ${isExpanded ? 'active' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Hide Routes' : 'Show All Routes'}
        </button>
        {isExpanded && <div className="route-count-badge">{edges.length} routes</div>}
      </div>
      
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={10}
        style={{ height: "100%", width: "100%", minHeight: "700px" }}
        zoomControl={false}
        whenCreated={setMap}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControl position="bottomright" />
        
        {/* All ports layer for freight simulation */}
        <LayerGroup>
          {allPorts.map(port => (
            <CircleMarker
              key={`allport-${port.id}`}
              center={[port.latitude, port.longitude]}
              radius={3}
              eventHandlers={{
                click: () => {
                  const nodeObj = {
                    id: port.id,
                    name: port.name || port.code,
                    lat: port.latitude,
                    lon: port.longitude,
                    type: port.type
                  };
                  
                  // If source not set, set as source
                  // If source set but target not set, set as target
                  // If both set, replace target
                  if (!selectedSource) {
                    onNodeSelect(nodeObj, true);
                  } else if (!selectedTarget) {
                    onNodeSelect(nodeObj, false);
                  } else {
                    onNodeSelect(nodeObj, false); // Replace target by default
                  }
                }
              }}
              pathOptions={{
                color: port.type === 'airport' ? '#3388ff' : '#33cc33',
                fillColor: port.type === 'airport' ? '#3388ff' : '#33cc33',
                fillOpacity: 0.7,
                weight: 1
              }}
            >
              <Popup>
                <div className="port-popup">
                  <strong>{port.name || port.code}</strong><br />
                  <span>Type: {port.type === 'airport' ? '✈️ Airport' : '⚓ Seaport'}</span><br />
                  <span>Code: {port.code}</span><br />
                  <span>Coordinates: {port.latitude.toFixed(4)}, {port.longitude.toFixed(4)}</span>
                  <div className="port-buttons">
                    <button onClick={() => onNodeSelect({
                      id: port.id,
                      name: port.name || port.code,
                      lat: port.latitude,
                      lon: port.longitude,
                      type: port.type
                    }, true)}>
                      Select as Source
                    </button>
                    <button onClick={() => onNodeSelect({
                      id: port.id,
                      name: port.name || port.code,
                      lat: port.latitude,
                      lon: port.longitude,
                      type: port.type
                    }, false)}>
                      Select as Target
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </LayerGroup>
        
        {/* Controller component */}
        <MapController 
          nodes={nodes}
          edges={edges}
          selectedSource={selectedSource}
          selectedTarget={selectedTarget}
          currentRoute={currentRoute}
          onNodeSelect={onNodeSelect}
          setMap={setMap}
        />
        
        {/* Render nodes */}
        {visibleNodes.map((node) => {
          // Determine node style
          const isAirport = node.type === 'airport';
          const isSelected = (selectedSource && node.id === selectedSource.id) || 
                           (selectedTarget && node.id === selectedTarget.id);
          const isOnSeaRoute = portsAlongRoute.some(port => port.id === node.id);
          const isEndpoint = portsAlongRoute.some(port => port.id === node.id && port.is_endpoint);
          
          // Color based on node type and status
          const fillColor = isAirport ? '#3388ff' : 
                           isSelected ? '#ff3300' : 
                           isOnSeaRoute ? '#00cc00' : 
                           '#00cc00'; // Green color for seaports
          
          const radius = isSelected ? 8 : 
                        isEndpoint ? 7 :
                        isOnSeaRoute ? 6 : 
                        4;
          
          return (
            <CircleMarker
              key={`node-${node.id}`}
              center={[node.lat, node.lon]}
              radius={radius}
              eventHandlers={{
                click: () => {
                  // If source not set, set as source
                  // If source set but target not set, set as target
                  // If both set, replace target
                  if (!selectedSource) {
                    onNodeSelect(node, true);
                  } else if (!selectedTarget) {
                    onNodeSelect(node, false);
                  } else {
                    onNodeSelect(node, false); // Replace target by default
                  }
                }
              }}
              pathOptions={{
                fillColor,
                color: isSelected ? '#ff0000' : isOnSeaRoute ? '#008800' : (isAirport ? '#0044cc' : '#008800'),
                weight: isSelected || isOnSeaRoute ? 2 : 1,
                opacity: isSelected ? 1 : 0.8,
                fillOpacity: isSelected ? 0.8 : (isOnSeaRoute ? 0.7 : 0.5)
              }}
            >
              <Popup>
                <div className="port-popup">
                  <h3>{isAirport ? '✈️' : '🚢'} {node.name}</h3>
                  <p>ID: {node.id}</p>
                  <p>Type: {isAirport ? 'Airport' : 'Seaport'}</p>
                  <p>Location: {node.lat.toFixed(4)}, {node.lon.toFixed(4)}</p>
                  <p>Connections: {node.connections || 0}</p>
                  {isSelected && <p><strong>Selected as {node.id === selectedSource?.id ? 'Source' : 'Target'}</strong></p>}
                  {isOnSeaRoute && !isSelected && <p><strong>Port along route</strong></p>}
                  <div className="port-buttons">
                    <button onClick={() => onNodeSelect(node, true)} className={selectedSource?.id === node.id ? 'selected' : ''}>
                      {selectedSource?.id === node.id ? 'Current Source' : 'Select as Source'}
                    </button>
                    <button onClick={() => onNodeSelect(node, false)} className={selectedTarget?.id === node.id ? 'selected' : ''}>
                      {selectedTarget?.id === node.id ? 'Current Target' : 'Select as Target'}
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        
        {/* Display Sea Route from GeoJSON */}
        {seaRoute && (
          <GeoJSON 
            key={`sea-route-${selectedSource?.id}-${selectedTarget?.id}`}
            data={seaRoute}
            style={() => ({
              color: '#00aaff',
              weight: 5,
              opacity: 1.0,
              dashArray: null
            })}
          >
            <Popup>
              <div>
                <h3>Sea Route</h3>
                <p>From: {selectedSource?.name}</p>
                <p>To: {selectedTarget?.name}</p>
                {seaRoute.features && seaRoute.features[0]?.properties?.distKM && (
                  <p>Distance: {Math.round(seaRoute.features[0].properties.distKM)} km</p>
                )}
              </div>
            </Popup>
          </GeoJSON>
        )}

        {/* Loading indicator */}
        {isLoadingSeaRoute && (
          <div className="sea-route-loading">
            <div className="loading-spinner small"></div>
            <span>Finding sea route...</span>
          </div>
        )}
        
        {routeError && (
          <div className="sea-route-error">
            <span>❌ {routeError}</span>
          </div>
        )}
        
        {/* Render edges */}
        {isExpanded ? (
          <EdgeRenderer 
            edges={visibleEdges}
            nodeMap={nodeMap}
            currentRoute={currentRoute}
            selectedSource={selectedSource}
            selectedTarget={selectedTarget}
          />
        ) : (
          visibleEdges.map((edge, index) => {
            const sourceNode = nodeMap[edge.source];
            const destNode = nodeMap[edge.destination];
            
            // Skip invalid edges
            if (!sourceNode || !destNode || 
                !sourceNode.lat || !sourceNode.lon || 
                !destNode.lat || !destNode.lon) {
              return null;
            }
            
            // Style based on edge properties - make sure ship routes are clearly orange
            const isShipRoute = edge.mode === 'ship';
            const isFlightRoute = edge.mode === 'flight';
            
            // Check if the edge is part of a route or connected to selected nodes
            const edgeInRoute = isRouteEdge(edge);
            const edgeWithSelectedNode = isEndpointEdge(edge);
            
            // Color scheme - make ship routes (orange) more distinctive from flight routes (blue)
            const color = edgeInRoute ? '#ff3300' : 
                        isShipRoute ? '#ff6f00' : // Bright orange for ship routes
                        isFlightRoute ? '#3388ff' : // Blue for flight routes
                        '#999999'; // Gray fallback
            
            const weight = edgeInRoute ? 3 : edgeWithSelectedNode ? 2 : 1;
            
            // Make routes more visible
            const opacity = edgeInRoute ? 0.9 : 
                          edgeWithSelectedNode ? 0.8 : 
                          isShipRoute ? 0.6 : 0.4;
            
            // Use different dash patterns for visual distinction
            const dashArray = isFlightRoute ? '4,7' : isShipRoute ? '1,3' : null;
            
            return (
              <Polyline
                key={`edge-${index}`}
                positions={[[sourceNode.lat, sourceNode.lon], [destNode.lat, destNode.lon]]}
                pathOptions={{
                  color,
                  weight,
                  opacity,
                  dashArray
                }}
              >
                {(edgeInRoute || edgeWithSelectedNode) && (
                  <Popup>
                    <div className="edge-popup">
                      <h3>{isShipRoute ? '🚢 Shipping' : '✈️ Flight'} Route</h3>
                      <p>From: {sourceNode.name || sourceNode.id}</p>
                      <p>To: {destNode.name || destNode.id}</p>
                      <p>Duration: {Math.round(edge.duration * 10) / 10} hours</p>
                      <p>Emissions: {Math.round(edge.emissions * 100) / 100} tons CO₂</p>
                      <p>Cost: ${Math.round(edge.cost * 100) / 100}</p>
                    </div>
                  </Popup>
                )}
              </Polyline>
            );
          })
        )}
        
        {/* Weather grid */}
        {weatherGrid && weatherGrid.grid && Object.entries(weatherGrid.grid).map(([key, value]) => {
          if (!value || value <= 0) return null;
          
          // Extract coordinates from key
          const [lat, lon] = key.split(',').map(parseFloat);
          
          // Style based on severity
          const severity = typeof value === 'object' ? value.intensity || 0 : value;
          
          // Use color gradient: blue -> green -> yellow -> red
          let color = '#0000FF'; // Blue
          if (severity > 0.25 && severity <= 0.5) {
            color = '#00FF00'; // Green
          } else if (severity > 0.5 && severity <= 0.75) {
            color = '#FFFF00'; // Yellow
          } else if (severity > 0.75) {
            color = '#FF0000'; // Red
          }
          
          return (
            <Circle
              key={`weather-${key}`}
              center={[lat, lon]}
              radius={50000 + (severity * 50000)}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.5,
                weight: 1
              }}
            >
              <Popup>
                <div>
                  <strong>Weather Severity: {Math.round(severity * 100)}%</strong>
                  <p>Location: {lat}°, {lon}°</p>
                </div>
              </Popup>
            </Circle>
          );
        })}
        
        {/* Pain points */}
        {painPoints && painPoints.map((point, index) => {
          if (!point.lat || !point.lon) return null;
          
          return (
            <CircleMarker
              key={`pain-${index}`}
              center={[point.lat, point.lon]}
              radius={point.severity + 3 || 5}
              pathOptions={{
                fillColor: '#ff00ff',
                color: '#800080',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
              }}
            >
              <Popup>
                <div className="pain-point-popup">
                  <h3>{point.name || 'Issue Area'}</h3>
                  <p>{point.description || 'No description'}</p>
                  <p>Severity: {point.severity || 5}/10</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      
      <div className="freight-map-legend">
        <h3>Legend</h3>
        <div className="freight-legend-item">
          <div className="legend-color" style={{backgroundColor: '#3388ff'}}></div>
          <span>Airports</span>
        </div>
        <div className="freight-legend-item">
          <div className="legend-color" style={{backgroundColor: '#33cc33'}}></div>
          <span>Seaports</span>
        </div>
        <div className="freight-legend-item">
          <div className="legend-color" style={{backgroundColor: '#ff3300'}}></div>
          <span>Selected Ports</span>
        </div>
        {portsAlongRoute.length > 0 && (
          <div className="freight-legend-item">
            <div className="legend-color" style={{backgroundColor: '#008800'}}></div>
            <span>Ports Along Route</span>
          </div>
        )}
        {seaRoute && (
          <div className="freight-legend-item">
            <div className="legend-color" style={{backgroundColor: '#00aaff'}}></div>
            <span>Sea Route</span>
          </div>
        )}
        <div className="freight-legend-item">
          <div className="legend-color" style={{backgroundColor: '#3388ff', border: '1px dashed #fff'}}></div>
          <span><strong>Flight Routes:</strong> Only shown when part of selected route</span>
        </div>
        <div className="freight-legend-item">
          <div className="legend-color" style={{backgroundColor: '#ff6f00', border: '1px dotted #fff'}}></div>
          <span><strong>Ship Routes:</strong> Shown by default</span>
        </div>
        {seaRoute && (
          <div className="freight-legend-item">
            <span><strong>Sea Route Distance:</strong> {Math.round(seaRoute.features?.[0]?.properties?.distKM || 0)} km</span>
          </div>
        )}
      </div>
      
      <div className="freight-map-instructions">
        <p>Click on a node to select source/destination. Click on the map to set weather conditions.</p>
      </div>
      
      {!isExpanded && visibleEdges.length > 0 && (
        <div className="route-type-stats">
          <div>Flight Routes: {routeTypeCounts.flight}</div>
          <div>Ship Routes: {routeTypeCounts.ship}</div>
        </div>
      )}
    </div>
  );
};

export default FreightMap; 
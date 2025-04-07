import React, { useState, useEffect, useMemo, useCallback } from 'react';
import FreightMap from './FreightMap';
import ControlPanel from './ControlPanel';
import MetricsPanel from './MetricsPanel';
import axios from 'axios';
import './FreightSimulation.css';

// Update API URL to allow fallback
const API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000/api' : '/api';

// Configure axios with CORS settings
axios.defaults.withCredentials = true;

const DataSummary = ({ nodes, edges, loading, error }) => {
  // Calculate statistics
  const airports = nodes.filter(node => node.type === 'airport');
  const seaports = nodes.filter(node => node.type === 'seaport');
  const flights = edges.filter(edge => edge.mode === 'flight');
  const ships = edges.filter(edge => edge.mode === 'ship');

  if (loading) {
    return (
      <div className="data-summary-card">
        <div className="card-content">
          <h3>Loading Data...</h3>
          <div className="loading-indicator">
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-summary-card error">
        <div className="card-content">
          <h3>Data Error</h3>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="data-summary-card">
      <div className="card-content">
        <h3>Real Data Summary</h3>
        <div className="data-stats">
          <div className="stat-column">
            <h4>Transport Nodes</h4>
            <div className="stat-chips">
              <span className="stat-chip airport">{airports.length} Airports</span>
              <span className="stat-chip seaport">{seaports.length} Seaports</span>
            </div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-column">
            <h4>Transport Routes</h4>
            <div className="stat-chips">
              <span className="stat-chip flight">{flights.length} Flight Routes</span>
              <span className="stat-chip ship">{ships.length} Shipping Lanes</span>
            </div>
          </div>
        </div>
        <p className="data-source">
          Using real flight data from routes.dat and shipping data from 25.geojson
        </p>
      </div>
    </div>
  );
};

const FreightSimulationPage = () => {
  // State for graph data
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [weatherGrid, setWeatherGrid] = useState({});
  const [painPoints, setPainPoints] = useState([]);
  
  // State for selected nodes and route
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  
  // State for optimization weights
  const [weights, setWeights] = useState({
    duration: 0.4,
    emissions: 0.3,
    cost: 0.3
  });
  
  // State for loading/error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Use useMemo for expensive operations
  const processedNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    // Create an efficient Map for quick lookups (better than repeated .find() calls)
    const nodeMap = new Map();
    
    // Process nodes once instead of repeatedly in render
    nodes.forEach(node => {
      // Create a more memory-efficient representation if needed
      const processedNode = {
        ...node,
        // Add any computed properties here
        isSelected: (selectedSource && node.id === selectedSource.id) || 
                   (selectedTarget && node.id === selectedTarget.id),
        hasDelay: node.delay > 0,
        hasPainPoint: Array.isArray(painPoints) && painPoints.some(p => p.node_id === node.id)
      };
      
      nodeMap.set(node.id, processedNode);
    });
    
    return nodeMap;
  }, [nodes, selectedSource, selectedTarget, painPoints]);
  
  // Optimize edge lookup with useMemo
  const edgeMap = useMemo(() => {
    if (!edges || edges.length === 0) return new Map();
    
    const map = new Map();
    edges.forEach(edge => {
      // Create a unique key for the edge
      const key = `${edge.source}-${edge.destination}`;
      map.set(key, edge);
    });
    
    return map;
  }, [edges]);
  
  // Load initial data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check if API is running with timeout
        console.log('Checking simulation API status...');
        const statusPromise = axios.get(`${API_BASE_URL}/status`, { 
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        const statusRes = await Promise.race([
          statusPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('API request timeout')), 10000))
        ]);
        
        // If simulation is not initialized, initialize it
        if (!statusRes.data.simulation_initialized) {
          console.log('Simulation not initialized. Initializing...');
          try {
            const initRes = await axios.post(`${API_BASE_URL}/simulation/init`, {}, {
              timeout: 10000,
              withCredentials: true
            });
            
            console.log('Simulation initialization result:', initRes.data);
            
            if (!initRes.data.success) {
              setError('Failed to initialize simulation: ' + (initRes.data.error || 'Unknown error'));
              setLoading(false);
              return;
            }
          } catch (initError) {
            console.error('Error initializing simulation:', initError);
            setError('Failed to initialize simulation. Check that the backend API is running.');
            setLoading(false);
            return;
          }
        }
        
        console.log('Fetching initial nodes and graph structure...');
        
        try {
          // First, get a small set of nodes for immediate display (just airports for faster initial load)
          const initialDataPromise = axios.get(`${API_BASE_URL}/graph?limit=200&type=airport`, { 
            timeout: 8000,
            withCredentials: true 
          });
          
          const initialGraphRes = await initialDataPromise;
          
          if (initialGraphRes.data && initialGraphRes.data.nodes) {
            console.log(`Loaded initial ${initialGraphRes.data.nodes.length} nodes for quick display`);
            setNodes(initialGraphRes.data.nodes);
          }
          
          // Load weather and pain points in parallel
          const [weatherRes, painRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/weather`, { timeout: 5000, withCredentials: true }),
            axios.get(`${API_BASE_URL}/pain_points`, { timeout: 5000, withCredentials: true })
          ]);
          
          setWeatherGrid(weatherRes.data);
          setPainPoints(painRes.data.pain_points || []);
          
          // Now load data in chunks
          const loadDataInChunks = async () => {
            console.log('Loading full dataset in chunks...');
            
            const PAGE_SIZE = 1000;
            let allNodes = [...initialGraphRes.data.nodes]; // Start with initial nodes
            let allEdges = [];
            
            try {
              // Load airports first (typically fewer than seaports)
              let page = 0;
              let hasMore = true;
              
              // Load nodes in pages
              while (hasMore) {
                const offset = page * PAGE_SIZE;
                const nodesRes = await axios.get(
                  `${API_BASE_URL}/graph?limit=${PAGE_SIZE}&offset=${offset}`, 
                  { timeout: 15000, withCredentials: true }
                );
                
                const newNodes = nodesRes.data.nodes || [];
                console.log(`Loaded ${newNodes.length} nodes (page ${page + 1})`);
                
                if (newNodes.length > 0) {
                  // Add to existing nodes using a Set to deduplicate by ID
                  const nodeIds = new Set(allNodes.map(n => n.id));
                  
                  // Only add nodes we don't already have
                  const uniqueNewNodes = newNodes.filter(n => !nodeIds.has(n.id));
                  allNodes = [...allNodes, ...uniqueNewNodes];
                  
                  // Update state periodically to show progress
                  if (page % 2 === 0) {
                    setNodes([...allNodes]);
                  }
                  
                  page++;
                } else {
                  hasMore = false;
                }
                
                if (newNodes.length < PAGE_SIZE) {
                  hasMore = false;
                }
              }
              
              // Final update of nodes
              setNodes(allNodes);
              console.log(`Completed loading ${allNodes.length} total nodes`);
              
              // Now load all edges at once from the graph endpoint
              try {
                console.log('Loading edges from graph endpoint...');
                const completeGraphRes = await axios.get(
                  `${API_BASE_URL}/graph?include_edges=true`, 
                  { timeout: 30000, withCredentials: true }
                );
                
                if (completeGraphRes.data && completeGraphRes.data.edges) {
                  allEdges = completeGraphRes.data.edges;
                  console.log(`Loaded ${allEdges.length} total edges from graph endpoint`);
                  
                  // Update edges state
                  setEdges(allEdges);
                } else {
                  console.error('No edges data in response');
                  throw new Error('No edges data returned from API');
                }
              } catch (edgesErr) {
                console.error('Error loading edges from graph endpoint:', edgesErr);
                console.log('Trying backup method to load edges...');
                
                // If the main method fails, try loading small batches of edges
                try {
                  const EDGE_PAGE_SIZE = 1000;
                  page = 0;
                  hasMore = true;
                  
                  while (hasMore) {
                    const offset = page * EDGE_PAGE_SIZE;
                    console.log(`Fetching edges batch ${page + 1}...`);
                    
                    let edgesRes;
                    try {
                      // First try the dedicated edges endpoint
                      edgesRes = await axios.get(
                        `${API_BASE_URL}/edges?limit=${EDGE_PAGE_SIZE}&offset=${offset}`, 
                        { timeout: 15000, withCredentials: true }
                      );
                    } catch (edgesApiErr) {
                      console.warn('Edges API not available, trying graph endpoint with limit/offset...');
                      // Fall back to the graph endpoint with edges
                      edgesRes = await axios.get(
                        `${API_BASE_URL}/graph?include_edges=true&limit=${EDGE_PAGE_SIZE}&offset=${offset}`, 
                        { timeout: 15000, withCredentials: true }
                      );
                    }
                    
                    const newEdges = edgesRes.data.edges || [];
                    console.log(`Loaded ${newEdges.length} edges (page ${page + 1})`);
                    
                    if (newEdges.length > 0) {
                      allEdges = [...allEdges, ...newEdges];
                      
                      // Update the UI periodically
                      if (page % 3 === 0) {
                        setEdges([...allEdges]);
                      }
                      
                      page++;
                    } else {
                      hasMore = false;
                    }
                    
                    if (newEdges.length < EDGE_PAGE_SIZE) {
                      hasMore = false;
                    }
                  }
                  
                  // Final update of edges
                  setEdges(allEdges);
                  console.log(`Completed loading ${allEdges.length} total edges`);
                } catch (batchErr) {
                  console.error('Error loading edges in batches:', batchErr);
                  throw batchErr;
                }
              }
            } catch (chunkErr) {
              console.error('Error during chunked data loading:', chunkErr);
              setError('Error loading complete dataset. Using partial data.');
            } finally {
              setLoading(false);
            }
          };
          
          // Start loading the full dataset without blocking the UI
          loadDataInChunks();
          
        } catch (graphErr) {
          console.error('Error fetching graph data:', graphErr);
          setError('Unable to fetch data. Please ensure the backend is running correctly.');
          setLoading(false);
        }
        
      } catch (err) {
        console.error('Error connecting to API:', err);
        if (err.message === 'API request timeout') {
          setError('The backend is taking too long to respond. Try refreshing the page.');
        } else if (err.code === 'ECONNABORTED') {
          setError('Connection timeout. The backend server may be overloaded.');
        } else {
          setError('Error connecting to simulation server. Please ensure the backend is running.');
        }
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle node selection
  const handleNodeSelect = (node, isSource) => {
    console.log('Node selected:', node, 'as', isSource ? 'source' : 'target');
    
    if (!node) {
      console.error('Invalid node selection: node is null or undefined');
      return;
    }
    
    // Convert node if it's from allPorts list and doesn't have the right structure
    const normalizedNode = {
      id: node.id,
      name: node.name || `${node.type} ${node.id}`,
      type: node.type,
      lat: node.lat || node.latitude,
      lon: node.lon || node.longitude,
      connections: node.connections || node.connections_count || 0
    };
    
    // Set as source or target based on the isSource parameter
    if (isSource === true) {
      setSelectedSource(normalizedNode);
      console.log('Source set to:', normalizedNode.name);
    } else if (isSource === false) { // Explicit check for false
      setSelectedTarget(normalizedNode);
      console.log('Target set to:', normalizedNode.name);
    } else {
      // Legacy behavior for backward compatibility
      console.warn('isSource parameter not provided, using legacy selection behavior');
      if (!selectedSource) {
        setSelectedSource(normalizedNode);
      } else {
        setSelectedTarget(normalizedNode);
      }
    }
    
    // Clear route when nodes change
    setCurrentRoute(null);
  };
  
  // Memoize route finding to prevent unnecessary recalculations
  const handleFindRoute = useCallback(async (useRL = false) => {
    if (!selectedSource || !selectedTarget) {
      setError('Please select both source and target nodes');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const endpoint = useRL ? `${API_BASE_URL}/simulate_rl` : `${API_BASE_URL}/route`;
      
      const res = await axios.post(endpoint, {
        source_id: selectedSource.id,
        target_id: selectedTarget.id
      }, { withCredentials: true });
      
      if (res.data.status === 'ok' && res.data.route) {
        setCurrentRoute(res.data.route);
      } else {
        setError('No route found between selected nodes');
      }
    } catch (err) {
      console.error('Error finding route:', err);
      setError('Error calculating route. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedSource, selectedTarget]);
  
  // Handle updating weather
  const handleUpdateWeather = async (lat, lon, severity) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/weather`, {
        lat,
        lon,
        severity
      }, { withCredentials: true });
      
      if (res.data.status === 'ok') {
        // Refresh weather data
        const weatherRes = await axios.get(`${API_BASE_URL}/weather`);
        setWeatherGrid(weatherRes.data);
        
        // Clear route as conditions have changed
        setCurrentRoute(null);
      }
    } catch (err) {
      console.error('Error updating weather:', err);
      setError('Error updating weather conditions');
    }
  };
  
  // Handle updating port delay
  const handleUpdateDelay = async (nodeId, delay) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/port_delay`, {
        node_id: nodeId,
        delay_hours: delay
      }, { withCredentials: true });
      
      if (res.data.status === 'ok') {
        // Refresh nodes data
        const graphRes = await axios.get(`${API_BASE_URL}/graph`);
        setNodes(graphRes.data.nodes);
        
        // Clear route as conditions have changed
        setCurrentRoute(null);
      }
    } catch (err) {
      console.error('Error updating port delay:', err);
      setError('Error updating port delay');
    }
  };
  
  // Handle adding pain point
  const handleAddPainPoint = async (nodeId, eventType, name, delayIncrease, blocked) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/pain_points`, {
        node_id: nodeId,
        event_type: eventType,
        name,
        delay_increase: delayIncrease,
        blocked
      }, { withCredentials: true });
      
      if (res.data.status === 'ok') {
        // Refresh pain points and nodes
        const painRes = await axios.get(`${API_BASE_URL}/pain_points`);
        setPainPoints(painRes.data);
        
        const graphRes = await axios.get(`${API_BASE_URL}/graph`);
        setNodes(graphRes.data.nodes);
        
        // Clear route as conditions have changed
        setCurrentRoute(null);
      }
    } catch (err) {
      console.error('Error adding pain point:', err);
      setError('Error adding pain point');
    }
  };
  
  // Handle removing pain point
  const handleRemovePainPoint = async (index) => {
    try {
      const res = await axios.delete(`${API_BASE_URL}/pain_points/${index}`, { withCredentials: true });
      
      if (res.data.status === 'ok') {
        // Refresh pain points and nodes
        const painRes = await axios.get(`${API_BASE_URL}/pain_points`);
        setPainPoints(painRes.data);
        
        const graphRes = await axios.get(`${API_BASE_URL}/graph`);
        setNodes(graphRes.data.nodes);
        
        // Clear route as conditions have changed
        setCurrentRoute(null);
      }
    } catch (err) {
      console.error('Error removing pain point:', err);
      setError('Error removing pain point');
    }
  };
  
  // Handle weight update
  const handleUpdateWeights = async (newWeights) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/weights`, newWeights, { withCredentials: true });
      
      if (res.data.status === 'ok') {
        setWeights(res.data.weights);
        
        // Clear route as optimization criteria have changed
        setCurrentRoute(null);
      }
    } catch (err) {
      console.error('Error updating weights:', err);
      setError('Error updating optimization weights');
    }
  };
  
  const renderDataSummary = () => {
    return (
      <div className="data-summary">
        <div className="data-summary-item">
          <h3>Nodes: {nodes.length}</h3>
          <div className="data-details">
            <span>Airports: {nodes.filter(n => n.type === 'airport').length}</span>
            <span>Seaports: {nodes.filter(n => n.type === 'seaport').length}</span>
          </div>
        </div>
        <div className="data-summary-item">
          <h3>Routes: {edges.length}</h3>
          <div className="data-details">
            <span>Flight Routes: {edges.filter(e => e.mode === 'flight').length} <small>(not shown by default)</small></span>
            <span>Ship Routes: {edges.filter(e => e.mode === 'ship').length}</span>
          </div>
        </div>
        {currentRoute && (
          <div className="data-summary-item highlighted">
            <h3>Route Found</h3>
            <div className="data-details">
              <span>{currentRoute.edges.length} segments</span>
              <span>{Math.round(currentRoute.total_duration)} hours</span>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="freight-simulation-container">
      <h1 className="freight-simulation-title">Multi-Modal Freight Routing Simulation</h1>
      
      {error && (
        <div className="freight-error-message">
          <p>{error}</p>
        </div>
      )}
      
      {loading && (
        <div className="freight-loading">
          <div className="loading-spinner"></div>
          <p>Loading freight simulation data...</p>
          <p className="loading-subtitle">This may take 20-30 seconds for the first load</p>
        </div>
      )}
      
      <div className="data-stats-section">
        {renderDataSummary()}
      </div>
      
      <div className="freight-simulation-content">
        <div className="freight-map-container">
          <FreightMap
            nodes={nodes}
            edges={edges}
            nodeMap={processedNodes}
            edgeMap={edgeMap}
            weatherGrid={weatherGrid}
            painPoints={painPoints}
            selectedSource={selectedSource}
            selectedTarget={selectedTarget}
            currentRoute={currentRoute}
            onNodeSelect={handleNodeSelect}
            onWeatherUpdate={handleUpdateWeather}
          />
        </div>
        
        <div className="freight-controls-container">
          <ControlPanel
            nodes={nodes}
            selectedSource={selectedSource}
            selectedTarget={selectedTarget}
            weights={weights}
            painPoints={painPoints}
            onNodeSelect={handleNodeSelect}
            onFindRoute={handleFindRoute}
            onUpdateWeights={handleUpdateWeights}
            onUpdateDelay={handleUpdateDelay}
            onAddPainPoint={handleAddPainPoint}
            onRemovePainPoint={handleRemovePainPoint}
          />
          
          {currentRoute && (
            <MetricsPanel
              route={currentRoute}
              weights={weights}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FreightSimulationPage; 
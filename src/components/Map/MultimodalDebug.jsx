import React, { useState, useEffect } from 'react';
import { fetchComprehensiveMultimodalGraph } from '../../services/api';
import styles from '../../assets/MapComponent.module.scss';

const MultimodalDebug = () => {
  const [graphData, setGraphData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  
  const logMessage = (message) => {
    setLogMessages(prevMessages => [...prevMessages, { time: new Date().toISOString(), message }]);
  };
  
  // Pre-defined test cases
  const testCases = [
    {
      name: 'Cochin to Amsterdam',
      origin: { lat: 9.931233, lng: 76.267304, name: 'Cochin' },
      destination: { lat: 52.370216, lng: 4.895168, name: 'Amsterdam' },
      startDate: '2025-05-01'
    },
    {
      name: 'Mumbai to London',
      origin: { lat: 19.076090, lng: 72.877426, name: 'Mumbai' },
      destination: { lat: 51.507351, lng: -0.127758, name: 'London' },
      startDate: '2025-05-01'
    }
  ];
  
  const [selectedTest, setSelectedTest] = useState(testCases[0]);
  
  const fetchGraph = async (testCase) => {
    setIsLoading(true);
    setError(null);
    setGraphData(null);
    setSelectedNode(null);
    setSelectedEdge(null);
    setLogMessages([]);
    
    logMessage(`Starting multimodal graph request for ${testCase.name}`);
    
    try {
      logMessage(`Fetching graph from ${testCase.origin.name} to ${testCase.destination.name}`);
      const graph = await fetchComprehensiveMultimodalGraph(
        testCase.origin,
        testCase.destination,
        testCase.startDate
      );
      
      setGraphData(graph);
      logMessage(`Graph loaded successfully: ${Object.keys(graph.nodes).length} nodes, ${graph.edges.length} edges`);
      
      // Log node types breakdown
      const nodeTypes = {};
      Object.values(graph.nodes).forEach(node => {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      });
      logMessage(`Node types: ${JSON.stringify(nodeTypes)}`);
      
      // Log edge modes breakdown
      const edgeModes = {};
      graph.edges.forEach(edge => {
        edgeModes[edge.mode] = (edgeModes[edge.mode] || 0) + 1;
      });
      logMessage(`Edge modes: ${JSON.stringify(edgeModes)}`);
      
    } catch (err) {
      setError(err.message || 'Failed to fetch graph');
      logMessage(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initial data load
  useEffect(() => {
    fetchGraph(selectedTest);
  }, []);
  
  // Node details display
  const renderNodeDetails = (node) => {
    if (!node) return null;
    
    return (
      <div className={styles.nodeDetailsCard}>
        <h4>{node.name || node.id}</h4>
        <p><strong>Type:</strong> {node.type}</p>
        <p><strong>ID:</strong> {node.id}</p>
        {node.code && <p><strong>Code:</strong> {node.code}</p>}
        {node.lat && node.lng && (
          <p><strong>Coordinates:</strong> {node.lat.toFixed(4)}, {node.lng.toFixed(4)}</p>
        )}
      </div>
    );
  };
  
  // Edge details display
  const renderEdgeDetails = (edge) => {
    if (!edge) return null;
    
    const sourceNode = graphData?.nodes[edge.source];
    const targetNode = graphData?.nodes[edge.target];
    
    return (
      <div className={styles.edgeDetailsCard}>
        <h4>{edge.mode.toUpperCase()} Connection</h4>
        <p><strong>From:</strong> {sourceNode?.name || edge.source}</p>
        <p><strong>To:</strong> {targetNode?.name || edge.target}</p>
        <p><strong>Mode:</strong> {edge.mode}</p>
        {edge.distance && <p><strong>Distance:</strong> {edge.distance.toFixed(2)} km</p>}
        {edge.duration && <p><strong>Duration:</strong> {edge.duration.toFixed(2)} hours</p>}
        {edge.emissions && <p><strong>Emissions:</strong> {edge.emissions.toFixed(2)} kg CO₂</p>}
        {edge.departureTime && <p><strong>Departure:</strong> {new Date(edge.departureTime).toLocaleString()}</p>}
        {edge.arrivalTime && <p><strong>Arrival:</strong> {new Date(edge.arrivalTime).toLocaleString()}</p>}
        {edge.voyageCode && <p><strong>Voyage:</strong> {edge.voyageCode}</p>}
        {edge.shipName && <p><strong>Ship:</strong> {edge.shipName}</p>}
        {edge.flightNo && <p><strong>Flight:</strong> {edge.flightNo}</p>}
      </div>
    );
  };
  
  // Simple node list component
  const NodeList = ({ nodes, onSelectNode }) => {
    if (!nodes || Object.keys(nodes).length === 0) return <p>No nodes available</p>;
    
    // Group nodes by type
    const nodesByType = {};
    Object.values(nodes).forEach(node => {
      if (!nodesByType[node.type]) nodesByType[node.type] = [];
      nodesByType[node.type].push(node);
    });
    
    return (
      <div className={styles.nodeList}>
        {Object.entries(nodesByType).map(([type, typeNodes]) => (
          <div key={type} className={styles.nodeTypeGroup}>
            <h4>{type.charAt(0).toUpperCase() + type.slice(1)}s ({typeNodes.length})</h4>
            <ul>
              {typeNodes.map(node => (
                <li 
                  key={node.id} 
                  className={selectedNode?.id === node.id ? styles.selectedNode : ''}
                  onClick={() => onSelectNode(node)}
                >
                  {node.name || node.id}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };
  
  // Simple edge list component
  const EdgeList = ({ edges, nodes, onSelectEdge }) => {
    if (!edges || edges.length === 0) return <p>No edges available</p>;
    
    // Group edges by mode
    const edgesByMode = {};
    edges.forEach(edge => {
      if (!edgesByMode[edge.mode]) edgesByMode[edge.mode] = [];
      edgesByMode[edge.mode].push(edge);
    });
    
    return (
      <div className={styles.edgeList}>
        {Object.entries(edgesByMode).map(([mode, modeEdges]) => (
          <div key={mode} className={styles.edgeModeGroup}>
            <h4>{mode.charAt(0).toUpperCase() + mode.slice(1)} Connections ({modeEdges.length})</h4>
            <ul>
              {modeEdges.map(edge => {
                const sourceNode = nodes[edge.source];
                const targetNode = nodes[edge.target];
                
                return (
                  <li 
                    key={edge.id} 
                    className={selectedEdge?.id === edge.id ? styles.selectedEdge : ''}
                    onClick={() => onSelectEdge(edge)}
                  >
                    {sourceNode?.name || edge.source} → {targetNode?.name || edge.target}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };
  
  // Debug log component
  const DebugLog = ({ messages }) => {
    if (!messages || messages.length === 0) return <p>No log messages</p>;
    
    return (
      <div className={styles.debugLog}>
        {messages.map((msg, index) => (
          <div key={index} className={styles.logEntry}>
            <span className={styles.logTime}>{new Date(msg.time).toLocaleTimeString()}</span>
            <span className={styles.logMessage}>{msg.message}</span>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className={styles.multimodalDebugContainer}>
      <div className={styles.debugHeader}>
        <h2>Multimodal Transport Graph Debug</h2>
        
        <div className={styles.testControls}>
          <select 
            value={selectedTest.name}
            onChange={(e) => {
              const test = testCases.find(t => t.name === e.target.value);
              setSelectedTest(test);
            }}
          >
            {testCases.map(test => (
              <option key={test.name} value={test.name}>{test.name}</option>
            ))}
          </select>
          
          <button 
            onClick={() => fetchGraph(selectedTest)} 
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Fetch Graph'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className={styles.errorMessage}>
          <p>Error: {error}</p>
        </div>
      )}
      
      <div className={styles.debugContent}>
        <div className={styles.graphStats}>
          {graphData && (
            <>
              <h3>Graph Statistics</h3>
              <p><strong>Nodes:</strong> {Object.keys(graphData.nodes).length}</p>
              <p><strong>Edges:</strong> {graphData.edges.length}</p>
              <p><strong>Journeys:</strong> {graphData.journeys?.length || 0}</p>
            </>
          )}
        </div>
        
        <div className={styles.listView}>
          <div className={styles.nodeListContainer}>
            <h3>Nodes</h3>
            <NodeList 
              nodes={graphData?.nodes} 
              onSelectNode={setSelectedNode}
            />
          </div>
          
          <div className={styles.edgeListContainer}>
            <h3>Edges</h3>
            <EdgeList 
              edges={graphData?.edges} 
              nodes={graphData?.nodes}
              onSelectEdge={setSelectedEdge}
            />
          </div>
        </div>
        
        <div className={styles.detailsPanel}>
          {selectedNode && (
            <div className={styles.selectedNodeDetails}>
              <h3>Selected Node</h3>
              {renderNodeDetails(selectedNode)}
            </div>
          )}
          
          {selectedEdge && (
            <div className={styles.selectedEdgeDetails}>
              <h3>Selected Edge</h3>
              {renderEdgeDetails(selectedEdge)}
            </div>
          )}
        </div>
        
        <div className={styles.debugLogContainer}>
          <h3>Debug Log</h3>
          <DebugLog messages={logMessages} />
        </div>
      </div>
    </div>
  );
};

export default MultimodalDebug; 
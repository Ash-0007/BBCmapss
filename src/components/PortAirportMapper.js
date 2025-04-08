import React, { useState, useEffect } from 'react';
import { fetchPortLocationsByCode, getNearestAirports, getAirportDetails, buildMultimodalGraph } from '../services/api';
import { buildInterconnectedGraph } from './MultiModalRoutePlanner';

function PortAirportMapper() {
  const [portCode, setPortCode] = useState('');
  const [airportCode, setAirportCode] = useState('');
  const [nearestAirports, setNearestAirports] = useState([]);
  const [nearestPorts, setNearestPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [selectedPort, setSelectedPort] = useState(null);
  const [multimodalGraph, setMultimodalGraph] = useState(null);
  const [showGraph, setShowGraph] = useState(false);
  const [processingGraph, setProcessingGraph] = useState(false);

  // Find nearest airports for a port
  const findNearestAirports = async (portCode) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedAirport(null);
      setMultimodalGraph(null);
      setShowGraph(false);

      // Get port location
      const portLocations = await fetchPortLocationsByCode([portCode]);
      if (!portLocations || portLocations.length === 0) {
        throw new Error('Port location not found');
      }

      const portLocation = portLocations[0];
      const portLat = parseFloat(portLocation.latitude_dd);
      const portLng = parseFloat(portLocation.longitude_dd);

      // Find nearest airports
      const airports = await getNearestAirports(portLat, portLng, 3);
      setNearestAirports(airports);
      
      // Automatically select the first (closest) airport
      if (airports.length > 0) {
        setSelectedAirport(airports[0]);
        setSelectedPort({
          code: portCode,
          name: portLocation.name || portCode,
          latitude_dd: portLat,
          longitude_dd: portLng,
          distance: 0
        });
      }
    } catch (err) {
      setError(err.message);
      console.error('Error finding nearest airports:', err);
    } finally {
      setLoading(false);
    }
  };

  // Find nearest ports for an airport
  const findNearestPorts = async (airportCode) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedPort(null);
      setMultimodalGraph(null);
      setShowGraph(false);

      // Get airport location
      const airportDetails = await getAirportDetails(airportCode);
      if (!airportDetails || !airportDetails.latitude_dd || !airportDetails.longitude_dd) {
        throw new Error('Airport location not found');
      }

      const airportLat = parseFloat(airportDetails.latitude_dd);
      const airportLng = parseFloat(airportDetails.longitude_dd);

      // Find nearest ports using the same API but with type=seaport
      const ports = await getNearestAirports(airportLat, airportLng, 3);
      setNearestPorts(ports);
      
      // Automatically select the first (closest) port
      if (ports.length > 0) {
        setSelectedPort(ports[0]);
        setSelectedAirport({
          code: airportCode,
          name: airportDetails.name || airportCode,
          latitude_dd: airportLat,
          longitude_dd: airportLng,
          distance: 0
        });
      }
    } catch (err) {
      setError(err.message);
      console.error('Error finding nearest ports:', err);
    } finally {
      setLoading(false);
    }
  };

  // Process multimodal graph
  const processMultimodalGraph = async () => {
    try {
      setProcessingGraph(true);
      setError(null);
      
      if (!selectedAirport && !selectedPort) {
        throw new Error('Please select at least one airport or port');
      }
      
      // Create a mapping between the selected airport and port
      const airportToSeaportMapping = {};
      const seaportToAirportMapping = {};
      
      if (selectedAirport && selectedPort) {
        console.log('Creating mapping between:', selectedAirport.code, 'and', selectedPort.code);
        airportToSeaportMapping[selectedAirport.code] = selectedPort.code;
        seaportToAirportMapping[selectedPort.code] = selectedAirport.code;
      }
      
      console.log('Using API to build multimodal graph');
      const graph = await buildMultimodalGraph();
      
      if (!graph) {
        console.log('API returned null graph, using local fallback');
        // Use buildInterconnectedGraph as fallback
        const airNodes = {};
        const seaNodes = {};
        
        // Ensure we have at least the selected airport and port
        if (selectedAirport) {
          airNodes[selectedAirport.code] = {
            id: selectedAirport.code,
            name: selectedAirport.name,
            type: 'airport',
            lat: selectedAirport.latitude_dd,
            lng: selectedAirport.longitude_dd
          };
        }
        
        if (selectedPort) {
          seaNodes[selectedPort.code] = {
            id: selectedPort.code,
            name: selectedPort.name,
            type: 'seaport',
            lat: selectedPort.latitude_dd,
            lng: selectedPort.longitude_dd
          };
        }
        
        const localGraph = buildInterconnectedGraph(
          { nodes: airNodes, edges: [] },
          { nodes: seaNodes, edges: [] },
          20,
          airportToSeaportMapping,
          seaportToAirportMapping
        );
        
        setMultimodalGraph(localGraph);
      } else {
        // Add the mapping connections to the API graph if needed
        if (Object.keys(airportToSeaportMapping).length > 0) {
          console.log('Enhancing API graph with our mapping connections');
          
          // Make sure our selected nodes are in the graph
          if (selectedAirport && !graph.nodes[selectedAirport.code]) {
            graph.nodes[selectedAirport.code] = {
              id: selectedAirport.code,
              name: selectedAirport.name,
              type: 'airport'
            };
          }
          
          if (selectedPort && !graph.nodes[selectedPort.code]) {
            graph.nodes[selectedPort.code] = {
              id: selectedPort.code,
              name: selectedPort.name,
              type: 'seaport'
            };
          }
          
          // Add transfer edges
          Object.entries(airportToSeaportMapping).forEach(([airport, seaport]) => {
            graph.edges.push({
              id: `transfer_${airport}_${seaport}`,
              source: airport,
              target: seaport,
              from: airport,
              to: seaport,
              mode: 'transfer',
              type: 'transfer',
              duration: '3h 0m'
            });
            
            graph.edges.push({
              id: `transfer_${seaport}_${airport}`,
              source: seaport,
              target: airport,
              from: seaport,
              to: airport, 
              mode: 'transfer',
              type: 'transfer',
              duration: '3h 0m'
            });
          });
        }
        
        setMultimodalGraph(graph);
      }
      
      setShowGraph(true);
    } catch (err) {
      setError('Error building multimodal graph: ' + (err.message || 'Unknown error'));
      console.error('Error processing multimodal graph:', err);
    } finally {
      setProcessingGraph(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Port-Airport Mapper</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Port to Airport Section */}
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Find Nearest Airports to Port</h3>
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              value={portCode}
              onChange={(e) => setPortCode(e.target.value.toUpperCase())}
              placeholder="Enter port code (e.g., NLRTM)"
              className="p-2 border rounded"
            />
            <button
              onClick={() => findNearestAirports(portCode)}
              disabled={loading || !portCode}
              className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Searching...' : 'Find Airports'}
            </button>
          </div>

          {nearestAirports.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Nearest Airports:</h4>
              <div className="space-y-2">
                {nearestAirports.map((airport, index) => (
                  <div 
                    key={index} 
                    className={`p-2 rounded cursor-pointer ${
                      selectedAirport && selectedAirport.code === airport.code 
                        ? 'bg-blue-200 border border-blue-500' 
                        : 'bg-gray-100'
                    }`}
                    onClick={() => setSelectedAirport(airport)}
                  >
                    <p className="font-medium">✈️ {airport.code}</p>
                    <p className="text-sm">{airport.name}</p>
                    <p className="text-sm text-gray-600">
                      Distance: {Math.round(airport.distance)} km
                    </p>
                    {index === 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        (Selected for multimodal graph)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Airport to Port Section */}
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-2">Find Nearest Ports to Airport</h3>
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              value={airportCode}
              onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
              placeholder="Enter airport code (e.g., AMS)"
              className="p-2 border rounded"
            />
            <button
              onClick={() => findNearestPorts(airportCode)}
              disabled={loading || !airportCode}
              className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Searching...' : 'Find Ports'}
            </button>
          </div>

          {nearestPorts.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Nearest Ports:</h4>
              <div className="space-y-2">
                {nearestPorts.map((port, index) => (
                  <div 
                    key={index} 
                    className={`p-2 rounded cursor-pointer ${
                      selectedPort && selectedPort.code === port.code 
                        ? 'bg-blue-200 border border-blue-500' 
                        : 'bg-gray-100'
                    }`}
                    onClick={() => setSelectedPort(port)}
                  >
                    <p className="font-medium">🚢 {port.code}</p>
                    <p className="text-sm">{port.name}</p>
                    <p className="text-sm text-gray-600">
                      Distance: {Math.round(port.distance)} km
                    </p>
                    {index === 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        (Selected for multimodal graph)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {(selectedAirport || selectedPort) && (
        <div className="mt-4 p-4 bg-gray-50 border rounded">
          <h3 className="font-bold mb-2">Selected for Multimodal Graph</h3>
          {selectedAirport && (
            <div className="mb-2">
              <p className="font-medium">Selected Airport:</p>
              <p>✈️ {selectedAirport.code} - {selectedAirport.name}</p>
              <p className="text-sm text-gray-600">
                Distance from port: {Math.round(selectedAirport.distance || 0)} km
              </p>
            </div>
          )}
          {selectedPort && (
            <div>
              <p className="font-medium">Selected Port:</p>
              <p>🚢 {selectedPort.code} - {selectedPort.name}</p>
              <p className="text-sm text-gray-600">
                Distance from airport: {Math.round(selectedPort.distance || 0)} km
              </p>
            </div>
          )}
          
          <div className="mt-4">
            <button
              onClick={processMultimodalGraph}
              disabled={processingGraph || (!selectedAirport && !selectedPort)}
              className="bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              {processingGraph ? 'Processing...' : 'Process Multimodal Graph'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
          {error}
        </div>
      )}
      
      {showGraph && multimodalGraph && (
        <div className="mt-6 border rounded-lg p-4">
          <h3 className="text-xl font-bold mb-4">Multimodal Graph</h3>
          
          <div className="mb-4">
            <h4 className="font-medium mb-2">Nodes ({Object.keys(multimodalGraph.nodes || {}).length}):</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-blue-600">Airports:</h5>
                <ul className="list-disc pl-5">
                  {Object.values(multimodalGraph.nodes || {})
                    .filter(node => node && node.type === 'airport')
                    .map(node => (
                      <li key={node.id}>
                        ✈️ {node.id} - {node.name}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-green-600">Seaports:</h5>
                <ul className="list-disc pl-5">
                  {Object.values(multimodalGraph.nodes || {})
                    .filter(node => node && node.type === 'seaport')
                    .map(node => (
                      <li key={node.id}>
                        🚢 {node.id} - {node.name}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Connections ({(multimodalGraph.edges || []).length}):</h4>
            <div className="space-y-2">
              {(multimodalGraph.edges || [])
                .filter(edge => edge && (edge.type === 'transfer' || edge.mode === 'transfer'))
                .map((edge, index) => (
                  <div key={index} className="bg-yellow-100 p-2 rounded">
                    <p className="font-medium">
                      {edge.from || edge.source} ↔️ {edge.to || edge.target}
                    </p>
                    <p className="text-sm text-gray-600">
                      Type: Transfer | Duration: {edge.duration}
                    </p>
                  </div>
                ))}
            </div>
          </div>
          
          <div className="mt-4">
            <button
              onClick={() => setShowGraph(false)}
              className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
            >
              Hide Graph
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortAirportMapper; 
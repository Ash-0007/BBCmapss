function buildInterconnectedGraph(airRoutesGraph, seaRoutesGraph, maxRoutesPerNode = 20, airportToSeaportMapping = {}, seaportToAirportMapping = {}) {
  // Safety checks for arguments
  if (!airRoutesGraph) airRoutesGraph = { nodes: {}, edges: [] };
  if (!seaRoutesGraph) seaRoutesGraph = { nodes: {}, edges: [] };
  
  console.log('Building interconnected graph with:', 
    Object.keys(airRoutesGraph.nodes || {}).length, 'air nodes,',
    Object.keys(seaRoutesGraph.nodes || {}).length, 'sea nodes,',
    Object.keys(airportToSeaportMapping || {}).length, 'airport-seaport mappings'
  );

  // Create the combined graph
  const combinedGraph = {
    nodes: {},
    edges: []
  };
  
  // Add airport nodes
  if (airRoutesGraph.nodes) {
    Object.entries(airRoutesGraph.nodes || {}).forEach(([id, node]) => {
      if (id && typeof id === 'string') {
        combinedGraph.nodes[id] = {
          ...node,
          id,
          type: "airport"
        };
      }
    });
  }
  
  // Add seaport nodes
  if (seaRoutesGraph.nodes) {
    Object.entries(seaRoutesGraph.nodes || {}).forEach(([id, node]) => {
      if (id && typeof id === 'string') {
        combinedGraph.nodes[id] = {
          ...node,
          id,
          type: "seaport"
        };
      }
    });
  }
  
  // Ensure nodes for all mappings exist
  Object.entries(airportToSeaportMapping || {}).forEach(([airport, seaport]) => {
    if (!combinedGraph.nodes[airport]) {
      combinedGraph.nodes[airport] = {
        id: airport,
        name: airport,
        type: "airport"
      };
      console.log(`Added missing airport node from mapping: ${airport}`);
    }
    
    if (!combinedGraph.nodes[seaport]) {
      combinedGraph.nodes[seaport] = {
        id: seaport,
        name: seaport,
        type: "seaport"
      };
      console.log(`Added missing seaport node from mapping: ${seaport}`);
    }
  });
  
  // Add transfer connections between mapped airports and seaports
  Object.entries(airportToSeaportMapping || {}).forEach(([airport, seaport]) => {
    // Create bidirectional transfer edges
    combinedGraph.edges.push({
      id: `transfer_${airport}_${seaport}`,
      from: airport,
      to: seaport,
      type: "transfer",
      duration: "3h 0m"
    });
    
    combinedGraph.edges.push({
      id: `transfer_${seaport}_${airport}`,
      from: seaport,
      to: airport,
      type: "transfer",
      duration: "3h 0m"
    });
    
    console.log(`Created transfer connection between ${airport} and ${seaport}`);
  });
  
  console.log('Completed multimodal graph with:', 
    Object.keys(combinedGraph.nodes).length, 'nodes,',
    combinedGraph.edges.length, 'edges'
  );
  
  return combinedGraph;
} 
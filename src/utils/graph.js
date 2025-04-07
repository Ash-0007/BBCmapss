/**
 * Graph utility class for handling multimodal transport networks
 * Provides methods for path finding, path analysis, and optimization
 */
class Graph {
  constructor(nodes = [], edges = []) {
    this.nodes = new Map();
    this.edges = new Map();
    
    // Initialize with nodes and edges if provided
    nodes.forEach(node => this.addNode(node));
    edges.forEach(edge => this.addEdge(edge));
  }
  
  /**
   * Add a node to the graph
   * @param {Object} node - Node object with id and other properties
   */
  addNode(node) {
    if (!node || !node.id) return;
    this.nodes.set(node.id, { ...node, connections: [] });
  }
  
  /**
   * Add an edge between two nodes
   * @param {Object} edge - Edge object with source, target, and other properties
   */
  addEdge(edge) {
    if (!edge || !edge.source || !edge.target || !edge.id) return;
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) return;
    
    // Add edge to the graph
    this.edges.set(edge.id, edge);
    
    // Add connections to nodes
    const sourceNode = this.nodes.get(edge.source);
    sourceNode.connections.push(edge.id);
    this.nodes.set(edge.source, sourceNode);
    
    // Update connection count for visualization purposes
    sourceNode.connectionCount = (sourceNode.connectionCount || 0) + 1;
  }
  
  /**
   * Get all outgoing edges from a node
   * @param {string} nodeId - ID of the node
   * @returns {Array} Array of edge objects
   */
  getOutgoingEdges(nodeId) {
    if (!this.nodes.has(nodeId)) return [];
    
    const node = this.nodes.get(nodeId);
    return node.connections
      .map(edgeId => this.edges.get(edgeId))
      .filter(Boolean);
  }
  
  /**
   * Find all paths between source and target nodes
   * @param {string} sourceId - ID of the source node
   * @param {string} targetId - ID of the target node
   * @param {Object} options - Options for path finding
   * @returns {Array} Array of path objects
   */
  findAllPaths(sourceId, targetId, options = {}) {
    const {
      maxPaths = 10,
      maxDepth = 10,
      preferredModes = ['road', 'sea', 'air'],
      filters = {}
    } = options;
    
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return [];
    }
    
    const visited = new Set();
    const paths = [];
    
    // DFS to find all paths
    const findPaths = (currentId, path = [], depth = 0) => {
      // Stop if we've reached max depth or found enough paths
      if (depth > maxDepth || paths.length >= maxPaths) return;
      
      // Mark current node as visited
      visited.add(currentId);
      
      // If we've reached the target, add this path
      if (currentId === targetId) {
        paths.push([...path]);
        visited.delete(currentId);
        return;
      }
      
      // Get all outgoing edges
      const edges = this.getOutgoingEdges(currentId);
      
      // Filter edges based on options
      const filteredEdges = edges.filter(edge => {
        // Skip if target is already visited
        if (visited.has(edge.target)) return false;
        
        // Apply mode filters
        if (filters.modes && filters.modes.length > 0) {
          if (!filters.modes.includes(edge.type)) return false;
        }
        
        // Apply time window filter if present
        if (filters.startTime && edge.departureTime) {
          const departureTime = new Date(edge.departureTime);
          const start = new Date(filters.startTime);
          if (departureTime < start) return false;
        }
        
        if (filters.endTime && edge.arrivalTime) {
          const arrivalTime = new Date(edge.arrivalTime);
          const end = new Date(filters.endTime);
          if (arrivalTime > end) return false;
        }
        
        return true;
      });
      
      // Sort edges by preferred modes
      filteredEdges.sort((a, b) => {
        const aIndex = preferredModes.indexOf(a.type);
        const bIndex = preferredModes.indexOf(b.type);
        return aIndex - bIndex;
      });
      
      // Explore each edge
      for (const edge of filteredEdges) {
        findPaths(edge.target, [...path, edge.id], depth + 1);
      }
      
      // Unmark current node
      visited.delete(currentId);
    };
    
    // Start DFS from source
    findPaths(sourceId);
    
    // Process paths to return full information
    return paths.map(edgeIds => {
      const pathEdges = edgeIds.map(id => this.edges.get(id));
      
      // Calculate total distance, duration, cost, and emissions
      let totalDistance = 0;
      let totalDuration = 0;
      let totalCost = 0;
      let totalEmission = 0;
      const modes = new Set();
      
      pathEdges.forEach(edge => {
        totalDistance += edge.distance || 0;
        totalDuration += edge.duration || 0;
        totalCost += edge.cost || 0;
        totalEmission += edge.emission || 0;
        modes.add(edge.type);
      });
      
      return {
        edges: pathEdges,
        totalDistance,
        totalDuration,
        totalCost,
        totalEmission,
        modes: Array.from(modes),
        score: this.calculatePathScore({
          distance: totalDistance,
          duration: totalDuration,
          cost: totalCost,
          emission: totalEmission
        })
      };
    });
  }
  
  /**
   * Find shortest path using Dijkstra's algorithm
   * @param {string} sourceId - ID of the source node
   * @param {string} targetId - ID of the target node
   * @param {Function} weightFn - Function to calculate edge weight
   * @returns {Object} Shortest path information
   */
  findShortestPath(sourceId, targetId, weightFn = edge => edge.distance || 1) {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return null;
    }
    
    // Initialize distances and previous nodes
    const distances = {};
    const previous = {};
    const unvisited = new Set();
    
    // Set all initial distances to Infinity
    for (const nodeId of this.nodes.keys()) {
      distances[nodeId] = Infinity;
      unvisited.add(nodeId);
    }
    
    // Distance from source to itself is 0
    distances[sourceId] = 0;
    
    // Process nodes
    while (unvisited.size > 0) {
      // Find node with minimum distance
      let current = null;
      let minDistance = Infinity;
      
      for (const nodeId of unvisited) {
        if (distances[nodeId] < minDistance) {
          minDistance = distances[nodeId];
          current = nodeId;
        }
      }
      
      // If we can't find any node to process or reached target, break
      if (current === null || current === targetId) break;
      
      // Remove current from unvisited
      unvisited.delete(current);
      
      // Process all neighbors
      const edges = this.getOutgoingEdges(current);
      for (const edge of edges) {
        const neighbor = edge.target;
        
        // Skip if already processed
        if (!unvisited.has(neighbor)) continue;
        
        // Calculate new distance
        const weight = weightFn(edge);
        const newDistance = distances[current] + weight;
        
        // Update if new distance is shorter
        if (newDistance < distances[neighbor]) {
          distances[neighbor] = newDistance;
          previous[neighbor] = { nodeId: current, edgeId: edge.id };
        }
      }
    }
    
    // If target is not reachable
    if (distances[targetId] === Infinity) {
      return null;
    }
    
    // Reconstruct path
    const path = [];
    let current = targetId;
    
    while (current !== sourceId) {
      const { nodeId, edgeId } = previous[current];
      path.unshift(edgeId);
      current = nodeId;
    }
    
    // Get full path details
    const pathEdges = path.map(id => this.edges.get(id));
    let totalDistance = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let totalEmission = 0;
    const modes = new Set();
    
    pathEdges.forEach(edge => {
      totalDistance += edge.distance || 0;
      totalDuration += edge.duration || 0;
      totalCost += edge.cost || 0;
      totalEmission += edge.emission || 0;
      modes.add(edge.type);
    });
    
    return {
      edges: pathEdges,
      totalDistance,
      totalDuration,
      totalCost,
      totalEmission,
      modes: Array.from(modes)
    };
  }
  
  /**
   * Calculate a score for a path based on various metrics
   * @param {Object} metrics - Path metrics (distance, duration, cost, emission)
   * @returns {number} Score (lower is better)
   */
  calculatePathScore(metrics) {
    const { distance = 0, duration = 0, cost = 0, emission = 0 } = metrics;
    
    // Normalize metrics (these weights can be adjusted)
    const distanceWeight = 0.2;
    const durationWeight = 0.4;
    const costWeight = 0.3;
    const emissionWeight = 0.1;
    
    // Calculate score (lower is better)
    // This is a simple weighted sum, but could be more sophisticated
    const score = (
      distanceWeight * distance / 1000 + // Convert to thousands of km
      durationWeight * duration / 24 +   // Convert to days
      costWeight * cost / 1000 +         // Convert to thousands of dollars
      emissionWeight * emission / 1000   // Convert to tons of CO2
    );
    
    return score;
  }
  
  /**
   * Generate optimal route options based on different preferences
   * @param {string} sourceId - ID of the source node
   * @param {string} targetId - ID of the target node
   * @returns {Array} Array of path options
   */
  generateRouteOptions(sourceId, targetId) {
    const options = [];
    
    // Option 1: Shortest distance
    const shortestDistance = this.findShortestPath(sourceId, targetId, 
      edge => edge.distance || Infinity);
    if (shortestDistance) {
      options.push({
        ...shortestDistance,
        name: 'Shortest Distance',
        description: 'Route optimized for minimal distance'
      });
    }
    
    // Option 2: Shortest time
    const shortestTime = this.findShortestPath(sourceId, targetId, 
      edge => edge.duration || Infinity);
    if (shortestTime) {
      options.push({
        ...shortestTime,
        name: 'Fastest Route',
        description: 'Route optimized for minimal travel time'
      });
    }
    
    // Option 3: Lowest cost
    const lowestCost = this.findShortestPath(sourceId, targetId, 
      edge => edge.cost || Infinity);
    if (lowestCost) {
      options.push({
        ...lowestCost,
        name: 'Most Economical',
        description: 'Route optimized for lowest cost'
      });
    }
    
    // Option 4: Lowest emissions
    const lowestEmission = this.findShortestPath(sourceId, targetId, 
      edge => edge.emission || Infinity);
    if (lowestEmission) {
      options.push({
        ...lowestEmission,
        name: 'Eco-Friendly',
        description: 'Route optimized for minimal carbon emissions'
      });
    }
    
    // Add other specialized paths as needed
    // For example, sea-only or air-only paths
    
    // Calculate scores for all options
    options.forEach(option => {
      option.score = this.calculatePathScore({
        distance: option.totalDistance,
        duration: option.totalDuration,
        cost: option.totalCost,
        emission: option.totalEmission
      });
    });
    
    // Sort by score (lower is better)
    options.sort((a, b) => a.score - b.score);
    
    return options;
  }
  
  /**
   * Export graph to a format suitable for visualization
   * @returns {Object} Graph data ready for visualization
   */
  exportGraphData() {
    const nodesArray = Array.from(this.nodes.values()).map(node => ({
      ...node,
      connections: node.connections.length
    }));
    
    const edgesArray = Array.from(this.edges.values());
    
    return {
      nodes: nodesArray,
      edges: edgesArray
    };
  }
}

export default Graph; 
const express = require('express');
const router = express.Router();
const { buildMultimodalGraph } = require('../multimodal_graph');
const { getMultimodalGraph } = require('../controller/vesselController');

/**
 * @route POST /api/multimodal-graph
 * @description Generate a multimodal transportation graph between two locations
 * @access Public
 * @body {Object} origin - Origin location with lat, lng properties
 * @body {Object} destination - Destination location with lat, lng properties
 * @body {string} startDate - Start date in YYYY-MM-DD format
 */
router.post('/multimodal-graph', getMultimodalGraph);

/**
 * @route GET /api/multimodal-debug
 * @description Run a test of the multimodal graph generator with pre-defined locations
 * @access Public
 */
router.get('/multimodal-debug', async (req, res) => {
  try {
    const origin = { lat: 9.931233, lng: 76.267304 }; // Cochin
    const destination = { lat: 52.370216, lng: 4.895168 }; // Amsterdam
    const startDate = '2025-05-01';
    
    console.log('Running enhanced debug multimodal graph generation...');
    console.log(`Origin: Cochin (${origin.lat}, ${origin.lng})`);
    console.log(`Destination: Amsterdam (${destination.lat}, ${destination.lng})`);
    console.log(`Start date: ${startDate}`);
    
    // Build the multimodal graph
    const graph = await buildMultimodalGraph(origin, destination, startDate);
    
    // Analyze the graph for various modes and combinations
    const transportModes = new Set(graph.edges.map(edge => edge.mode));
    const nodeTypes = new Set(Object.values(graph.nodes).map(node => node.type));
    const journeyTypes = new Set(graph.journeys.map(journey => journey.type));
    
    // Analyze leg details for each mode
    const legsByMode = graph.legDetails.reduce((acc, leg) => {
      acc[leg.mode] = acc[leg.mode] || [];
      acc[leg.mode].push(leg);
      return acc;
    }, {});
    
    // Count layover alternatives
    const multimodalJourneys = graph.journeys.filter(journey => journey.type === 'multimodal');
    
    // Prepare debug summary
    const debugSummary = {
      totalNodes: Object.keys(graph.nodes).length,
      totalEdges: graph.edges.length,
      totalJourneys: graph.journeys.length,
      totalLegDetails: graph.legDetails.length,
      transportModes: Array.from(transportModes),
      nodeTypes: Array.from(nodeTypes),
      journeyTypes: Array.from(journeyTypes),
      legCountsByMode: Object.keys(legsByMode).map(mode => ({
        mode,
        count: legsByMode[mode].length
      })),
      multimodalJourneyCount: multimodalJourneys.length,
      sampleJourneys: graph.journeys.slice(0, 3).map(journey => ({
        type: journey.type,
        totalDuration: journey.totalDuration,
        segmentCount: journey.segments ? journey.segments.length : 0,
        modes: journey.modes || [journey.type]
      }))
    };
    
    console.log('Debug summary:', JSON.stringify(debugSummary, null, 2));
    
    res.json({
      success: true,
      debugSummary,
      graph: {
        stats: {
          nodeCount: Object.keys(graph.nodes).length,
          edgeCount: graph.edges.length,
          journeyCount: graph.journeys.length,
          legDetailsCount: graph.legDetails.length
        },
        // Only include a sample of nodes, edges, and journeys to avoid overwhelming the response
        sampleNodes: Object.values(graph.nodes).slice(0, 5),
        sampleEdges: graph.edges.slice(0, 5),
        sampleJourneys: graph.journeys.slice(0, 3),
        sampleLegDetails: graph.legDetails.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Error in debug multimodal graph:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

/**
 * @route GET /api/multimodal-layover-test
 * @description Test the layover alternatives functionality in multimodal graph
 * @access Public
 */
router.get('/multimodal-layover-test', async (req, res) => {
  try {
    // Mumbai to New York with potential layovers
    const origin = { lat: 19.0896, lng: 72.8656 }; // Mumbai
    const destination = { lat: 40.7128, lng: -74.0060 }; // New York
    const startDate = '2025-06-01';
    
    console.log('Running layover alternatives test...');
    console.log(`Origin: Mumbai (${origin.lat}, ${origin.lng})`);
    console.log(`Destination: New York (${destination.lat}, ${destination.lng})`);
    console.log(`Start date: ${startDate}`);
    
    // Build the multimodal graph
    const graph = await buildMultimodalGraph(origin, destination, startDate);
    
    // Focus on multimodal journeys with mode switches at layovers
    const multimodalJourneys = graph.journeys.filter(journey => 
      journey.type === 'multimodal' || 
      (journey.segments && journey.segments.length > 1 && 
       new Set(journey.segments.map(s => s.mode)).size > 1)
    );
    
    // Find all legs that represent mode switches (e.g., from ship to road, road to air)
    const modeSwitches = [];
    graph.journeys.forEach(journey => {
      if (!journey.segments || journey.segments.length <= 1) return;
      
      let prevMode = null;
      journey.segments.forEach(segment => {
        if (prevMode && prevMode !== segment.mode) {
          modeSwitches.push({
            fromMode: prevMode,
            toMode: segment.mode,
            location: segment.origin,
            time: segment.departureTime
          });
        }
        prevMode = segment.mode;
      });
    });
    
    res.json({
      success: true,
      testResults: {
        stats: {
          nodeCount: Object.keys(graph.nodes).length,
          edgeCount: graph.edges.length,
          journeyCount: graph.journeys.length,
          multimodalJourneyCount: multimodalJourneys.length,
          modeSwitchCount: modeSwitches.length
        },
        multimodalJourneys: multimodalJourneys.map(journey => ({
          modes: journey.modes || Array.from(new Set(journey.segments.map(s => s.mode))),
          segmentCount: journey.segments ? journey.segments.length : 0,
          totalDuration: journey.totalDuration,
          departureTime: journey.departureTime,
          arrivalTime: journey.arrivalTime
        })),
        modeSwitches: modeSwitches.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error in layover alternatives test:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

module.exports = router; 
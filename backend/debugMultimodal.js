/**
 * Multimodal Graph Debug Script
 * 
 * This script tests the enhanced multimodal transportation graph generation
 * with detailed logging at each step to verify all required features.
 */

const fs = require('fs');
const path = require('path');
const { buildMultimodalGraph } = require('./multimodal_graph');

// Test locations
const TEST_SCENARIOS = [
  {
    name: 'Cochin to Amsterdam',
    origin: { lat: 9.931233, lng: 76.267304 }, // Cochin
    destination: { lat: 52.370216, lng: 4.895168 }, // Amsterdam
    startDate: '2025-05-01'
  },
  {
    name: 'Mumbai to New York',
    origin: { lat: 19.0896, lng: 72.8656 }, // Mumbai
    destination: { lat: 40.7128, lng: -74.0060 }, // New York
    startDate: '2025-06-01'
  },
  {
    name: 'Singapore to Sydney',
    origin: { lat: 1.3521, lng: 103.8198 }, // Singapore
    destination: { lat: -33.8688, lng: 151.2093 }, // Sydney
    startDate: '2025-07-01'
  }
];

// Helper functions for analysis
function analyzeGraph(graph, scenarioName) {
  console.log(`\n=== ANALYSIS FOR ${scenarioName} ===`);
  
  // Basic stats
  console.log(`Nodes: ${Object.keys(graph.nodes).length}`);
  console.log(`Edges: ${graph.edges.length}`);
  console.log(`Journeys: ${graph.journeys.length}`);
  console.log(`Leg Details: ${graph.legDetails.length}`);
  
  // Analyze transport modes
  const modes = new Set(graph.edges.map(edge => edge.mode));
  console.log(`Transport Modes: ${Array.from(modes).join(', ')}`);
  
  // Count journey types
  const journeyTypes = graph.journeys.reduce((acc, journey) => {
    acc[journey.type] = (acc[journey.type] || 0) + 1;
    return acc;
  }, {});
  console.log('Journey Types:', journeyTypes);
  
  // Analyze multimodal journeys
  const multimodalJourneys = graph.journeys.filter(j => 
    j.type === 'multimodal' || 
    (j.segments && j.segments.length > 1 && new Set(j.segments.map(s => s.mode)).size > 1)
  );
  console.log(`Multimodal Journeys: ${multimodalJourneys.length}`);
  
  if (multimodalJourneys.length > 0) {
    const modeCombinations = multimodalJourneys.map(j => 
      j.modes || Array.from(new Set(j.segments.map(s => s.mode)))
    );
    
    console.log('Mode Combinations:');
    modeCombinations.forEach((combo, i) => {
      if (i < 5) { // Show only first 5
        console.log(`  - ${combo.join(' -> ')}`);
      }
    });
    
    if (modeCombinations.length > 5) {
      console.log(`  - ... and ${modeCombinations.length - 5} more`);
    }
  }
  
  // Find all road connections
  const roadEdges = graph.edges.filter(edge => edge.mode === 'road');
  console.log(`Road Connections: ${roadEdges.length}`);
  
  // Verify leg details
  const legsMissingInfo = graph.legDetails.filter(leg => 
    !leg.origin || !leg.destination || !leg.mode || 
    !leg.departureLocation || !leg.arrivalLocation
  );
  
  if (legsMissingInfo.length > 0) {
    console.log(`WARNING: ${legsMissingInfo.length} legs are missing critical information`);
  } else {
    console.log('All legs have complete information');
  }
  
  return {
    nodeCount: Object.keys(graph.nodes).length,
    edgeCount: graph.edges.length,
    journeyCount: graph.journeys.length,
    legDetailsCount: graph.legDetails.length,
    multimodalJourneyCount: multimodalJourneys.length,
    transportModes: Array.from(modes),
    journeyTypes,
    roadConnectionCount: roadEdges.length
  };
}

// Main test function
async function runTests() {
  console.log('Starting Multimodal Graph Debug Tests');
  console.log('====================================');
  
  const results = [];
  
  // Run each test scenario
  for (const scenario of TEST_SCENARIOS) {
    console.log(`\nTesting Scenario: ${scenario.name}`);
    console.log(`Origin: (${scenario.origin.lat}, ${scenario.origin.lng})`);
    console.log(`Destination: (${scenario.destination.lat}, ${scenario.destination.lng})`);
    console.log(`Start Date: ${scenario.startDate}`);
    
    try {
      console.time(`${scenario.name} build time`);
      const graph = await buildMultimodalGraph(scenario.origin, scenario.destination, scenario.startDate);
      console.timeEnd(`${scenario.name} build time`);
      
      // Save graph to file for inspection
      const outputPath = path.join(__dirname, `multimodal-${scenario.name.toLowerCase().replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));
      console.log(`Graph saved to ${outputPath}`);
      
      // Analyze the graph
      const analysis = analyzeGraph(graph, scenario.name);
      results.push({
        scenario: scenario.name,
        analysis
      });
      
    } catch (error) {
      console.error(`Error testing ${scenario.name}:`, error);
      results.push({
        scenario: scenario.name,
        error: error.message
      });
    }
  }
  
  // Save overall results
  const resultsPath = path.join(__dirname, 'multimodal-debug-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${resultsPath}`);
  
  console.log('\nTests Completed');
  console.log('==============');
  
  // Display overall summary
  console.log('\nSummary:');
  results.forEach(result => {
    if (result.error) {
      console.log(`${result.scenario}: ERROR - ${result.error}`);
    } else {
      console.log(`${result.scenario}: ${result.analysis.journeyCount} journeys, ${result.analysis.multimodalJourneyCount} multimodal`);
    }
  });
}

// Run the tests
runTests()
  .then(() => {
    console.log('Debug script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug script failed:', error);
    process.exit(1);
  }); 
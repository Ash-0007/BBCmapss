const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Test the multimodal graph API
 */
async function testMultimodalGraph() {
  try {
    // Define the origin and destination locations
    const origin = { lat: 9.931233, lng: 76.267304 }; // Cochin
    const destination = { lat: 52.370216, lng: 4.895168 }; // Amsterdam
    const startDate = '2025-05-01';
    
    console.log('Starting multimodal graph test...');
    console.log(`Origin: ${JSON.stringify(origin)}`);
    console.log(`Destination: ${JSON.stringify(destination)}`);
    console.log(`Start date: ${startDate}`);
    
    // First, test using the actual API endpoint
    console.log('\n1. Testing via API endpoint:');
    try {
      const apiResponse = await axios.post('http://localhost:3000/api/multimodal-graph', {
        origin,
        destination,
        startDate
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log(`API Response Status: ${apiResponse.status}`);
      console.log(`Graph statistics: ${JSON.stringify(apiResponse.data.stats)}`);
      
      // Save the API response to a file
      fs.writeFileSync(
        path.join(__dirname, 'multimodal-api-result.json'),
        JSON.stringify(apiResponse.data, null, 2)
      );
      console.log('API result saved to multimodal-api-result.json');
    } catch (apiError) {
      console.error('API test failed:', apiError.message);
      if (apiError.response) {
        console.error('API response:', apiError.response.data);
      }
    }
    
    // Then, test using the direct module function
    console.log('\n2. Testing via direct module function:');
    try {
      const { buildMultimodalGraph } = require('./multimodal_graph');
      const directGraph = await buildMultimodalGraph(origin, destination, startDate);
      
      console.log(`Direct module result: ${Object.keys(directGraph.nodes).length} nodes, ${directGraph.edges.length} edges`);
      
      // Save the direct result to a file
      fs.writeFileSync(
        path.join(__dirname, 'multimodal-direct-result.json'),
        JSON.stringify(directGraph, null, 2)
      );
      console.log('Direct module result saved to multimodal-direct-result.json');
    } catch (directError) {
      console.error('Direct module test failed:', directError);
    }
    
    console.log('\nTests completed.');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
testMultimodalGraph(); 
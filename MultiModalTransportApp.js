import React, { useState, useEffect } from 'react';
import PortAirportFinder from './PortAirportFinder';
import EnhancedMultiModalRoutePlanner from './EnhancedMultiModalRoutePlanner';

function MultiModalTransportApp() {
  const [airData, setAirData] = useState(null);
  const [seaData, setSeaData] = useState(null);
  const [enhancedAirGraph, setEnhancedAirGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('finder'); // 'finder' or 'planner'
  
  // Fetch all necessary data when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch air routes data
        const airResponse = await fetch('/api/routes/air');
        if (!airResponse.ok) throw new Error('Failed to fetch air routes');
        const airRoutesData = await airResponse.json();
        
        // Fetch sea routes data
        const seaResponse = await fetch('/api/routes/sea');
        if (!seaResponse.ok) throw new Error('Failed to fetch sea routes');
        const seaRoutesData = await seaResponse.json();
        
        // Fetch enhanced air graph with node details
        const graphResponse = await fetch('/api/enhanced_graph');
        if (!graphResponse.ok) throw new Error('Failed to fetch enhanced graph');
        const graphData = await graphResponse.json();
        
        setAirData(airRoutesData.routes || {});
        setSeaData(seaRoutesData.routes || {});
        setEnhancedAirGraph(graphData || {});
      } catch (error) {
        console.error('Error fetching transportation data:', error);
        setError('Failed to load transportation data. Please refresh the page or try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };
  
  return (
    <div className="container mx-auto p-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-blue-800">Multi-Modal Transport Hub</h1>
        <p className="text-gray-600 mt-2">
          Find connections between airports and seaports, and plan multi-modal freight routes
        </p>
      </header>
      
      {/* Tab navigation */}
      <div className="mb-6 border-b">
        <div className="flex">
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === 'finder' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-blue-500'
            }`}
            onClick={() => handleTabChange('finder')}
          >
            Port-Airport Finder
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === 'planner' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-blue-500'
            }`}
            onClick={() => handleTabChange('planner')}
          >
            Route Planner
          </button>
        </div>
      </div>
      
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="mb-4 text-blue-500 font-medium">Loading transportation data...</div>
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      )}
      
      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {/* Content */}
      {!loading && !error && (
        <div>
          {activeTab === 'finder' && (
            <PortAirportFinder />
          )}
          
          {activeTab === 'planner' && (
            <EnhancedMultiModalRoutePlanner 
              airData={airData} 
              seaData={seaData} 
              enhancedAirGraph={enhancedAirGraph}
            />
          )}
        </div>
      )}
      
      {/* Footer */}
      <footer className="mt-12 pt-4 border-t text-center text-gray-500 text-sm">
        <p>
          © {new Date().getFullYear()} Multi-Modal Transport Hub | Powered by BBC Maps
        </p>
      </footer>
    </div>
  );
}

export default MultiModalTransportApp; 
import React, { useState } from "react";

const App = () => {
  const [origin, setOrigin] = useState("DUB");
  const [destination, setDestination] = useState("DEL");
  const [flightDate, setFlightDate] = useState("2025-04-05");
  const [flightData, setFlightData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFlightData = async () => {
    setLoading(true);
    setError(null);
    setFlightData(null);

    try {
      const res = await fetch("http://localhost:3000/api/air-cargo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          flightDate,
        }),
      });

      if (!res.ok) throw new Error(`Error: ${res.status}`);

      const data = await res.json();
      setFlightData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  };

  const renderFlightRoute = (route) => {
    return (
      <div className="flight-route bg-white rounded-lg shadow-md p-6 mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Flight Route</h3>
        {route.map((flight, index) => (
          <div key={index} className="flight-segment bg-gray-50 rounded-lg p-4 mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-blue-600">
                {flight.carrierCode} {flight.flightNo}
              </span>
              <span className="text-xs bg-blue-100 text-blue-800 font-medium px-2 py-1 rounded">
                {flight.aircraftType}
              </span>
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <div className="text-center">
                <div className="text-lg font-bold">{flight.origin}</div>
                <div className="text-xs text-gray-500">
                  {formatDateTime(flight.deptDateTimesLocal[0])}
                </div>
              </div>
              
              <div className="flex-1 mx-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                  <div className="flex-1 h-px bg-gray-300 mx-1"></div>
                  <div className="flex-1 h-px bg-gray-300 mx-1"></div>
                  <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold">{flight.destination}</div>
                <div className="text-xs text-gray-500">
                  {formatDateTime(flight.arrDateTimesLocal[0])}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between text-xs text-gray-600">
              <span>Stops: {flight.numberOfStop}</span>
              {flight.flightCancelled && (
                <span className="text-red-500">CANCELLED</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Cargo Flight Search</h1>
          <p className="text-gray-600">Find available cargo routes and schedules</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
              <input
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                placeholder="e.g., DUB"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <input
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                placeholder="e.g., DEL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Flight Date</label>
              <input
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                type="date"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
              />
            </div>
          </div>
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition duration-200"
            onClick={fetchFlightData}
            disabled={loading}
          >
            {loading ? "Searching..." : "Search Flights"}
          </button>
        </div>
        
        {loading && (
          <div className="text-center p-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Searching for flights...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {flightData && flightData.records && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Available Routes</h2>
            {flightData.records.map((route, index) => renderFlightRoute(route))}
          </div>
        )}
        
        {!loading && !error && !flightData && (
          <div className="text-center p-8 text-gray-500">
            Enter search criteria and click "Search Flights" to find available cargo routes
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
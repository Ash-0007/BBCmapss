import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import './FreightSimulation.css';

const MetricsPanel = ({ route, weights }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  
  // Create or update chart when metrics change
  useEffect(() => {
    if (!route || !route.metrics) return;
    
    const metrics = route.metrics;
    const ctx = chartRef.current.getContext('2d');
    
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    
    // Create new chart
    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Duration (hours)', 'Emissions (tons CO2)', 'Cost (USD)'],
        datasets: [{
          label: 'Route Metrics',
          data: [
            parseFloat(metrics.duration.toFixed(2)),
            parseFloat(metrics.emissions.toFixed(2)),
            parseFloat(metrics.cost.toFixed(2))
          ],
          backgroundColor: [
            'rgba(255, 99, 132, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 159, 64, 0.6)'
          ],
          borderColor: [
            'rgb(255, 99, 132)',
            'rgb(75, 192, 192)',
            'rgb(255, 159, 64)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                const index = context.dataIndex;
                
                if (index === 0) {
                  return `${label}: ${value} hours`;
                } else if (index === 1) {
                  return `${label}: ${value} tons CO2`;
                } else {
                  return `${label}: $${value}`;
                }
              }
            }
          }
        }
      }
    });
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [route]);
  
  if (!route || !route.metrics) {
    return null;
  }
  
  const { metrics, path } = route;
  
  // Calculate weighted score
  const normalizedDuration = metrics.duration / 100; // Example max values
  const normalizedEmissions = metrics.emissions / 1000;
  const normalizedCost = metrics.cost / 5000;
  
  const weightedScore = (
    weights.duration * normalizedDuration +
    weights.emissions * normalizedEmissions +
    weights.cost * normalizedCost
  ).toFixed(3);
  
  return (
    <div className="freight-metrics-panel">
      <h3>Route Metrics</h3>
      
      <div className="freight-metrics-summary">
        <div className="freight-metric-item">
          <span className="freight-metric-label">Nodes:</span>
          <span className="freight-metric-value">{path.length}</span>
        </div>
        <div className="freight-metric-item">
          <span className="freight-metric-label">Duration:</span>
          <span className="freight-metric-value">{metrics.duration.toFixed(2)} hours</span>
        </div>
        <div className="freight-metric-item">
          <span className="freight-metric-label">Emissions:</span>
          <span className="freight-metric-value">{metrics.emissions.toFixed(2)} tons CO2</span>
        </div>
        <div className="freight-metric-item">
          <span className="freight-metric-label">Cost:</span>
          <span className="freight-metric-value">${metrics.cost.toFixed(2)}</span>
        </div>
        <div className="freight-metric-item">
          <span className="freight-metric-label">Weighted Score:</span>
          <span className="freight-metric-value">{weightedScore}</span>
        </div>
      </div>
      
      <div className="freight-chart-container">
        <canvas ref={chartRef} height="200"></canvas>
      </div>
      
      <div className="freight-route-details">
        <h4>Route Details</h4>
        <table className="freight-route-table">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Duration</th>
              <th>Emissions</th>
              <th>Cost</th>
              <th>Weather</th>
            </tr>
          </thead>
          <tbody>
            {route.edges.map((edge, index) => (
              <tr key={index}>
                <td>{edge.mode === 'flight' ? '✈️ Flight' : '🚢 Ship'}</td>
                <td>{edge.duration.toFixed(2)}h</td>
                <td>{edge.emissions.toFixed(2)} tons</td>
                <td>${edge.cost.toFixed(2)}</td>
                <td>
                  {edge.weather_impact > 0 ? (
                    <span 
                      className="freight-weather-indicator"
                      style={{ 
                        backgroundColor: `rgba(255, 0, 0, ${edge.weather_impact})` 
                      }}
                    >
                      {Math.round(edge.weather_impact * 100)}%
                    </span>
                  ) : 'Clear'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MetricsPanel; 
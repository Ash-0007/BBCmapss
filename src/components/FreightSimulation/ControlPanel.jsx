import React, { useState } from 'react';
import './FreightSimulation.css';

const ControlPanel = ({
  nodes,
  selectedSource,
  selectedTarget,
  weights,
  painPoints,
  onNodeSelect,
  onFindRoute,
  onUpdateWeights,
  onUpdateDelay,
  onAddPainPoint,
  onRemovePainPoint
}) => {
  // State for form values
  const [currentWeights, setCurrentWeights] = useState(weights);
  const [delayNode, setDelayNode] = useState('');
  const [delayHours, setDelayHours] = useState(0);
  
  const [painPointNode, setPainPointNode] = useState('');
  const [painPointType, setPainPointType] = useState('strike');
  const [painPointName, setPainPointName] = useState('');
  const [painPointDelay, setPainPointDelay] = useState(0);
  const [painPointBlocked, setPainPointBlocked] = useState(false);
  
  // Handle weight slider changes
  const handleWeightChange = (key, value) => {
    const newWeights = { ...currentWeights, [key]: parseFloat(value) };
    setCurrentWeights(newWeights);
  };
  
  // Apply weight changes
  const handleApplyWeights = () => {
    onUpdateWeights(currentWeights);
  };
  
  // Handle delay update
  const handleDelayUpdate = () => {
    if (delayNode) {
      onUpdateDelay(delayNode, delayHours);
    }
  };
  
  // Handle adding pain point
  const handleAddPain = () => {
    if (painPointNode) {
      onAddPainPoint(
        painPointNode,
        painPointType,
        painPointName || `${painPointType} at ${painPointNode}`,
        painPointDelay,
        painPointBlocked
      );
      
      // Reset form
      setPainPointNode('');
      setPainPointName('');
      setPainPointDelay(0);
      setPainPointBlocked(false);
    }
  };
  
  return (
    <div className="freight-control-panel">
      <div className="freight-control-section">
        <h3>Route Selection</h3>
        <div className="freight-node-selection">
          <div className="freight-node-info">
            <label>Source:</label>
            <span>{selectedSource ? selectedSource.name : 'Not selected'}</span>
          </div>
          <div className="freight-node-info">
            <label>Target:</label>
            <span>{selectedTarget ? selectedTarget.name : 'Not selected'}</span>
          </div>
        </div>
        
        <div className="freight-button-group">
          <button 
            className="freight-route-button"
            onClick={() => onFindRoute(false)}
            disabled={!selectedSource || !selectedTarget}
          >
            Find Optimal Route
          </button>
          <button 
            className="freight-route-button freight-rl-button"
            onClick={() => onFindRoute(true)}
            disabled={!selectedSource || !selectedTarget}
          >
            Use RL Optimization
          </button>
        </div>
      </div>
      
      <div className="freight-control-section">
        <h3>Optimization Weights</h3>
        <div className="freight-slider-container">
          <label>Duration Weight:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={currentWeights.duration}
            onChange={(e) => handleWeightChange('duration', e.target.value)}
          />
          <span>{Math.round(currentWeights.duration * 100)}%</span>
        </div>
        
        <div className="freight-slider-container">
          <label>Emissions Weight:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={currentWeights.emissions}
            onChange={(e) => handleWeightChange('emissions', e.target.value)}
          />
          <span>{Math.round(currentWeights.emissions * 100)}%</span>
        </div>
        
        <div className="freight-slider-container">
          <label>Cost Weight:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={currentWeights.cost}
            onChange={(e) => handleWeightChange('cost', e.target.value)}
          />
          <span>{Math.round(currentWeights.cost * 100)}%</span>
        </div>
        
        <button 
          className="freight-apply-button"
          onClick={handleApplyWeights}
        >
          Apply Weights
        </button>
      </div>
      
      <div className="freight-control-section">
        <h3>Port/Airport Delays</h3>
        <div className="freight-form-group">
          <label>Select Node:</label>
          <select 
            value={delayNode}
            onChange={(e) => setDelayNode(e.target.value)}
          >
            <option value="">-- Select a node --</option>
            {nodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.type})
              </option>
            ))}
          </select>
        </div>
        
        <div className="freight-form-group">
          <label>Delay Hours:</label>
          <input
            type="number"
            min="0"
            max="24"
            value={delayHours}
            onChange={(e) => setDelayHours(parseInt(e.target.value))}
          />
        </div>
        
        <button 
          className="freight-apply-button"
          onClick={handleDelayUpdate}
          disabled={!delayNode}
        >
          Update Delay
        </button>
      </div>
      
      <div className="freight-control-section">
        <h3>Pain Points</h3>
        <div className="freight-form-group">
          <label>Select Node:</label>
          <select 
            value={painPointNode}
            onChange={(e) => setPainPointNode(e.target.value)}
          >
            <option value="">-- Select a node --</option>
            {nodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.type})
              </option>
            ))}
          </select>
        </div>
        
        <div className="freight-form-group">
          <label>Event Type:</label>
          <select
            value={painPointType}
            onChange={(e) => setPainPointType(e.target.value)}
          >
            <option value="strike">Strike</option>
            <option value="weather">Severe Weather</option>
            <option value="congestion">Congestion</option>
            <option value="mechanical">Mechanical Issue</option>
            <option value="security">Security Concern</option>
          </select>
        </div>
        
        <div className="freight-form-group">
          <label>Event Name:</label>
          <input
            type="text"
            value={painPointName}
            onChange={(e) => setPainPointName(e.target.value)}
            placeholder="Optional name"
          />
        </div>
        
        <div className="freight-form-group">
          <label>Delay Increase (hours):</label>
          <input
            type="number"
            min="0"
            max="24"
            value={painPointDelay}
            onChange={(e) => setPainPointDelay(parseInt(e.target.value))}
          />
        </div>
        
        <div className="freight-form-group freight-checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={painPointBlocked}
              onChange={(e) => setPainPointBlocked(e.target.checked)}
            />
            Completely Block Node
          </label>
        </div>
        
        <button 
          className="freight-apply-button"
          onClick={handleAddPain}
          disabled={!painPointNode}
        >
          Add Pain Point
        </button>
      </div>
      
      {painPoints.length > 0 && (
        <div className="freight-control-section">
          <h3>Active Pain Points</h3>
          <ul className="freight-pain-point-list">
            {painPoints.map((point, index) => {
              const nodeInfo = nodes.find(n => n.id === point.node_id);
              return (
                <li key={index} className="freight-pain-point-item">
                  <div className="freight-pain-point-info">
                    <strong>{point.name}</strong>
                    <span>{nodeInfo ? nodeInfo.name : point.node_id}</span>
                    <span className="freight-pain-type">{point.event_type}</span>
                    {point.delay_increase > 0 && (
                      <span className="freight-pain-delay">+{point.delay_increase}h delay</span>
                    )}
                    {point.blocked && (
                      <span className="freight-pain-blocked">BLOCKED</span>
                    )}
                  </div>
                  <button 
                    className="freight-remove-button"
                    onClick={() => onRemovePainPoint(index)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ControlPanel; 
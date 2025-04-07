import React, { useEffect, useRef, useState } from 'react';
import styles from '../../assets/MapComponent.module.scss';

/**
 * Component to visualize multimodal transport graph with multiple transportation types
 * Nodes represent ports, airports, and locations, while edges represent routes by
 * different modes of transport (road, sea, air)
 */
const MultimodalGraphVisualization = ({ graphData }) => {
    const canvasRef = useRef(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
    const [filters, setFilters] = useState({
        showRoad: true,
        showSea: true,
        showAir: true
    });

    // Apply filters to graph data
    const filteredGraph = React.useMemo(() => {
        if (!graphData) return null;
        
        return {
            nodes: graphData.nodes,
            edges: graphData.edges.filter(edge => {
                if (edge.type === 'road' && !filters.showRoad) return false;
                if (edge.type === 'sea' && !filters.showSea) return false;
                if (edge.type === 'air' && !filters.showAir) return false;
                return true;
            })
        };
    }, [graphData, filters]);

    // Draw the graph canvas
    useEffect(() => {
        if (!filteredGraph || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        
        ctx.clearRect(0, 0, width, height);
        
        // Set node size based on importance/connections
        const baseNodeRadius = 15;
        const padding = 60;
        const minX = padding;
        const minY = padding;
        const maxX = width - padding;
        const maxY = height - padding;
        
        // Create nodes with positions - we'll use a force-directed layout base
        // but with some special positioning for known locations
        const nodes = filteredGraph.nodes.map(node => {
            // Use appropriate node colors based on node type
            let color;
            let radius = baseNodeRadius;
            
            switch(node.type) {
                case 'origin':
                case 'destination':
                    color = '#3b82f6'; // Blue
                    radius = baseNodeRadius * 1.5; // Origin/dest are larger
                    break;
                case 'airport':
                    color = '#ef4444'; // Red for airports
                    break;
                case 'seaport':
                    color = '#10b981'; // Green for seaports
                    break;
                default:
                    color = '#94a3b8'; // Grey for other nodes
            }
            
            // Determine initial position - we'll use a simple layout at first
            // Organize airports at the top, seaports at the bottom for easier visualization
            let x, y;
            
            if (node.type === 'origin') {
                x = width * 0.25;
                y = height * 0.5;
            } else if (node.type === 'destination') {
                x = width * 0.75;
                y = height * 0.5;
            } else if (node.type === 'airport') {
                // Random position for airports in the upper half
                x = minX + Math.random() * (maxX - minX);
                y = minY + Math.random() * ((maxY - minY) / 2);
            } else if (node.type === 'seaport') {
                // Random position for seaports in the lower half
                x = minX + Math.random() * (maxX - minX);
                y = minY + ((maxY - minY) / 2) + Math.random() * ((maxY - minY) / 2);
            } else {
                // Fallback random position
                x = minX + Math.random() * (maxX - minX);
                y = minY + Math.random() * (maxY - minY);
            }
            
            // Add connections count to size
            radius = radius + Math.min(node.connections || 0, 5);
            
            return {
                ...node,
                x,
                y,
                radius,
                color
            };
        });
        
        // Create edges with endpoints
        const edges = filteredGraph.edges.map(edge => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            
            if (!source || !target) return null;
            
            // Calculate the direction vector between nodes
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            
            // Calculate distance between nodes
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Normalize the direction vector
            const ndx = dx / distance;
            const ndy = dy / distance;
            
            // Calculate the edge endpoints on the boundaries of the nodes
            const startX = source.x + ndx * source.radius;
            const startY = source.y + ndy * source.radius;
            const endX = target.x - ndx * target.radius;
            const endY = target.y - ndy * target.radius;
            
            // Calculate midpoint for edge labels
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            
            // Use appropriate colors based on edge type
            let color;
            let lineWidth = 2;
            let lineDash = [];
            
            switch(edge.type) {
                case 'road':
                    color = '#94a3b8'; // Grey for roads
                    break;
                case 'sea':
                    color = '#10b981'; // Green for sea routes
                    lineWidth = 3;
                    break;
                case 'air':
                    color = '#ef4444'; // Red for air routes
                    lineWidth = 2;
                    lineDash = [5, 3]; // Dashed for air routes
                    break;
                default:
                    color = '#94a3b8'; // Grey for unknown
            }
            
            return {
                ...edge,
                source,
                target,
                startX,
                startY,
                endX,
                endY,
                midX,
                midY,
                color,
                lineWidth,
                lineDash
            };
        }).filter(Boolean);
        
        // Simple force-directed layout simulation (very simplified)
        const applyForces = () => {
            // Repulsive forces between nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const nodeA = nodes[i];
                    const nodeB = nodes[j];
                    
                    const dx = nodeB.x - nodeA.x;
                    const dy = nodeB.y - nodeA.y;
                    const distSq = dx * dx + dy * dy;
                    const dist = Math.sqrt(distSq);
                    
                    if (dist < 100) { // Only apply repulsion if nodes are close
                        const force = 100 / (dist + 1);
                        const fx = dx / dist * force;
                        const fy = dy / dist * force;
                        
                        // Don't move origin/destination nodes
                        if (nodeA.type !== 'origin' && nodeA.type !== 'destination') {
                            nodeA.x -= fx;
                            nodeA.y -= fy;
                        }
                        
                        if (nodeB.type !== 'origin' && nodeB.type !== 'destination') {
                            nodeB.x += fx;
                            nodeB.y += fy;
                        }
                    }
                }
            }
            
            // Attractive forces along edges
            for (const edge of edges) {
                const { source, target } = edge;
                
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                const force = dist / 30;
                const fx = dx / dist * force;
                const fy = dy / dist * force;
                
                // Only move nodes connected by edges if they're not origin/destination
                if (source.type !== 'origin' && source.type !== 'destination') {
                    source.x += fx;
                    source.y += fy;
                }
                
                if (target.type !== 'origin' && target.type !== 'destination') {
                    target.x -= fx;
                    target.y -= fy;
                }
            }
            
            // Keep nodes within boundaries
            for (const node of nodes) {
                if (node.type !== 'origin' && node.type !== 'destination') {
                    node.x = Math.max(minX + node.radius, Math.min(maxX - node.radius, node.x));
                    node.y = Math.max(minY + node.radius, Math.min(maxY - node.radius, node.y));
                }
            }
        };
        
        // Run a few iterations of force simulation
        for (let i = 0; i < 50; i++) {
            applyForces();
        }
        
        // Draw the graph
        const drawGraph = () => {
            // Draw edges
            for (const edge of edges) {
                const isSelected = selectedEdge && edge.id === selectedEdge.id;
                
                ctx.beginPath();
                ctx.moveTo(edge.startX, edge.startY);
                ctx.lineTo(edge.endX, edge.endY);
                ctx.strokeStyle = isSelected ? '#facc15' : edge.color;
                ctx.lineWidth = isSelected ? edge.lineWidth + 1 : edge.lineWidth;
                
                // Apply line dash pattern if any
                ctx.setLineDash(edge.lineDash);
                ctx.stroke();
                ctx.setLineDash([]); // Reset line dash
                
                // Draw edge direction arrow
                const arrowSize = 8;
                const angle = Math.atan2(edge.endY - edge.startY, edge.endX - edge.startX);
                
                // Calculate position 20% from the end point
                const arrowX = edge.endX - 0.2 * (edge.endX - edge.startX);
                const arrowY = edge.endY - 0.2 * (edge.endY - edge.startY);
                
                ctx.beginPath();
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(
                    arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
                    arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
                    arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.closePath();
                ctx.fillStyle = isSelected ? '#facc15' : edge.color;
                ctx.fill();
                
                // Draw a small edge type icon at midpoint if selected
                if (isSelected) {
                    const iconSize = 16;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#ffffff';
                    
                    // Background circle
                    ctx.beginPath();
                    ctx.arc(edge.midX, edge.midY, iconSize, 0, 2 * Math.PI);
                    ctx.fillStyle = edge.color;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    // Icon based on transport type
                    let icon = '?';
                    switch(edge.type) {
                        case 'road': icon = '🚚'; break;
                        case 'sea': icon = '🚢'; break;
                        case 'air': icon = '✈️'; break;
                    }
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(icon, edge.midX, edge.midY);
                }
            }
            
            // Draw nodes
            for (const node of nodes) {
                const isSelected = selectedNode && node.id === selectedNode.id;
                
                // Draw node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                ctx.fillStyle = isSelected ? '#facc15' : node.color;
                ctx.fill();
                
                // Draw white border
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw node label if there are not too many nodes or the node is selected
                if (nodes.length <= 20 || isSelected || node.type === 'origin' || node.type === 'destination') {
                    ctx.font = isSelected ? 'bold 12px Arial' : '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'white';
                    
                    // Use code for airports/seaports, name for origin/destination
                    const label = (node.type === 'airport' || node.type === 'seaport') ? 
                                  node.code : 
                                  node.name?.substring(0, 10);
                    
                    ctx.fillText(label, node.x, node.y);
                }
                
                // Draw a small node type icon for selected nodes
                if (isSelected) {
                    const iconSize = 12;
                    const iconX = node.x + node.radius + 5;
                    const iconY = node.y - node.radius - 5;
                    
                    ctx.beginPath();
                    ctx.arc(iconX, iconY, iconSize, 0, 2 * Math.PI);
                    ctx.fillStyle = node.color;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    // Icon based on node type
                    let icon = '?';
                    switch(node.type) {
                        case 'origin': icon = 'A'; break;
                        case 'destination': icon = 'B'; break;
                        case 'airport': icon = '✈️'; break;
                        case 'seaport': icon = '🚢'; break;
                    }
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 10px Arial';
                    ctx.fillText(icon, iconX, iconY);
                }
            }
        };
        
        drawGraph();
        
        // Handle canvas click
        const handleCanvasClick = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Check if a node was clicked
            let clickedNode = null;
            for (const node of nodes) {
                const dx = node.x - x;
                const dy = node.y - y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq <= node.radius * node.radius) {
                    clickedNode = node;
                    break;
                }
            }
            
            if (clickedNode) {
                setSelectedNode(clickedNode);
                setSelectedEdge(null);
                return;
            }
            
            // Check if an edge was clicked
            let clickedEdge = null;
            for (const edge of edges) {
                // Calculate distance from click to edge
                const dx = edge.endX - edge.startX;
                const dy = edge.endY - edge.startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate normalized perpendicular vector
                const nx = -dy / length;
                const ny = dx / length;
                
                // Calculate distance from click to edge
                const distX = x - edge.startX;
                const distY = y - edge.startY;
                
                // Project distance vector onto perpendicular
                const perpDist = Math.abs(distX * nx + distY * ny);
                
                // Project distance vector onto edge
                const edgeProj = (distX * dx + distY * dy) / length;
                
                // Check if within threshold distance and within edge bounds
                if (perpDist <= 8 && edgeProj >= 0 && edgeProj <= length) {
                    clickedEdge = edge;
                    break;
                }
            }
            
            if (clickedEdge) {
                setSelectedEdge(clickedEdge);
                setSelectedNode(null);
                return;
            }
            
            // Clear selection if nothing was clicked
            setSelectedNode(null);
            setSelectedEdge(null);
        };
        
        canvas.addEventListener('click', handleCanvasClick);
        
        return () => {
            canvas.removeEventListener('click', handleCanvasClick);
        };
    }, [filteredGraph, selectedNode, selectedEdge]);

    if (!graphData) {
        return <div className={styles.graphLoading}>No multimodal graph data to display</div>;
    }

    return (
        <div className={styles.multimodalGraphContainer}>
            <div className={styles.graphHeader}>
                <h3 className={styles.graphTitle}>Multimodal Transport Network</h3>
                <div className={styles.graphStats}>
                    <div>Nodes: {graphData.nodes.length}</div>
                    <div>Connections: {graphData.edges.length}</div>
                </div>
                <div className={styles.graphFilters}>
                    <label className={styles.filterLabel}>
                        <input
                            type="checkbox"
                            checked={filters.showRoad}
                            onChange={() => setFilters(prev => ({ ...prev, showRoad: !prev.showRoad }))}
                        />
                        <span className={`${styles.filterIndicator} ${styles.roadIndicator}`}></span>
                        Road
                    </label>
                    <label className={styles.filterLabel}>
                        <input
                            type="checkbox"
                            checked={filters.showSea}
                            onChange={() => setFilters(prev => ({ ...prev, showSea: !prev.showSea }))}
                        />
                        <span className={`${styles.filterIndicator} ${styles.seaIndicator}`}></span>
                        Sea
                    </label>
                    <label className={styles.filterLabel}>
                        <input
                            type="checkbox"
                            checked={filters.showAir}
                            onChange={() => setFilters(prev => ({ ...prev, showAir: !prev.showAir }))}
                        />
                        <span className={`${styles.filterIndicator} ${styles.airIndicator}`}></span>
                        Air
                    </label>
                </div>
            </div>
            <div className={styles.canvasWrapper}>
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className={styles.graphCanvas}
                />
            </div>
            {selectedNode && (
                <div className={styles.nodeDetail}>
                    <h4>{selectedNode.name} ({selectedNode.type})</h4>
                    {selectedNode.code && <p>Code: {selectedNode.code}</p>}
                    <p>Connections: {selectedNode.connections}</p>
                    {selectedNode.lat && selectedNode.lng && (
                        <p>Location: {selectedNode.lat.toFixed(4)}, {selectedNode.lng.toFixed(4)}</p>
                    )}
                </div>
            )}
            {selectedEdge && (
                <div className={styles.edgeDetail}>
                    <h4>
                        {selectedEdge.type.charAt(0).toUpperCase() + selectedEdge.type.slice(1)} Route: {" "}
                        {selectedEdge.source.code || selectedEdge.source.name} → {selectedEdge.target.code || selectedEdge.target.name}
                    </h4>
                    <div className={styles.edgeData}>
                        {selectedEdge.type === 'road' && (
                            <>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Distance:</span>
                                    <span>{selectedEdge.distance?.toFixed(1)} km</span>
                                </div>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Duration:</span>
                                    <span>{selectedEdge.duration?.toFixed(0)} min</span>
                                </div>
                            </>
                        )}
                        {selectedEdge.type === 'sea' && (
                            <>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Vessel:</span>
                                    <span>{selectedEdge.shipName}</span>
                                </div>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Voyage:</span>
                                    <span>{selectedEdge.voyage}</span>
                                </div>
                                {selectedEdge.duration && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Duration:</span>
                                        <span>{(selectedEdge.duration / 24).toFixed(1)} days</span>
                                    </div>
                                )}
                                {selectedEdge.departureTime && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Departure:</span>
                                        <span>{new Date(selectedEdge.departureTime).toLocaleString()}</span>
                                    </div>
                                )}
                                {selectedEdge.arrivalTime && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Arrival:</span>
                                        <span>{new Date(selectedEdge.arrivalTime).toLocaleString()}</span>
                                    </div>
                                )}
                            </>
                        )}
                        {selectedEdge.type === 'air' && (
                            <>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Airline:</span>
                                    <span>{selectedEdge.airline}</span>
                                </div>
                                <div className={styles.edgeDataItem}>
                                    <span className={styles.edgeLabel}>Flight:</span>
                                    <span>{selectedEdge.flight}</span>
                                </div>
                                {selectedEdge.aircraft && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Aircraft:</span>
                                        <span>{selectedEdge.aircraft}</span>
                                    </div>
                                )}
                                {selectedEdge.duration && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Duration:</span>
                                        <span>{selectedEdge.duration.toFixed(1)} hours</span>
                                    </div>
                                )}
                                {selectedEdge.departureTime && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Departure:</span>
                                        <span>{selectedEdge.departureTime}</span>
                                    </div>
                                )}
                                {selectedEdge.arrivalTime && (
                                    <div className={styles.edgeDataItem}>
                                        <span className={styles.edgeLabel}>Arrival:</span>
                                        <span>{selectedEdge.arrivalTime}</span>
                                    </div>
                                )}
                            </>
                        )}
                        {selectedEdge.emission && (
                            <div className={styles.edgeDataItem}>
                                <span className={styles.edgeLabel}>Est. Emissions:</span>
                                <span>{selectedEdge.emission.toFixed(1)} kg CO₂</span>
                            </div>
                        )}
                        {selectedEdge.cost && (
                            <div className={styles.edgeDataItem}>
                                <span className={styles.edgeLabel}>Est. Cost:</span>
                                <span>${selectedEdge.cost.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultimodalGraphVisualization; 
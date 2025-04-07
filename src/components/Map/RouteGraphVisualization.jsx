import React, { useEffect, useRef, useState } from 'react';
import styles from '../../assets/MapComponent.module.scss';

/**
 * Component to visualize shipping routes as a graph with ports as nodes
 * and edges containing sea route, duration, emission, and cost details
 */
const RouteGraphVisualization = ({ routesData }) => {
    const canvasRef = useRef(null);
    const [graph, setGraph] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
    

    useEffect(() => {
        if (!routesData || !routesData.completeRoutes) return;
        

        const nodes = new Map();
        const edges = [];
        

        const calculateDuration = (departure, arrival) => {
            if (!departure || !arrival) {
                console.log("Duration calculation: Missing departure or arrival time");
                return null;
            }
            
            try {

                console.log(`Calculating duration between: ETD1=${departure}, ETD2=${arrival}`);
                
                const departureTime = new Date(departure);
                const arrivalTime = new Date(arrival);
                

                if (isNaN(departureTime) || isNaN(arrivalTime)) {
                    console.log("Duration calculation: Invalid date format");
                    return null;
                }
                
                const durationHours = (arrivalTime - departureTime) / (1000 * 60 * 60);
                console.log(`Calculated duration: ${durationHours} hours`);
                

                return durationHours.toFixed(1);
            } catch (e) {
                console.error("Error calculating duration:", e);
                return null;
            }
        };
        

        routesData.completeRoutes.forEach(route => {
            if (!route.voyages || !Array.isArray(route.voyages)) return;
            

            route.voyages.forEach(leg => {

                const fromPort = leg.fromPort;
                const toPort = leg.toPort;
                

                if (!fromPort || !toPort) return;
                

                if (leg.schedule && leg.schedule.length > 0) {

                    const sortedSchedule = [...leg.schedule].sort((a, b) => {
                        const timeA = a.etd || a.eta;
                        const timeB = b.etd || b.eta;
                        return new Date(timeA) - new Date(timeB);
                    });
                    

                    console.log("Schedule for leg", leg.voyage, sortedSchedule);
                    

                    sortedSchedule.forEach((stop) => {
                        const portCode = stop.port;
                        if (!portCode) return;
                        
                        if (!nodes.has(portCode)) {
                            nodes.set(portCode, {
                                id: portCode,
                                name: stop.portName || portCode,
                                connections: 0
                            });
                        }
                    });
                    

                    for (let i = 0; i < sortedSchedule.length - 1; i++) {
                        const currentPort = sortedSchedule[i].port;
                        const nextPort = sortedSchedule[i + 1].port;
                        
                        if (!currentPort || !nextPort) continue;
                        

                        nodes.get(currentPort).connections++;
                        nodes.get(nextPort).connections++;
                        


                        const duration = calculateDuration(
                            sortedSchedule[i].etd, 
                            sortedSchedule[i + 1].etd
                        );
                        

                        edges.push({
                            id: `${currentPort}-${nextPort}-${leg.voyage}-${i}`,
                            source: currentPort,
                            target: nextPort,
                            sea: leg.shipName || 'Unknown',
                            voyage: leg.voyage || 'Unknown',
                            duration: duration,
                            fromETD: sortedSchedule[i].etd,
                            toETD: sortedSchedule[i + 1].etd,
                            emission: null,
                            cost: null
                        });
                    }
                } else {


                    if (!nodes.has(fromPort)) {
                        nodes.set(fromPort, {
                            id: fromPort,
                            name: leg.fromPortName || fromPort,
                            connections: 0
                        });
                    }
                    
                    if (!nodes.has(toPort)) {
                        nodes.set(toPort, {
                            id: toPort,
                            name: leg.toPortName || toPort,
                            connections: 0
                        });
                    }
                    

                    nodes.get(fromPort).connections++;
                    nodes.get(toPort).connections++;
                    

                    const duration = calculateDuration(leg.departureTime, leg.arrivalTime);
                    

                    edges.push({
                        id: `${fromPort}-${toPort}-${leg.voyage}`,
                        source: fromPort,
                        target: toPort,
                        sea: leg.shipName || 'Unknown',
                        voyage: leg.voyage || 'Unknown',
                        duration: duration,
                        emission: null,
                        cost: null
                    });
                }
            });
        });
        
        setGraph({ 
            nodes: Array.from(nodes.values()),
            edges
        });
        
    }, [routesData]);
    

    useEffect(() => {
        if (!graph || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        

        ctx.clearRect(0, 0, width, height);
        

        const nodeRadius = 25; // Increased radius for better clicking
        const nodePadding = 40;
        
        // Simple force-directed layout
        const nodes = graph.nodes.map((node, index) => {
            // Create initial positions in a circle
            const angle = (index / graph.nodes.length) * 2 * Math.PI;
            const radius = Math.min(width, height) / 3;
            
            return {
                ...node,
                x: width / 2 + radius * Math.cos(angle),
                y: height / 2 + radius * Math.sin(angle),
                radius: nodeRadius + Math.min(node.connections * 2, 10) // Size based on connections, with a cap
            };
        });
        
        // Generate all edge paths
        const edgePaths = graph.edges.map(edge => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            
            if (!source || !target) return null;
            
            // Calculate the vector between source and target
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            
            // Calculate the normalized vector
            const distance = Math.sqrt(dx * dx + dy * dy);
            const ndx = dx / distance;
            const ndy = dy / distance;
            
            // Offset start and end points to edge of nodes, not center
            const startX = source.x + ndx * source.radius;
            const startY = source.y + ndy * source.radius;
            const endX = target.x - ndx * target.radius;
            const endY = target.y - ndy * target.radius;
            
            // Calculate the midpoint for edge labels and click detection
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            
            return {
                edge,
                startX,
                startY,
                endX,
                endY,
                midX,
                midY,
                dx: endX - startX,
                dy: endY - startY,
                distance: distance - source.radius - target.radius // Actual edge length
            };
        }).filter(Boolean);
        
        // Draw edges
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2; // Increased line width for better visibility and clicking
        
        edgePaths.forEach(({ edge, startX, startY, endX, endY, midX, midY }) => {
            // Draw the edge line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            if (selectedEdge && selectedEdge.id === edge.id) {
                // Highlight selected edge
                ctx.strokeStyle = '#3182ce';
                ctx.lineWidth = 4; // Increased highlight width
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                // Reset for other edges
                ctx.strokeStyle = '#aaa';
                ctx.lineWidth = 2;
            }
            
            // Add bigger circle at midpoint for better click detection
            ctx.fillStyle = selectedEdge && selectedEdge.id === edge.id ? '#3182ce' : '#999';
            ctx.beginPath();
            ctx.arc(midX, midY, 6, 0, 2 * Math.PI); // Increased size from 4 to 6
            ctx.fill();
        });
        
        // Draw nodes
        nodes.forEach(node => {
            // Draw a slightly larger invisible hit area for each node
            if (selectedNode && selectedNode.id === node.id) {
                ctx.fillStyle = '#3182ce';
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 5, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Node circle
            ctx.fillStyle = selectedNode && selectedNode.id === node.id ? '#4299e1' : '#e2e8f0';
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            
            // Node label
            ctx.fillStyle = '#1a202c';
            ctx.font = 'bold 13px Arial'; // Slightly larger font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.id, node.x, node.y);
        });
        
        // Add click handler for nodes and edges
        const handleCanvasClick = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            console.log("Canvas click at:", x, y); // Log click coordinates
            
            // Check if clicked on a node (check nodes first since they're visually on top)
            let clickedNode = null;
            for (const node of nodes) {
                const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
                if (distance <= node.radius + 8) { // Increased click area from radius to radius+8
                    clickedNode = node;
                    console.log("Node clicked:", node.id, "distance:", distance);
                    break;
                }
            }
            
            if (clickedNode) {
                setSelectedNode(clickedNode);
                setSelectedEdge(null);
                return;
            }
            
            // Check if clicked on an edge or near edge path
            let clickedEdge = null;
            let minDistance = Infinity;
            
            for (const { edge, startX, startY, endX, endY, midX, midY } of edgePaths) {
                // Check if clicked near the midpoint (easier to click)
                const midDistance = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
                if (midDistance <= 12) { // Increased detection radius from 10 to 12
                    if (midDistance < minDistance) {
                        minDistance = midDistance;
                        clickedEdge = edge;
                        console.log("Edge midpoint clicked:", edge.source, "->", edge.target, "distance:", midDistance);
                    }
                    continue;
                }
                
                // Check if clicked near the edge line
                // Calculate distance from point to line segment
                const lineLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
                if (lineLength === 0) continue;
                
                // Calculate projection of click point onto line
                const t = Math.max(0, Math.min(1, ((x - startX) * (endX - startX) + (y - startY) * (endY - startY)) / (lineLength * lineLength)));
                const projX = startX + t * (endX - startX);
                const projY = startY + t * (endY - startY);
                
                // Distance from click to nearest point on line
                const distance = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
                
                if (distance <= 10 && distance < minDistance) { // Increased from 6 to 10
                    minDistance = distance;
                    clickedEdge = edge;
                    console.log("Edge line clicked:", edge.source, "->", edge.target, "distance:", distance);
                }
            }
            
            if (clickedEdge) {
                setSelectedEdge(clickedEdge);
                setSelectedNode(null);
                return;
            }
            
            // Clicked on empty space
            setSelectedNode(null);
            setSelectedEdge(null);
        };
        
        canvas.addEventListener('click', handleCanvasClick);
        
        return () => {
            canvas.removeEventListener('click', handleCanvasClick);
        };
    }, [graph, selectedNode, selectedEdge]);
    
    if (!graph) {
        return <div className={styles.graphLoading}>Processing graph data...</div>;
    }
    
    return (
        <div className={styles.routeGraphContainer}>
            <h3 className={styles.graphTitle}>Port Network Graph</h3>
            <div className={styles.graphStats}>
                <div>Ports: {graph.nodes.length}</div>
                <div>Connections: {graph.edges.length}</div>
            </div>
            
            <div className={styles.canvasWrapper}>
                <canvas 
                    ref={canvasRef} 
                    width={600} 
                    height={400} 
                    className={styles.graphCanvas}
                />
            </div>
            
            {selectedNode && (
                <div className={styles.nodeDetail}>
                    <h4>{selectedNode.name} ({selectedNode.id})</h4>
                    <p>Connections: {selectedNode.connections}</p>
                </div>
            )}
            
            {selectedEdge && (
                <div className={styles.edgeDetail}>
                    <h4>Route: {selectedEdge.source} → {selectedEdge.target}</h4>
                    <div className={styles.edgeData}>
                        <div className={styles.edgeDataItem}>
                            <span className={styles.edgeLabel}>Sea:</span>
                            <span>{selectedEdge.sea}</span>
                        </div>
                        <div className={styles.edgeDataItem}>
                            <span className={styles.edgeLabel}>Voyage:</span>
                            <span>{selectedEdge.voyage}</span>
                        </div>
                        <div className={styles.edgeDataItem}>
                            <span className={styles.edgeLabel}>Duration:</span>
                            <span>{selectedEdge.duration ? `${selectedEdge.duration} hours` : 'Not available'}</span>
                        </div>
                        {selectedEdge.fromETD && (
                            <div className={styles.edgeDataItem}>
                                <span className={styles.edgeLabel}>From ETD:</span>
                                <span>{new Date(selectedEdge.fromETD).toLocaleString()}</span>
                            </div>
                        )}
                        {selectedEdge.toETD && (
                            <div className={styles.edgeDataItem}>
                                <span className={styles.edgeLabel}>To ETD:</span>
                                <span>{new Date(selectedEdge.toETD).toLocaleString()}</span>
                            </div>
                        )}
                        <div className={styles.edgeDataItem}>
                            <span className={styles.edgeLabel}>Emission:</span>
                            <span>{selectedEdge.emission || 'Not available'}</span>
                        </div>
                        <div className={styles.edgeDataItem}>
                            <span className={styles.edgeLabel}>Cost:</span>
                            <span>{selectedEdge.cost || 'Not available'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RouteGraphVisualization; 
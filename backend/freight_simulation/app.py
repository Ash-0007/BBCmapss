"""
Flask API for freight routing simulation.
"""
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import time

from .simulation import FreightSimulation
from .utils import FreightRoutingEnv, SACAgent
from .config import (
    HOST, PORT, DEBUG, CORS_ORIGINS, 
    ROUTES_DAT_PATH, SHIPPING_LANES_PATH
)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize simulation
simulation = None
sac_agent = None


def initialize_simulation(force_reprocess=False):
    """Initialize the simulation"""
    global simulation
    global sac_agent
    
    logger.info("Initializing freight simulation...")
    
    try:
        # Process data files if they don't exist or reprocessing is forced
        process_data_files = force_reprocess
        
        # Check if processed files exist
        processed_routes_path = os.path.join(os.path.dirname(ROUTES_DAT_PATH), 'processed_routes.json')
        processed_shipping_path = os.path.join(os.path.dirname(SHIPPING_LANES_PATH), 'processed_shipping.json')
        
        if not os.path.exists(processed_routes_path) or not os.path.exists(processed_shipping_path):
            process_data_files = True
        
        if process_data_files:
            logger.info("Processing data files...")
            
            try:
                # Import processing modules
                from backend.data.process_routes import main as process_routes
                from backend.data.process_shipping import main as process_shipping
                
                # Process routes.dat
                logger.info("Processing routes.dat...")
                result = process_routes()
                if result != 0:
                    logger.warning("Routes processing returned non-zero exit code")
                
                # Process shipping data
                logger.info("Processing shipping data...")
                result = process_shipping()
                if result != 0:
                    logger.warning("Shipping data processing returned non-zero exit code")
                
                logger.info("Data processing completed")
                
                # Wait for files to be written
                time.sleep(1)
            except ImportError:
                logger.warning("Could not import processing modules, skipping preprocessing")
        
        simulation = FreightSimulation()
        simulation.initialize(ROUTES_DAT_PATH, SHIPPING_LANES_PATH)
        
        # Initialize RL environment and agent
        env = FreightRoutingEnv(simulation)
        sac_agent = SACAgent(
            env.observation_space,
            env.action_space
        )
        
        logger.info("Simulation initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing simulation: {str(e)}")
        raise


def create_app():
    """Create and configure the Flask app"""
    app = Flask(__name__)
    
    # Setup CORS - Fix to ensure proper CORS headers and avoid duplicates
    # Use only one method for CORS configuration
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    
    # Initialize simulation
    if not simulation:
        try:
            initialize_simulation()
        except Exception as e:
            logger.error(f"Failed to initialize simulation on startup: {str(e)}")
    
    @app.route('/status', methods=['GET'])
    def status():
        """Get the simulation status"""
        return jsonify({
            'status': 'ok',
            'simulation_initialized': simulation is not None and simulation.initialized,
            'nodes_count': len(simulation.nodes) if simulation and simulation.initialized else 0,
            'edges_count': len(simulation.edges) if simulation and simulation.initialized else 0
        })

    @app.route('/api/status', methods=['GET'])
    def api_status():
        """API compatible status endpoint"""
        return status()

    @app.route('/initialize', methods=['POST'])
    def init():
        """Initialize the simulation"""
        try:
            # Check for force_reprocess parameter
            force_reprocess = request.json.get('force_reprocess', False) if request.is_json else False
            initialize_simulation(force_reprocess=force_reprocess)
            return jsonify({
                'status': 'ok',
                'message': 'Simulation initialized successfully',
                'nodes_count': len(simulation.nodes),
                'edges_count': len(simulation.edges)
            })
        except Exception as e:
            logger.error(f"Error initializing simulation: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/initialize', methods=['POST'])
    def api_init():
        """API compatible initialize endpoint"""
        return init()


    @app.route('/graph', methods=['GET'])
    def get_graph():
        """Get the entire transportation graph"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        # Check for pagination or filtering params
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int, default=0)
        node_type = request.args.get('type')  # Filter by node type (airport, seaport)
        
        # Get nodes with optional filtering
        all_nodes = simulation.get_all_nodes(node_type=node_type)
        total_nodes = len(all_nodes)
        
        # Apply pagination if specified
        nodes = all_nodes
        if limit is not None:
            nodes = all_nodes[offset:offset+limit]
        
        # Check if edges should be included
        include_edges = request.args.get('include_edges') == 'true'
        
        # Get all edges
        all_edges = simulation.get_all_edges()
        total_edges = len(all_edges)
        
        # Apply filtering to edges if needed
        edges = []
        if include_edges:
            # Filter edges by node type if specified
            if node_type:
                filtered_node_ids = [node['id'] for node in all_nodes]
                edges = [edge for edge in all_edges 
                        if edge['source'] in filtered_node_ids or edge['destination'] in filtered_node_ids]
            else:
                edges = all_edges
            
            # Apply pagination to edges if specified
            if limit is not None:
                edges = edges[offset:offset+limit]
        
        return jsonify({
            'nodes': nodes,
            'edges': edges,
            'total_nodes': total_nodes,
            'total_edges': total_edges
        })

    @app.route('/api/graph', methods=['GET'])
    def api_get_graph():
        """API compatible graph endpoint"""
        return get_graph()


    @app.route('/weather', methods=['GET'])
    def get_weather():
        """Get the current weather grid"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        return jsonify(simulation.get_weather_grid())

    @app.route('/api/weather', methods=['GET'])
    def api_get_weather():
        """API compatible weather endpoint"""
        return get_weather()


    @app.route('/weather', methods=['POST'])
    def update_weather():
        """Update the weather grid at the specified location"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        lat = data.get('lat')
        lon = data.get('lon')
        severity = data.get('severity')
        
        if lat is None or lon is None or severity is None:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        try:
            simulation.update_weather(lat, lon, severity)
            return jsonify({
                'status': 'ok',
                'weather_grid': simulation.get_weather_grid()
            })
        except Exception as e:
            logger.error(f"Error updating weather: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/weather', methods=['POST'])
    def api_update_weather():
        """API compatible update weather endpoint"""
        return update_weather()


    @app.route('/port_delay', methods=['POST'])
    def update_port_delay():
        """Update delay at a specific port"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        node_id = data.get('node_id')
        delay_hours = data.get('delay_hours')
        
        if node_id is None or delay_hours is None:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        try:
            simulation.update_port_delay(node_id, delay_hours)
            return jsonify({
                'status': 'ok',
                'node_id': node_id,
                'delay_hours': delay_hours
            })
        except Exception as e:
            logger.error(f"Error updating port delay: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/port_delay', methods=['POST'])
    def api_update_port_delay():
        """API compatible port delay endpoint"""
        return update_port_delay()


    @app.route('/pain_points', methods=['GET'])
    def get_pain_points():
        """Get all pain points in the system"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        return jsonify({
            'status': 'ok',
            'pain_points': simulation.get_pain_points()
        })

    @app.route('/api/pain_points', methods=['GET'])
    def api_get_pain_points():
        """API compatible pain points endpoint"""
        return get_pain_points()


    @app.route('/pain_points', methods=['POST'])
    def add_pain_point():
        """Add a new pain point to the system"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        node_id = data.get('node_id')
        event_type = data.get('event_type')
        name = data.get('name')
        delay_increase = data.get('delay_increase', 0)
        blocked = data.get('blocked', False)
        
        if node_id is None or event_type is None:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        try:
            simulation.add_pain_point(node_id, event_type, name, delay_increase, blocked)
            return jsonify({
                'status': 'ok',
                'pain_points': simulation.get_pain_points()
            })
        except Exception as e:
            logger.error(f"Error adding pain point: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/pain_points', methods=['POST'])
    def api_add_pain_point():
        """API compatible add pain point endpoint"""
        return add_pain_point()


    @app.route('/pain_points/<int:index>', methods=['DELETE'])
    def remove_pain_point(index):
        """Remove a pain point from the system"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        try:
            simulation.remove_pain_point(index)
            return jsonify({
                'status': 'ok',
                'pain_points': simulation.get_pain_points()
            })
        except Exception as e:
            logger.error(f"Error removing pain point: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/pain_points/<int:index>', methods=['DELETE'])
    def api_remove_pain_point(index):
        """API compatible remove pain point endpoint"""
        return remove_pain_point(index)


    @app.route('/weights', methods=['POST'])
    def update_weights():
        """Update optimization weights"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        duration = data.get('duration')
        emissions = data.get('emissions')
        cost = data.get('cost')
        
        try:
            simulation.update_weights(duration, emissions, cost)
            return jsonify({
                'status': 'ok',
                'weights': simulation.weights
            })
        except Exception as e:
            logger.error(f"Error updating weights: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/weights', methods=['POST'])
    def api_update_weights():
        """API compatible update weights endpoint"""
        return update_weights()


    @app.route('/route', methods=['POST'])
    def find_route():
        """Find the optimal route between source and target nodes"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        source_id = data.get('source_id')
        target_id = data.get('target_id')
        
        if source_id is None or target_id is None:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        try:
            # Use Dijkstra's algorithm for pathfinding
            route = simulation.find_shortest_path(source_id, target_id)
            
            if route:
                return jsonify({
                    'status': 'ok',
                    'route': route
                })
            else:
                return jsonify({'error': 'No route found'}), 404
        except Exception as e:
            logger.error(f"Error finding route: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/route', methods=['POST'])
    def api_find_route():
        """API compatible find route endpoint"""
        return find_route()


    @app.route('/simulate_rl', methods=['POST'])
    def simulate_rl():
        """Simulate a route using RL"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        source_id = data.get('source_id')
        target_id = data.get('target_id')
        
        if source_id is None or target_id is None:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        try:
            # Create an environment for RL
            env = FreightRoutingEnv(simulation)
            env.reset(source_id, target_id)
            
            # Use the RL agent to find a route
            if sac_agent is None:
                return jsonify({'error': 'RL agent not initialized'}), 500
            
            # Run the RL simulation
            state = env.get_observation()
            done = False
            path = [source_id]
            actions = []
            
            while not done:
                action = sac_agent.select_action(state)
                next_state, reward, done, info = env.step(action)
                
                actions.append({
                    'action': action,
                    'reward': reward,
                    'node': info.get('node_id')
                })
                
                if info.get('node_id'):
                    path.append(info['node_id'])
                
                state = next_state
                
                if len(path) > 100:
                    break  # Prevent infinite loops
            
            return jsonify({
                'status': 'ok',
                'path': path,
                'actions': actions,
                'success': info.get('success', False),
                'metrics': info.get('metrics', {})
            })
        except Exception as e:
            logger.error(f"Error simulating RL route: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/simulate_rl', methods=['POST'])
    def api_simulate_rl():
        """API compatible RL simulation endpoint"""
        return simulate_rl()

    @app.route('/api/sea_route', methods=['POST'])
    def api_sea_route():
        """Find a sea route between two ports using SeaRoute library"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        data = request.json
        from_lat = data.get('from_lat')
        from_lon = data.get('from_lon')
        to_lat = data.get('to_lat')
        to_lon = data.get('to_lon')
        from_port_id = data.get('from_port_id')
        to_port_id = data.get('to_port_id')
        
        if not ((from_lat is not None and from_lon is not None and to_lat is not None and to_lon is not None) or 
                (from_port_id is not None and to_port_id is not None)):
            return jsonify({'error': 'Missing required parameters. Provide either coordinates or port IDs'}), 400
        
        # If port IDs are provided, get their coordinates
        if from_port_id is not None and to_port_id is not None:
            if from_port_id in simulation.nodes and to_port_id in simulation.nodes:
                from_node = simulation.nodes[from_port_id]
                to_node = simulation.nodes[to_port_id]
                from_lat = from_node.lat
                from_lon = from_node.lon
                to_lat = to_node.lat
                to_lon = to_node.lon
            else:
                return jsonify({'error': 'Invalid port IDs'}), 400
        
        import os
        import subprocess
        import csv
        import json
        import uuid
        
        try:
            # Generate a unique ID for this route to avoid file conflicts
            route_id = str(uuid.uuid4())
            
            # Create input CSV file
            input_csv = f"searoute_input_{route_id}.csv"
            output_geojson = f"searoute_output_{route_id}.geojson"
            
            # Write CSV with header and one row for our route
            with open(input_csv, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['olon', 'olat', 'dlon', 'dlat'])
                writer.writerow([from_lon, from_lat, to_lon, to_lat])
            
            # Path to data directory where searoute.jar is located
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
            
            # Store current directory
            current_dir = os.getcwd()
            
            # Change to data directory
            os.chdir(data_dir)
            
            # Execute searoute.jar to generate route
            cmd = ['java', '-jar', 'searoute.jar', 
                   '-i', os.path.join(current_dir, input_csv), 
                   '-o', os.path.join(current_dir, output_geojson),
                   '-res', '20']
            
            logger.info(f"Executing command: {' '.join(cmd)}")
            
            # Run the command
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True
            )
            
            # Change back to original directory
            os.chdir(current_dir)
            
            if result.returncode != 0:
                logger.error(f"Error executing searoute.jar: {result.stderr}")
                return jsonify({'error': f'Error executing searoute.jar: {result.stderr}'}), 500
            
            # Check if output file was created
            if not os.path.exists(output_geojson):
                logger.error(f"Output file not created. Command output: {result.stdout}, Error: {result.stderr}")
                return jsonify({'error': 'Failed to generate route. Output file not created.'}), 500
            
            # Read the GeoJSON output
            with open(output_geojson, 'r') as f:
                route_data = json.load(f)
            
            # Clean up temporary files
            try:
                os.remove(input_csv)
                os.remove(output_geojson)
            except Exception as e:
                logger.warning(f"Could not remove temporary files: {str(e)}")
            
            # Find ports along the route
            ports_along_route = []
            distance_km = 0
            
            # Extract the route coordinates
            if route_data.get('features') and len(route_data['features']) > 0:
                route_feature = route_data['features'][0]
                distance_km = route_feature['properties'].get('distKM', 0)
                
                if route_feature.get('geometry', {}).get('type') == 'LineString':
                    coordinates = route_feature['geometry']['coordinates']
                elif route_feature.get('geometry', {}).get('type') == 'MultiLineString':
                    coordinates = route_feature['geometry']['coordinates'][0]
                else:
                    coordinates = []
                
                # For each port, check if it's close to the route
                for node_id, node in simulation.nodes.items():
                    if node.type == 'seaport':
                        # Check if this port is close to any point on the route
                        for coord in coordinates:
                            # coord is [lon, lat]
                            point_lon, point_lat = coord
                            distance = simulation._haversine(node.lat, node.lon, point_lat, point_lon)
                            
                            # If port is within 50km of any point on the route, include it
                            if distance <= 50:  # 50km threshold
                                ports_along_route.append({
                                    'id': node.id,
                                    'name': node.name,
                                    'lat': node.lat,
                                    'lon': node.lon,
                                    'distance_to_route': distance
                                })
                                break  # No need to check other points
            
            # Add start and end ports explicitly if they exist
            if from_port_id and from_port_id in simulation.nodes:
                from_node = simulation.nodes[from_port_id]
                start_port = {
                    'id': from_node.id,
                    'name': from_node.name,
                    'lat': from_node.lat,
                    'lon': from_node.lon,
                    'is_endpoint': True,
                    'endpoint_type': 'start'
                }
                # Add if not already in the list
                if not any(p['id'] == from_port_id for p in ports_along_route):
                    ports_along_route.append(start_port)
            
            if to_port_id and to_port_id in simulation.nodes:
                to_node = simulation.nodes[to_port_id]
                end_port = {
                    'id': to_node.id,
                    'name': to_node.name,
                    'lat': to_node.lat,
                    'lon': to_node.lon,
                    'is_endpoint': True,
                    'endpoint_type': 'end'
                }
                # Add if not already in the list
                if not any(p['id'] == to_port_id for p in ports_along_route):
                    ports_along_route.append(end_port)
            
            # Log success
            logger.info(f"Successfully generated sea route from {from_port_id} to {to_port_id} with distance {distance_km}km")
            
            # Return the route data and ports along route
            return jsonify({
                'status': 'ok',
                'route': route_data,
                'ports_along_route': ports_along_route,
                'distance_km': distance_km
            })
        
        except Exception as e:
            import traceback
            logger.error(f"Error generating sea route: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
            
    @app.route('/api/ports_list', methods=['GET'])
    def api_ports_list():
        """Get a list of all ports and airports"""
        if not simulation or not simulation.initialized:
            return jsonify({'error': 'Simulation not initialized'}), 500
        
        # Get query parameters
        port_type = request.args.get('type')
        
        try:
            ports = []
            for node_id, node in simulation.nodes.items():
                if port_type and node.type != port_type:
                    continue
                    
                ports.append({
                    'id': node.id,
                    'name': node.name,
                    'lat': node.lat,
                    'lon': node.lon,
                    'type': node.type,
                    'connections_count': node.connections_count
                })
            
            return jsonify({
                'status': 'ok',
                'ports': ports
            })
        except Exception as e:
            logger.error(f"Error getting ports list: {str(e)}")
            return jsonify({'error': str(e)}), 500

    return app


def run():
    """Run the Flask application"""
    app = create_app()
    app.run(host=HOST, port=PORT, debug=DEBUG)


if __name__ == "__main__":
    run()

"""
Core simulation logic for multi-modal freight routing.
"""
import os
import json
import random
import math
import networkx as nx
import numpy as np
import torch
from collections import defaultdict, deque
import time

from .models import Node, Edge, WeatherGrid, PainPoint
from .config import (
    WEATHER_GRID_SIZE, SIMULATION_STEPS, UPDATE_INTERVAL,
    MAX_RETRIES, RETRY_DELAY, 
    AIRPORTS_API_URL, SEAPORTS_API_URL, ALL_PORTS_API_URL
)


class FreightSimulation:
    """Freight routing simulation with RL-based route optimization"""
    
    def __init__(self):
        self.graph = nx.DiGraph()
        self.nodes = {}  # id -> Node object
        self.edges = []  # List of Edge objects
        self.weather_grid = WeatherGrid(grid_size=WEATHER_GRID_SIZE)
        self.pain_points = []  # List of PainPoint objects
        self.weights = {
            'duration': 0.4,
            'emissions': 0.3,
            'cost': 0.3
        }
        self.current_route = None
        self.initialized = False
        
    def initialize(self, flight_data_path, shipping_data_path):
        """Initialize the simulation with data from files"""
        self._load_flight_data(flight_data_path)
        self._load_shipping_data(shipping_data_path)
        self._build_graph()
        self.initialized = True
        return self
        
    def _load_flight_data(self, flight_data_path):
        """Load flight route data"""
        if not os.path.exists(flight_data_path):
            raise FileNotFoundError(f"Flight data file not found: {flight_data_path}")
            
        # Dictionary to store airport info
        airports = {}
        airport_coordinates = {}
        
        # Load airport data with coordinates from API
        try:
            import requests
            import time
            print("Fetching airport data from API...")
            
            # Add retry mechanism for API
            max_retries = MAX_RETRIES
            retry_count = 0
            api_success = False
            
            while retry_count < max_retries and not api_success:
                try:
                    # Use the all-ports endpoint to get both airports and seaports
                    endpoints = [
                        ALL_PORTS_API_URL,
                        AIRPORTS_API_URL
                    ]
                    
                    response = None
                    endpoint_worked = False
                    
                    for endpoint in endpoints:
                        try:
                            print(f"Trying endpoint: {endpoint}")
                            response = requests.get(endpoint, timeout=30)
                            if response.status_code == 200:
                                endpoint_worked = True
                                break
                            else:
                                print(f"Endpoint {endpoint} returned status code {response.status_code}")
                        except Exception as endpoint_err:
                            print(f"Error accessing {endpoint}: {str(endpoint_err)}")
                    
                    if not endpoint_worked:
                        raise Exception("All endpoints failed")
                    
                    if response.status_code == 200:
                        api_ports = response.json()
                        print(f"API returned {len(api_ports)} ports")
                        
                        # Filter to just get the airports
                        api_airports = [port for port in api_ports if port.get('type') == 'airport']
                        print(f"Filtered to {len(api_airports)} airports")
                        
                        if len(api_airports) == 0:
                            raise Exception("API returned no valid airports")
                        
                        for airport in api_airports:
                            # Check for either IATA code or code property
                            code_key = None
                            if 'iata_code' in airport:
                                code_key = 'iata_code'
                            elif 'code' in airport:
                                code_key = 'code'
                                
                            # Get coordinates, checking multiple possible field names
                            lat_value = None
                            if 'latitude_dd' in airport:
                                lat_value = airport['latitude_dd']
                            elif 'latitude' in airport:
                                lat_value = airport['latitude']
                            elif 'lat' in airport:
                                lat_value = airport['lat']
                                
                            lon_value = None
                            if 'longitude_dd' in airport:
                                lon_value = airport['longitude_dd']
                            elif 'longitude' in airport:
                                lon_value = airport['longitude']
                            elif 'lon' in airport:
                                lon_value = airport['lon']
                                
                            # Get name field
                            name_value = None
                            if 'airport_name' in airport:
                                name_value = airport['airport_name']
                            elif 'name' in airport:
                                name_value = airport['name']
                            
                            # Only add if we have a code and valid coordinates
                            if code_key and lat_value is not None and lon_value is not None:
                                airport_code = airport[code_key]
                                airport_coordinates[airport_code] = {
                                    'lat': float(lat_value),
                                    'lon': float(lon_value),
                                    'name': name_value or f"Airport {airport_code}"
                                }
                        
                        print(f"Loaded {len(airport_coordinates)} airports with coordinates from API")
                        if len(airport_coordinates) == 0:
                            raise Exception("No valid airport coordinates found in API response")
                            
                        api_success = True
                    else:
                        print(f"API returned status code {response.status_code}, retrying...")
                        retry_count += 1
                        time.sleep(RETRY_DELAY)
                except Exception as req_err:
                    print(f"Request failed: {str(req_err)}, retrying...")
                    retry_count += 1
                    time.sleep(RETRY_DELAY)
                    
            if not api_success:
                raise Exception("Failed to load airport data from API after multiple retries")
                
        except Exception as e:
            print(f"Error loading airport data from API: {str(e)}")
            raise Exception(f"Cannot initialize simulation without valid airport data from API")
        
        # Dictionary to track connection counts for each airport
        connection_counts = {}
        
        print(f"Parsing flight data from {flight_data_path}")
        total_routes = 0
        valid_routes = 0
        
        # First pass: count connections
        with open(flight_data_path, 'r') as f:
            for line in f:
                total_routes += 1
                parts = line.strip().split(',')
                if len(parts) < 5:
                    continue  # Skip invalid lines
                    
                airline, airline_id, src, src_id, dst, dst_id, codeshare, stops, equipment = parts
                
                # We'll only use direct flights (stops = 0)
                if stops != "0":
                    continue
                
                valid_routes += 1
                
                # Increment connection count for both source and destination
                connection_counts[src_id] = connection_counts.get(src_id, 0) + 1
                connection_counts[dst_id] = connection_counts.get(dst_id, 0) + 1
        
        print(f"Processed {total_routes} total routes, found {valid_routes} valid direct routes")
        
        # Second pass: create nodes
        processed_routes = 0
        with open(flight_data_path, 'r') as f:
            for line in f:
                parts = line.strip().split(',')
                if len(parts) < 5:
                    continue
                    
                airline, airline_id, src, src_id, dst, dst_id, codeshare, stops, equipment = parts
                
                if stops != "0":
                    continue
                
                processed_routes += 1
                
                # Create source airport node if not exists
                if src_id not in self.nodes and src in airport_coordinates:
                    lat = airport_coordinates[src]['lat']
                    lon = airport_coordinates[src]['lon']
                    name = airport_coordinates[src]['name']
                    
                    airports[src_id] = {
                        'code': src,
                        'name': name,
                        'lat': lat,
                        'lon': lon,
                        'connections': connection_counts.get(src_id, 0)
                    }
                
                # Create destination airport node if not exists
                if dst_id not in self.nodes and dst in airport_coordinates:
                    lat = airport_coordinates[dst]['lat']
                    lon = airport_coordinates[dst]['lon']
                    name = airport_coordinates[dst]['name']
                    
                    airports[dst_id] = {
                        'code': dst,
                        'name': name,
                        'lat': lat,
                        'lon': lon,
                        'connections': connection_counts.get(dst_id, 0)
                    }
        
        # Create airport nodes
        airport_count = 0
        for airport_id, info in airports.items():
            node = Node(
                id=airport_id,
                lat=info['lat'],
                lon=info['lon'],
                name=info['name'],
                node_type='airport',
                connections_count=info['connections']
            )
            self.nodes[airport_id] = node
            airport_count += 1
            
        print(f"Created {airport_count} airport nodes in the graph")
        
        # Create flight edges with attributes based on actual data
        flight_edges = 0
        with open(flight_data_path, 'r') as f:
            for line in f:
                parts = line.strip().split(',')
                if len(parts) < 5 or parts[-2] != "0":  # Only direct flights
                    continue
                    
                airline, airline_id, src, src_id, dst, dst_id, codeshare, stops, equipment = parts
                
                if src_id not in self.nodes or dst_id not in self.nodes:
                    continue
                    
                # Calculate distance between nodes
                src_node = self.nodes[src_id]
                dst_node = self.nodes[dst_id]
                distance = self._haversine(src_node.lat, src_node.lon, dst_node.lat, dst_node.lon)
                
                # Generate attributes based on real-world estimates
                # Flight speed varies by aircraft type, we'll use 800 km/h as average
                duration = distance / 800  # hours
                # Emissions vary by aircraft, distance, and load - using simplified model
                emissions = distance * 0.25  # ~250g CO2 per km per passenger
                # Cost depends on many factors, using simplistic approximation
                cost = distance * 0.15
                
                edge = Edge(
                    source=src_id,
                    destination=dst_id,
                    mode='flight',
                    duration=duration,
                    emissions=emissions,
                    cost=cost
                )
                self.edges.append(edge)
                src_node.connections.append(edge)
                flight_edges += 1
                
        print(f"Created {flight_edges} flight edges in the graph")
    
    def _load_shipping_data(self, shipping_data_path):
        """Load shipping lane data from GeoJSON file"""
        if not os.path.exists(shipping_data_path):
            raise FileNotFoundError(f"Shipping data file not found: {shipping_data_path}")
            
        try:
            print(f"Loading shipping data from {shipping_data_path}")
            with open(shipping_data_path, 'r') as f:
                geojson_data = json.load(f)
                
            print(f"Loaded GeoJSON with {len(geojson_data.get('features', []))} features")
        except json.JSONDecodeError:
            raise ValueError(f"Invalid GeoJSON file: {shipping_data_path}")
            
        seaports = {}
        port_coordinates = {}
        
        # Load port data with coordinates from API
        try:
            import requests
            import time
            print("Fetching port data from API...")
            
            # Add retry mechanism for API
            max_retries = MAX_RETRIES
            retry_count = 0
            api_success = False
            
            while retry_count < max_retries and not api_success:
                try:
                    # Use the all-ports endpoint to get both airports and seaports
                    endpoints = [
                        ALL_PORTS_API_URL,
                        SEAPORTS_API_URL
                    ]
                    
                    response = None
                    endpoint_worked = False
                    
                    for endpoint in endpoints:
                        try:
                            print(f"Trying endpoint: {endpoint}")
                            response = requests.get(endpoint, timeout=30)
                            if response.status_code == 200:
                                endpoint_worked = True
                                break
                            else:
                                print(f"Endpoint {endpoint} returned status code {response.status_code}")
                        except Exception as endpoint_err:
                            print(f"Error accessing {endpoint}: {str(endpoint_err)}")
                    
                    if not endpoint_worked:
                        raise Exception("All endpoints failed")
                    
                    if response.status_code == 200:
                        api_ports = response.json()
                        print(f"API returned {len(api_ports)} ports")
                        
                        # Filter to just get the seaports
                        api_seaports = [port for port in api_ports if port.get('type') == 'seaport']
                        print(f"Filtered to {len(api_seaports)} seaports")
                        
                        if len(api_seaports) == 0:
                            raise Exception("API returned no valid seaports")
                        
                        for port in api_seaports:
                            # Check for port id using various field names
                            port_id = None
                            if 'world_port_index' in port:
                                port_id = str(port['world_port_index'])
                            elif 'id' in port:
                                port_id = str(port['id'])
                            elif 'code' in port:
                                port_id = str(port['code'])
                            
                            # Get coordinates, checking multiple possible field names
                            lat_value = None
                            if 'latitude_dd' in port:
                                lat_value = port['latitude_dd']
                            elif 'latitude' in port:
                                lat_value = port['latitude']
                            elif 'lat' in port:
                                lat_value = port['lat']
                                
                            lon_value = None
                            if 'longitude_dd' in port:
                                lon_value = port['longitude_dd']
                            elif 'longitude' in port:
                                lon_value = port['longitude']
                            elif 'lon' in port:
                                lon_value = port['lon']
                                
                            # Get name field
                            name_value = None
                            if 'main_port_name' in port:
                                name_value = port['main_port_name']
                            elif 'name' in port:
                                name_value = port['name']
                            
                            # Only add if we have an id and valid coordinates
                            if port_id and lat_value is not None and lon_value is not None:
                                port_coordinates[port_id] = {
                                    'lat': float(lat_value),
                                    'lon': float(lon_value),
                                    'name': name_value or f"Seaport {port_id}"
                                }
                        
                        print(f"Loaded {len(port_coordinates)} ports with coordinates from API")
                        if len(port_coordinates) == 0:
                            raise Exception("No valid seaport coordinates found in API response")
                            
                        api_success = True
                    else:
                        print(f"API returned status code {response.status_code}, retrying...")
                        retry_count += 1
                        time.sleep(RETRY_DELAY)
                except Exception as req_err:
                    print(f"Request failed: {str(req_err)}, retrying...")
                    retry_count += 1
                    time.sleep(RETRY_DELAY)
                    
            if not api_success:
                raise Exception("Failed to load port data from API after multiple retries")
                
        except Exception as e:
            print(f"Error loading port data from API: {str(e)}")
            raise Exception(f"Cannot initialize simulation without valid port data from API")
        
        # Add all seaports with coordinates to the seaports dictionary
        # We add all seaports from the API that have valid coordinates
        for port_id, coords in port_coordinates.items():
            if coords.get('lat') is not None and coords.get('lon') is not None:
                seaports[port_id] = {
                    'lat': coords['lat'],
                    'lon': coords['lon'],
                    'name': coords['name'],
                    'connections': 0  # Will be updated later
                }
        
        # Create seaport nodes first
        seaport_count = 0
        for port_id, info in seaports.items():
            # Ensure the coordinates are valid
            lat = info.get('lat')
            lon = info.get('lon')
            
            # Skip ports with invalid coordinates
            if lat is None or lon is None:
                print(f"Skipping port {port_id} due to missing coordinates")
                continue
                
            # Create the node
            node = Node(
                id=port_id,
                lat=lat,
                lon=lon,
                name=info['name'],
                node_type='seaport',
                connections_count=0  # Will be updated later
            )
            self.nodes[port_id] = node
            seaport_count += 1
            
        print(f"Created {seaport_count} seaport nodes in the graph")
        
        # Now create shipping edges using a more robust approach
        # For each shipping lane, find ports within a proximity threshold and create connections
        shipping_edges = 0
        port_connections = {}  # To track connections for each port
        
        # A shipping lane can connect multiple ports that are within a certain distance
        # For each lane, we'll create edges between all ports that are "close enough" to that lane
        PORT_PROXIMITY_THRESHOLD = 30  # km - maximum distance from a port to a shipping lane
        
        print(f"Creating shipping edges using proximity threshold of {PORT_PROXIMITY_THRESHOLD}km")
        
        # Process all shipping lanes from the GeoJSON data
        total_features = len(geojson_data.get('features', []))
        processed_features = 0
        
        # Group seaports for efficient proximity checking
        seaport_nodes = [node for node_id, node in self.nodes.items() if node.type == 'seaport']
        
        for feature in geojson_data.get('features', []):
            processed_features += 1
            if processed_features % 1000 == 0:
                print(f"Processed {processed_features}/{total_features} shipping features")
            
            if feature.get('geometry', {}).get('type') != 'LineString':
                continue
            
            coordinates = feature.get('geometry', {}).get('coordinates', [])
            if len(coordinates) < 2:
                continue
            
            properties = feature.get('properties', {})
            
            # Get shipping lane properties
            length = None
            if 'Length0' in properties and properties['Length0'] not in [None, '', 'null']:
                try:
                    length = float(properties['Length0']) * 100  # Convert to km
                except (ValueError, TypeError):
                    length = None
                
            route_freq = 1
            if 'Route Freq' in properties and properties['Route Freq'] not in [None, '', 'null']:
                try:
                    route_freq = float(properties['Route Freq'])
                    # Normalize frequency to use as a factor
                    route_freq = max(1, min(10, route_freq / 500))  # Cap between 1-10
                except (ValueError, TypeError):
                    route_freq = 1
                
            # Find all ports that are within the threshold distance of any point on the shipping lane
            nearby_ports = []
            
            # For simplicity, we'll check distance to line endpoints and midpoints
            # A more accurate but computationally expensive approach would check distance to line segments
            check_points = []
            
            # Add endpoints
            check_points.append((coordinates[0][1], coordinates[0][0]))  # lat, lon
            check_points.append((coordinates[-1][1], coordinates[-1][0]))  # lat, lon
            
            # Add some midpoints if the lane is long
            if len(coordinates) > 2:
                midpoint_idx = len(coordinates) // 2
                check_points.append((coordinates[midpoint_idx][1], coordinates[midpoint_idx][0]))
                
                # Add quarter points for very long routes
                if len(coordinates) > 10:
                    quarter_idx = len(coordinates) // 4
                    three_quarter_idx = 3 * len(coordinates) // 4
                    check_points.append((coordinates[quarter_idx][1], coordinates[quarter_idx][0]))
                    check_points.append((coordinates[three_quarter_idx][1], coordinates[three_quarter_idx][0]))
            
            # Find ports near any of these check points
            for port in seaport_nodes:
                for lat, lon in check_points:
                    distance = self._haversine(port.lat, port.lon, lat, lon)
                    if distance <= PORT_PROXIMITY_THRESHOLD:
                        nearby_ports.append(port)
                        break  # No need to check other points for this port
            
            # Create edges between all pairs of nearby ports
            for i in range(len(nearby_ports)):
                for j in range(i+1, len(nearby_ports)):
                    port_a = nearby_ports[i]
                    port_b = nearby_ports[j]
                    
                    # Calculate direct distance between ports
                    distance = self._haversine(port_a.lat, port_a.lon, port_b.lat, port_b.lon)
                    
                    # If the ports are very far apart, this might not be a direct shipping route
                    # Use the lane length if available, otherwise use the distance multiplied by a factor
                    # to account for non-direct routes
                    if length is not None:
                        edge_distance = min(length, distance * 1.5)  # Use whichever is smaller
                    else:
                        edge_distance = distance * 1.2  # Assume routes aren't perfectly straight
                    
                    # Generate realistic shipping statistics
                    speed = 25  # km/h
                    duration = edge_distance / speed  # hours
                    emissions = edge_distance * (0.04 / route_freq)  # Reduce emissions with higher frequency
                    cost = edge_distance * (0.02 / (route_freq ** 0.5))  # Scale cost by sqrt of frequency
                    
                    # Create bidirectional edges (ships can go both ways)
                    for source, destination in [(port_a.id, port_b.id), (port_b.id, port_a.id)]:
                        # Create edge
                        edge = Edge(
                            source=source,
                            destination=destination,
                            mode='ship',
                            duration=duration,
                            emissions=emissions,
                            cost=cost
                        )
                        self.edges.append(edge)
                        self.nodes[source].connections.append(edge)
                        shipping_edges += 1
                        
                        # Update connection counts
                        port_connections[source] = port_connections.get(source, 0) + 1
                        port_connections[destination] = port_connections.get(destination, 0) + 1
        
        # Update the connection counts for all seaport nodes
        for port_id, count in port_connections.items():
            if port_id in self.nodes:
                self.nodes[port_id].connections_count = count
        
        print(f"Created {shipping_edges} shipping edges in the graph")
        print(f"Total graph: {len(self.nodes)} nodes and {len(self.edges)} edges")
    
    def _build_graph(self):
        """Build a NetworkX graph from nodes and edges"""
        # Clear existing graph
        self.graph.clear()
        
        # Add nodes
        for node_id, node in self.nodes.items():
            self.graph.add_node(node_id, **node.to_dict())
            
        # Add edges
        for edge in self.edges:
            # Skip edges where source or destination is blocked
            if (self.nodes[edge.source].blocked or 
                self.nodes[edge.destination].blocked):
                continue
                
            # Update edge values based on weather
            midpoint_lat = (self.nodes[edge.source].lat + self.nodes[edge.destination].lat) / 2
            midpoint_lon = (self.nodes[edge.source].lon + self.nodes[edge.destination].lon) / 2
            weather_impact = self.weather_grid.get_severity(midpoint_lat, midpoint_lon)
            edge.update_values(weather_impact)
            
            # Add node delays to edge duration
            src_delay = self.nodes[edge.source].delay
            edge_duration = edge.current_duration + src_delay
            
            self.graph.add_edge(
                edge.source,
                edge.destination,
                mode=edge.mode,
                duration=edge_duration,
                emissions=edge.current_emissions,
                cost=edge.current_cost,
                weather_impact=edge.weather_impact
            )
    
    def _haversine(self, lat1, lon1, lat2, lon2):
        """Calculate the great circle distance between two points in kilometers"""
        R = 6371  # Earth radius in kilometers
        
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def update_weather(self, lat, lon, severity):
        """Update weather severity for a specific grid block"""
        self.weather_grid.set_severity(lat, lon, severity)
        self._build_graph()  # Rebuild graph with new weather values
        
    def update_port_delay(self, node_id, delay_hours):
        """Update delay for a specific port/airport"""
        if node_id in self.nodes:
            self.nodes[node_id].delay = max(0, min(24, delay_hours))  # Cap at 24 hours
            self._build_graph()  # Rebuild graph with new delay values
            
    def add_pain_point(self, node_id, event_type, name, delay_increase=0, blocked=False):
        """Add a pain point (disruption event) to a node"""
        if node_id not in self.nodes:
            return False
            
        # Create pain point
        pain_point = PainPoint(
            node_id=node_id,
            event_type=event_type,
            name=name,
            delay_increase=delay_increase,
            blocked=blocked
        )
        self.pain_points.append(pain_point)
        
        # Apply pain point effects
        self.nodes[node_id].delay += delay_increase
        self.nodes[node_id].blocked = blocked
        
        self._build_graph()  # Rebuild graph with pain point applied
        return True
        
    def remove_pain_point(self, index):
        """Remove a pain point by index"""
        if 0 <= index < len(self.pain_points):
            pain_point = self.pain_points.pop(index)
            
            # Reverse pain point effects
            node_id = pain_point.node_id
            self.nodes[node_id].delay -= pain_point.delay_increase
            self.nodes[node_id].blocked = False  # Reset blocked status
            
            # Check if another pain point is still blocking this node
            for pp in self.pain_points:
                if pp.node_id == node_id and pp.blocked:
                    self.nodes[node_id].blocked = True
                    break
                    
            self._build_graph()  # Rebuild graph
            return True
        return False
    
    def update_weights(self, duration=None, emissions=None, cost=None):
        """Update optimization weights"""
        if duration is not None:
            self.weights['duration'] = float(duration)
        if emissions is not None:
            self.weights['emissions'] = float(emissions)
        if cost is not None:
            self.weights['cost'] = float(cost)
            
        # Normalize weights to sum to 1
        total = sum(self.weights.values())
        if total > 0:
            for key in self.weights:
                self.weights[key] /= total
    
    def find_shortest_path(self, source_id, target_id):
        """Find the shortest path using Dijkstra's algorithm with weighted attributes"""
        if not self.initialized:
            raise RuntimeError("Simulation not initialized. Call initialize() first.")
            
        if source_id not in self.nodes or target_id not in self.nodes:
            return None
            
        if self.nodes[source_id].blocked or self.nodes[target_id].blocked:
            return None
            
        # Define edge weight function based on our weights
        def weight_function(u, v, edge_data):
            # Normalize values (assume we know max values)
            max_duration = 100  # Example max values
            max_emissions = 1000
            max_cost = 5000
            
            norm_duration = edge_data['duration'] / max_duration
            norm_emissions = edge_data['emissions'] / max_emissions
            norm_cost = edge_data['cost'] / max_cost
            
            # Calculate weighted score
            return (self.weights['duration'] * norm_duration + 
                   self.weights['emissions'] * norm_emissions + 
                   self.weights['cost'] * norm_cost)
        
        try:
            # Use Dijkstra's algorithm with custom weight function
            path = nx.dijkstra_path(self.graph, source_id, target_id, weight=weight_function)
            
            # Calculate path metrics
            duration = 0
            emissions = 0
            cost = 0
            
            edges = []
            for i in range(len(path) - 1):
                u, v = path[i], path[i + 1]
                edge_data = self.graph[u][v]
                
                duration += edge_data['duration']
                emissions += edge_data['emissions']
                cost += edge_data['cost']
                
                edges.append({
                    'source': u,
                    'destination': v,
                    'mode': edge_data['mode'],
                    'duration': edge_data['duration'],
                    'emissions': edge_data['emissions'],
                    'cost': edge_data['cost']
                })
            
            # Create route object
            route = {
                'path': path,
                'edges': edges,
                'metrics': {
                    'duration': duration,
                    'emissions': emissions,
                    'cost': cost,
                    'total_nodes': len(path)
                }
            }
            
            self.current_route = route
            return route
            
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
    
    def get_all_nodes(self, node_type=None):
        """Get all nodes as a list of dicts, optionally filtered by node type"""
        nodes_list = []
        
        for node_id, node in self.nodes.items():
            # Apply node type filter if specified
            if node_type and node.type != node_type:
                continue
            
            nodes_list.append(node.to_dict())
        
        return nodes_list
    
    def get_all_edges(self):
        """Get all edges in the simulation"""
        return [edge.to_dict() for edge in self.edges]
    
    def get_weather_grid(self):
        """Get the current weather grid"""
        return self.weather_grid.to_dict()
    
    def get_pain_points(self):
        """Get all pain points"""
        return [pp.to_dict() for pp in self.pain_points]

    def _find_closest_port(self, lat, lon, max_distance_km=50):
        """Find the closest port to the given coordinates"""
        closest_node = None
        closest_distance = float('inf')
        
        for node_id, node in self.nodes.items():
            if node.type == 'seaport':  # Only match seaports
                distance = self._haversine(lat, lon, node.lat, node.lon)
                if distance < closest_distance and distance < max_distance_km:
                    closest_distance = distance
                    closest_node = node
                    
        return closest_node

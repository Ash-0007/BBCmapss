#!/usr/bin/env python
"""
Process the 25.geojson file with shipping lanes data.

This script will:
1. Load the GeoJSON file containing shipping lanes
2. Extract port information 
3. Calculate route statistics and clean up the data
4. Save processed data to a more efficient format for the application
"""

import os
import json
import logging
import math
from collections import defaultdict
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# File paths
BASE_DIR = Path(__file__).resolve().parent
GEOJSON_FILE = os.path.join(BASE_DIR, '25.geojson')
OUTPUT_FILE = os.path.join(BASE_DIR, 'processed_shipping.json')

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371  # Radius of earth in kilometers
    return c * r

def clean_value(value):
    """Clean and convert value to appropriate type"""
    if value in [None, '', 'null', 'NULL', 'Null', '\\N']:
        return None
    
    # Try to convert to number if possible
    try:
        if '.' in str(value):
            return float(value)
        return int(value)
    except (ValueError, TypeError):
        return str(value)

def load_geojson_data():
    """Load shipping lane data from the GeoJSON file"""
    if not os.path.exists(GEOJSON_FILE):
        raise FileNotFoundError(f"GeoJSON file not found: {GEOJSON_FILE}")

    logger.info(f"Loading shipping data from {GEOJSON_FILE}")
    
    try:
        with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        features = geojson_data.get('features', [])
        logger.info(f"Loaded {len(features)} features from GeoJSON file")
        return geojson_data
    
    except json.JSONDecodeError as e:
        logger.error(f"Invalid GeoJSON file: {e}")
        raise
    except Exception as e:
        logger.error(f"Error reading GeoJSON file: {e}")
        raise

def extract_ports_and_routes(geojson_data):
    """Extract port information and shipping routes from GeoJSON data"""
    logger.info("Extracting ports and routes...")
    
    ports = {}
    routes = []
    port_connections = defaultdict(set)
    
    # Count the total features to process
    total_features = len(geojson_data.get('features', []))
    logger.info(f"Processing {total_features} GeoJSON features")
    
    # First pass: Extract unique ports
    feature_count = 0
    valid_features = 0
    
    for feature in geojson_data.get('features', []):
        feature_count += 1
        
        if feature_count % 1000 == 0:
            logger.info(f"Processing feature {feature_count}/{total_features}")
            
        if feature.get('geometry', {}).get('type') != 'LineString':
            continue
            
        properties = feature.get('properties', {})
        coordinates = feature.get('geometry', {}).get('coordinates', [])
        
        if len(coordinates) < 2:
            continue
            
        valid_features += 1
        
        # Extract source and destination ports
        from_node = clean_value(properties.get('From Node0'))
        to_node = clean_value(properties.get('To Node0'))
        
        if from_node is None or to_node is None:
            continue
        
        # Convert to string for consistency
        from_node = str(from_node)
        to_node = str(to_node)
        
        # Extract port names if available
        from_name = clean_value(properties.get('Name0')) or f"Port {from_node}"
        to_name = from_name  # Often the name refers to the shipping lane, not individual ports
        
        # Extract coordinates for source and destination
        from_coords = coordinates[0]  # [lon, lat]
        to_coords = coordinates[-1]  # [lon, lat]
        
        # Add ports to dictionary if not already present
        if from_node not in ports:
            # Make sure coordinates are valid
            if len(from_coords) >= 2 and -180 <= from_coords[0] <= 180 and -90 <= from_coords[1] <= 90:
                ports[from_node] = {
                    'id': from_node,
                    'name': from_name,
                    'lon': from_coords[0],
                    'lat': from_coords[1],
                    'connections': 0
                }
        
        if to_node not in ports:
            # Make sure coordinates are valid
            if len(to_coords) >= 2 and -180 <= to_coords[0] <= 180 and -90 <= to_coords[1] <= 90:
                ports[to_node] = {
                    'id': to_node,
                    'name': to_name,
                    'lon': to_coords[0],
                    'lat': to_coords[1],
                    'connections': 0
                }
        
        # Track port connections
        port_connections[from_node].add(to_node)
        port_connections[to_node].add(from_node)  # Add bidirectional connection
    
    logger.info(f"Found {len(ports)} unique ports from {valid_features} valid features")
    
    # Second pass: Extract routes with calculated statistics
    route_count = 0
    
    for feature in geojson_data.get('features', []):
        if feature.get('geometry', {}).get('type') != 'LineString':
            continue
            
        properties = feature.get('properties', {})
        coordinates = feature.get('geometry', {}).get('coordinates', [])
        
        if len(coordinates) < 2:
            continue
        
        # Extract source and destination ports
        from_node = str(clean_value(properties.get('From Node0')))
        to_node = str(clean_value(properties.get('To Node0')))
        
        # Skip if ports don't exist (might have been filtered due to invalid coordinates)
        if from_node is None or to_node is None or from_node not in ports or to_node not in ports:
            continue
        
        # Calculate distance if not provided
        distance = clean_value(properties.get('Length0'))
        if distance is None:
            # Calculate from coordinates
            from_port = ports[from_node]
            to_port = ports[to_node]
            distance = haversine(from_port['lat'], from_port['lon'], to_port['lat'], to_port['lon'])
        else:
            # Convert to km if in different unit
            distance = float(distance) * 100  # Assuming unit conversion needed (based on data analysis)
        
        # Get route frequency
        route_freq = clean_value(properties.get('Route Freq')) or 1
        
        # Calculate additional metrics
        impedance = clean_value(properties.get('Impedence0')) or (distance * 0.01)
        
        route = {
            'from_id': from_node,
            'to_id': to_node,
            'distance': distance,
            'frequency': route_freq,
            'impedance': impedance,
            'coordinates': coordinates
        }
        
        # Ensure we're only adding valid routes
        if distance > 0:
            routes.append(route)
            route_count += 1
    
    logger.info(f"Extracted {route_count} valid shipping routes")
    
    # Update port connection counts
    for port_id, connections in port_connections.items():
        if port_id in ports:
            ports[port_id]['connections'] = len(connections)
            ports[port_id]['connected_to'] = list(connections)
    
    # Convert ports dict to list for JSON serialization
    port_list = list(ports.values())
    
    logger.info(f"Final count: {len(port_list)} ports and {len(routes)} shipping routes")
    
    return {
        'ports': port_list,
        'routes': routes,
        'stats': {
            'total_ports': len(port_list),
            'total_routes': len(routes),
            'avg_connections': sum(p['connections'] for p in port_list) / max(1, len(port_list))
        }
    }

def save_processed_data(data):
    """Save processed data to a JSON file"""
    logger.info(f"Saving processed data to {OUTPUT_FILE}")
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f)  # Remove indentation for smaller file
        logger.info("Data saved successfully")
        logger.info(f"Saved {len(data['ports'])} ports and {len(data['routes'])} routes to file")
    except Exception as e:
        logger.error(f"Error saving processed data: {e}")
        raise

def main():
    """Main processing function"""
    try:
        # Load GeoJSON data
        geojson_data = load_geojson_data()
        
        # Extract ports and routes
        processed_data = extract_ports_and_routes(geojson_data)
        
        # Save processed data
        save_processed_data(processed_data)
        
        logger.info("Shipping data processing completed successfully")
    except Exception as e:
        logger.error(f"Error processing shipping data: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 
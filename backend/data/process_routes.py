#!/usr/bin/env python
"""
Process the routes.dat file from OpenFlights into a more usable format
for our freight simulation application.

The routes.dat file contains airline routes with the following format:
Airline,Airline ID,Source airport,Source airport ID,Destination airport,Destination airport ID,Codeshare,Stops,Equipment

This script will:
1. Load the routes.dat file
2. Filter out routes with missing data
3. Group routes by source and destination airports
4. Calculate route statistics (frequency, etc.)
5. Save the processed data to a JSON file for use in the application
"""

import os
import csv
import json
import logging
from collections import defaultdict, Counter
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# File paths
BASE_DIR = Path(__file__).resolve().parent
ROUTES_FILE = os.path.join(BASE_DIR, 'routes.dat')
OUTPUT_FILE = os.path.join(BASE_DIR, 'processed_routes.json')

def load_routes_data():
    """Load routes data from the routes.dat file"""
    if not os.path.exists(ROUTES_FILE):
        raise FileNotFoundError(f"Routes data file not found: {ROUTES_FILE}")

    logger.info(f"Loading routes data from {ROUTES_FILE}")
    routes = []
    
    try:
        with open(ROUTES_FILE, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            line_num = 0
            
            for row in reader:
                line_num += 1
                
                if len(row) < 6:
                    logger.warning(f"Skipping incomplete data at line {line_num}: {row}")
                    continue
                
                try:
                    # Parse route data
                    route = {
                        'airline': row[0],
                        'airline_id': row[1] if row[1] != '\\N' else None,
                        'source_airport': row[2],
                        'source_airport_id': row[3] if row[3] != '\\N' else None,
                        'destination_airport': row[4],
                        'destination_airport_id': row[5] if row[5] != '\\N' else None,
                        'codeshare': row[6] if len(row) > 6 else None,
                        'stops': int(row[7]) if len(row) > 7 and row[7] != '\\N' else 0,
                        'equipment': row[8].split() if len(row) > 8 else []
                    }
                    
                    # Skip routes with missing critical data
                    if not route['source_airport'] or not route['destination_airport']:
                        continue
                    
                    # Skip routes with missing or invalid IDs
                    if not route['source_airport_id'] or not route['destination_airport_id']:
                        logger.warning(f"Skipping route with missing ID at line {line_num}")
                        continue
                    
                    # Make sure IDs are strings
                    route['source_airport_id'] = str(route['source_airport_id'])
                    route['destination_airport_id'] = str(route['destination_airport_id'])
                    
                    routes.append(route)
                except Exception as e:
                    logger.warning(f"Error parsing line {line_num}: {e}")
                    continue
    
    except Exception as e:
        logger.error(f"Error reading routes file: {e}")
        raise
    
    logger.info(f"Loaded {len(routes)} routes")
    return routes

def process_routes(routes):
    """Process routes data to create route statistics"""
    logger.info("Processing routes data...")
    
    # Count routes between airport pairs
    route_counts = Counter()
    airline_counts = defaultdict(Counter)
    airport_connections = defaultdict(set)
    
    for route in routes:
        src = route['source_airport']
        src_id = route['source_airport_id']
        dst = route['destination_airport']
        dst_id = route['destination_airport_id']
        airline = route['airline']
        
        # Count route frequency
        route_pair = f"{src}-{dst}"
        route_id_pair = f"{src_id}-{dst_id}"
        route_counts[route_pair] += 1
        
        # Count airlines per route
        airline_counts[route_pair][airline] += 1
        
        # Track airport connections
        airport_connections[src].add(dst)
        # We want to track node IDs too
        airport_connections[src_id].add(dst_id)
    
    # Create processed route data
    processed_routes = []
    
    for route in routes:
        src = route['source_airport']
        src_id = route['source_airport_id']
        dst = route['destination_airport']
        dst_id = route['destination_airport_id']
        route_pair = f"{src}-{dst}"
        
        # Get the frequency from our counter
        count = route_counts[route_pair]
        
        # Get airline data
        airlines = [{'code': airline, 'flights': count} 
                   for airline, count in airline_counts[route_pair].items()]
        
        # Add route with all information
        processed_routes.append({
            'source': src,
            'source_id': src_id,
            'destination': dst,
            'destination_id': dst_id,
            'frequency': count,
            'airlines': airlines,
            'total_airlines': len(airlines),
            'is_bidirectional': f"{dst}-{src}" in route_counts,
            'stops': route['stops'],
            'equipment': route['equipment']
        })
    
    # Calculate airport statistics
    airport_stats = {}
    for airport, connections in airport_connections.items():
        if not airport or airport == '\\N':
            continue
            
        airport_stats[airport] = {
            'code': airport,
            'connections': len(connections),
            'connection_list': sorted(list(connections))
        }
    
    # Don't sort by frequency - we want ALL routes
    # processed_routes.sort(key=lambda x: x['frequency'], reverse=True)
    
    logger.info(f"Processed {len(processed_routes)} routes")
    logger.info(f"Found {len(airport_stats)} airports with connections")
    
    return {
        'routes': processed_routes,
        'airports': airport_stats,
        'stats': {
            'total_routes': len(routes),
            'unique_routes': len(set((r['source'], r['destination']) for r in processed_routes)),
            'total_airports': len(airport_stats)
        }
    }

def save_processed_data(data):
    """Save processed data to a JSON file"""
    logger.info(f"Saving processed data to {OUTPUT_FILE}")
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f)  # Remove indent for smaller file
        logger.info("Data saved successfully")
        logger.info(f"Processed data contains {len(data['routes'])} routes")
        logger.info(f"Processed data contains {len(data['airports'])} airports")
    except Exception as e:
        logger.error(f"Error saving processed data: {e}")
        raise

def main():
    """Main processing function"""
    try:
        # Load raw routes data
        routes = load_routes_data()
        
        # Process routes data
        processed_data = process_routes(routes)
        
        # Save processed data
        save_processed_data(processed_data)
        
        logger.info("Routes processing completed successfully")
    except Exception as e:
        logger.error(f"Error processing routes data: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 
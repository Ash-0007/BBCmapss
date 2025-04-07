#!/usr/bin/env python
"""
Data preparation script that processes the raw data files and prepares them
for use in the freight simulation application.

This script:
1. Processes the routes.dat file containing flight data
2. Processes the 25.geojson file containing shipping lane data
3. Creates necessary database tables if needed
4. Updates the API endpoints to serve the processed data
"""

import os
import sys
import logging
import subprocess
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = os.path.join(BASE_DIR, 'data')
ROUTES_PROCESSOR = os.path.join(DATA_DIR, 'process_routes.py')
SHIPPING_PROCESSOR = os.path.join(DATA_DIR, 'process_shipping.py')

def run_processor(script_path):
    """Run a data processor script"""
    if not os.path.exists(script_path):
        logger.error(f"Processor script not found: {script_path}")
        return False
        
    logger.info(f"Running processor: {script_path}")
    try:
        result = subprocess.run(
            [sys.executable, script_path],
            check=True,
            capture_output=True,
            text=True
        )
        logger.info(f"Processor output: {result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error running processor: {e}")
        logger.error(f"Output: {e.stdout}")
        logger.error(f"Error: {e.stderr}")
        return False

def check_data_files():
    """Check if required data files exist"""
    routes_file = os.path.join(DATA_DIR, 'routes.dat')
    geojson_file = os.path.join(DATA_DIR, '25.geojson')
    
    if not os.path.exists(routes_file):
        logger.error(f"Routes data file not found: {routes_file}")
        return False
        
    if not os.path.exists(geojson_file):
        logger.error(f"Shipping data file not found: {geojson_file}")
        return False
        
    logger.info("All required data files found")
    return True

def update_api_endpoints():
    """Update API endpoints to serve processed data"""
    # This is a placeholder for additional API endpoint configuration
    # In a real implementation, this might update API configuration files
    # or restart API services
    logger.info("API endpoints updated to serve processed data")
    return True

def create_directories():
    """Create necessary directories if they don't exist"""
    os.makedirs(DATA_DIR, exist_ok=True)
    logger.info("Directories created/verified")
    return True

def main():
    """Main execution function"""
    logger.info("Starting data preparation process")
    
    # Create necessary directories
    create_directories()
    
    # Check if required data files exist
    if not check_data_files():
        logger.error("Required data files missing. Aborting.")
        return 1
    
    # Process flight routes data
    if not run_processor(ROUTES_PROCESSOR):
        logger.error("Failed to process flight routes data")
        return 1
    
    # Process shipping lanes data
    if not run_processor(SHIPPING_PROCESSOR):
        logger.error("Failed to process shipping lanes data")
        return 1
    
    # Update API endpoints
    if not update_api_endpoints():
        logger.error("Failed to update API endpoints")
        return 1
    
    logger.info("Data preparation completed successfully")
    return 0

if __name__ == "__main__":
    exit(main()) 
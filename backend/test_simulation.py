"""
Test script for processing route data files.
This script will process routes.dat and 25.geojson files without initializing the full simulation.
"""
import os
import sys
import json
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add the parent directory to the path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

def test_process_data():
    """Process routes.dat and shipping data files"""
    try:
        # Import processing modules
        from data.process_routes import main as process_routes
        from data.process_shipping import main as process_shipping
        
        # Get the path to the data files
        data_dir = os.path.join(os.path.dirname(__file__), 'data')
        routes_dat_path = os.path.join(data_dir, 'routes.dat')
        shipping_lanes_path = os.path.join(data_dir, '25.geojson')
        
        # Check if data files exist
        if not os.path.exists(routes_dat_path):
            logger.error(f"Routes data file not found: {routes_dat_path}")
            return False
            
        if not os.path.exists(shipping_lanes_path):
            logger.error(f"Shipping lanes file not found: {shipping_lanes_path}")
            return False
            
        logger.info(f"Found routes.dat: {routes_dat_path}")
        logger.info(f"Found 25.geojson: {shipping_lanes_path}")
        
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
        
        # Check if processed files were created
        processed_routes_path = os.path.join(data_dir, 'processed_routes.json')
        processed_shipping_path = os.path.join(data_dir, 'processed_shipping.json')
        
        if os.path.exists(processed_routes_path):
            # Count the number of routes
            with open(processed_routes_path, 'r') as f:
                routes_data = json.load(f)
                logger.info(f"Processed routes.json contains {len(routes_data)} routes")
        else:
            logger.error("Failed to create processed_routes.json")
            
        if os.path.exists(processed_shipping_path):
            # Count the number of shipping lanes
            with open(processed_shipping_path, 'r') as f:
                shipping_data = json.load(f)
                logger.info(f"Processed shipping.json contains {len(shipping_data.get('ports', []))} ports and {len(shipping_data.get('routes', []))} shipping routes")
        else:
            logger.error("Failed to create processed_shipping.json")
        
        logger.info("Data processing completed")
        return True
    except ImportError as e:
        logger.error(f"Could not import processing modules: {str(e)}")
        logger.error(f"Make sure all required modules are installed")
        return False
    except Exception as e:
        logger.error(f"Error processing data files: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    logger.info("Starting test script")
    success = test_process_data()
    if success:
        logger.info("Test completed successfully")
    else:
        logger.error("Test failed") 
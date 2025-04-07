"""
Configuration settings for the freight simulation application.
"""
import os
from pathlib import Path

# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent

# Data directory paths
DATA_DIR = os.path.join(BASE_DIR.parent, 'data')
ROUTES_DAT_PATH = os.path.join(DATA_DIR, 'routes.dat')
SHIPPING_LANES_PATH = os.path.join(DATA_DIR, '25.geojson')

# Processed data paths
PROCESSED_ROUTES_PATH = os.path.join(DATA_DIR, 'processed_routes.json')
PROCESSED_SHIPPING_PATH = os.path.join(DATA_DIR, 'processed_shipping.json')

# Route processing settings
FORCE_REPROCESS = False  # Set to True to force reprocessing of data files
MAX_RETRIES = 3  # Number of retries for API requests
RETRY_DELAY = 2  # Delay between retries in seconds

# Server settings
HOST = '0.0.0.0'
PORT = 5000
DEBUG = True

# API endpoints
AIRPORTS_API_URL = 'http://localhost:3000/api/all-ports?type=airport'
SEAPORTS_API_URL = 'http://localhost:3000/api/all-ports?type=seaport'
ALL_PORTS_API_URL = 'http://localhost:3000/api/all-ports'

# Weather grid settings
WEATHER_GRID_SIZE = 5  # 5 degree grid size

# Port delay settings
MAX_PORT_DELAY = 24  # Maximum port delay in hours

# RL Model settings
SAC_SETTINGS = {
    'learning_rate': 0.0003,
    'gamma': 0.99,  # Discount factor
    'tau': 0.005,  # Target network update parameter
    'batch_size': 256,
    'replay_buffer_size': 1000000,
    'hidden_size': 256,
    'num_layers': 2,
    'alpha': 0.2,  # Temperature parameter for exploration
    'target_update_interval': 1
}

# Route optimization weights (default values)
DEFAULT_WEIGHTS = {
    'duration': 0.4,
    'emissions': 0.3,
    'cost': 0.3
}

# Simulation settings
SIMULATION_STEPS = 100
UPDATE_INTERVAL = 5  # Update simulation every N steps

# API settings
CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000']

# Redis cache settings (optional)
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
REDIS_PASSWORD = None
REDIS_DB = 0
USE_REDIS = False

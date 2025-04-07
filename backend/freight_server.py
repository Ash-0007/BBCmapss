#!/usr/bin/env python3
"""
Main server script for the freight simulation API.
This script loads and runs the Flask application.
"""
import os
import sys

# Add the parent directory to the path to allow importing from parent modules
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Import the Flask app creator
from freight_simulation.app import create_app, run

if __name__ == "__main__":
    # Create and run the app
    run() 
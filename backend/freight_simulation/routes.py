"""
Entry point for running the freight simulation server.
"""
import argparse
import logging
from .app import create_app, run_app
from .config import HOST, PORT, DEBUG


def parse_arguments():
    parser = argparse.ArgumentParser(description='Freight Simulation Server')
    parser.add_argument('--host', type=str, default=HOST,
                        help='Host address to listen on')
    parser.add_argument('--port', type=int, default=PORT,
                        help='Port to listen on')
    parser.add_argument('--debug', action='store_true', default=DEBUG,
                        help='Run in debug mode')
    
    return parser.parse_args()


def main():
    """Main entry point for the application"""
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger(__name__)
    
    # Parse command-line arguments
    args = parse_arguments()
    
    # Log startup information
    logger.info(f"Starting Freight Simulation Server on {args.host}:{args.port}")
    logger.info(f"Debug mode: {'ON' if args.debug else 'OFF'}")
    
    # Create and run app
    app = create_app()
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()

"""
Script to generate shipping routes using the Sea Route library.
This will be called before the simulation is initialized.
"""
import os
import subprocess
import csv
import json
import requests
import time
import sys

def generate_sea_routes(output_path, ports_api_url='http://localhost:3000/api/all-ports'):
    """Generate shipping routes using Sea Route library"""
    print("Generating shipping routes using Sea Route library")
    
    # Check if we have Java installed
    try:
        java_version = subprocess.check_output(['java', '--version'], stderr=subprocess.STDOUT)
        print(f"Java detected: {java_version.decode('utf-8').strip().split()[0]}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: Java not found. Please install Java 1.9 or higher.")
        return False
    
    # Path to the searoute jar file
    searoute_jar = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'searoute.jar')
    
    # Check if the jar file exists
    if not os.path.exists(searoute_jar):
        print(f"Error: Sea Route jar file not found at {searoute_jar}")
        print("Please download it from https://github.com/eurostat/searoute/releases")
        return False
    
    # Create input CSV with port coordinates
    input_csv = os.path.join(os.path.dirname(output_path), 'port_pairs.csv')
    
    # Try to fetch ports from API
    ports = []
    try:
        print(f"Fetching ports from API: {ports_api_url}")
        response = requests.get(ports_api_url, timeout=30)
        if response.status_code == 200:
            all_ports = response.json()
            # Filter to seaports
            seaports = [port for port in all_ports if port.get('type') == 'seaport']
            
            # Extract coordinates
            for port in seaports:
                lat = None
                lon = None
                
                # Get coordinates, checking multiple possible field names
                if 'latitude_dd' in port:
                    lat = port['latitude_dd']
                elif 'latitude' in port:
                    lat = port['latitude']
                elif 'lat' in port:
                    lat = port['lat']
                    
                if 'longitude_dd' in port:
                    lon = port['longitude_dd']
                elif 'longitude' in port:
                    lon = port['longitude']
                elif 'lon' in port:
                    lon = port['lon']
                
                # Get name
                name = port.get('name', f"Port_{port.get('id', 'unknown')}")
                
                if lat is not None and lon is not None:
                    ports.append({
                        'name': name,
                        'lat': float(lat),
                        'lon': float(lon)
                    })
            
            print(f"Found {len(ports)} seaports with valid coordinates")
            
            # If we have fewer than 2 ports, we can't generate routes
            if len(ports) < 2:
                print("Error: Not enough ports to generate routes")
                return False
                
            # Select a reasonable number of major ports
            # Sort by alphabet for now (ideally would use port size or importance)
            ports.sort(key=lambda p: p['name'])
            
            # Take the top ports or all if fewer
            major_ports = ports[:min(100, len(ports))]
            print(f"Using {len(major_ports)} major ports for route generation")
            
            # Generate pairs for the major ports
            pairs = []
            for i in range(len(major_ports)):
                for j in range(i+1, len(major_ports)):
                    port_a = major_ports[i]
                    port_b = major_ports[j]
                    pairs.append({
                        'from_name': port_a['name'],
                        'from_lat': port_a['lat'],
                        'from_lon': port_a['lon'],
                        'to_name': port_b['name'],
                        'to_lat': port_b['lat'],
                        'to_lon': port_b['lon']
                    })
            
            print(f"Generated {len(pairs)} port pairs")
            
            # Write pairs to CSV
            with open(input_csv, 'w', newline='') as f:
                writer = csv.writer(f)
                # Write header
                writer.writerow(['fromLat', 'fromLon', 'fromName', 'toLat', 'toLon', 'toName'])
                
                # Write data
                for pair in pairs:
                    writer.writerow([
                        pair['from_lat'], pair['from_lon'], pair['from_name'],
                        pair['to_lat'], pair['to_lon'], pair['to_name']
                    ])
            
            print(f"Wrote {len(pairs)} port pairs to {input_csv}")
        else:
            print(f"API returned status code {response.status_code}")
            return False
    except Exception as e:
        print(f"Error fetching ports: {str(e)}")
        return False
    
    # Run searoute.jar
    try:
        print(f"Running Sea Route: java -jar {searoute_jar} -i {input_csv} -o {output_path}")
        process = subprocess.run(
            ['java', '-jar', searoute_jar, '-i', input_csv, '-o', output_path],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        print(f"Sea Route output: {process.stdout.decode('utf-8')}")
        if process.stderr:
            print(f"Sea Route errors: {process.stderr.decode('utf-8')}")
        
        # Check if output file was created
        if os.path.exists(output_path):
            print(f"Successfully generated shipping routes to {output_path}")
            return True
        else:
            print(f"Error: Output file not created at {output_path}")
            return False
    except subprocess.CalledProcessError as e:
        print(f"Error running Sea Route: {e}")
        print(f"Output: {e.stdout.decode('utf-8')}")
        print(f"Error: {e.stderr.decode('utf-8')}")
        return False

if __name__ == "__main__":
    # Get command line arguments
    if len(sys.argv) > 1:
        output_path = sys.argv[1]
    else:
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'searoute_output.geojson')
    
    # Generate shipping routes
    success = generate_sea_routes(output_path)
    if success:
        print("Done")
    else:
        print("Failed to generate shipping routes")
        sys.exit(1) 
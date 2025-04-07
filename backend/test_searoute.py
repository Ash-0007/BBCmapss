import os
import subprocess
import csv
import json

def test_searoute():
    """Test the searoute.jar functionality directly"""
    print("Testing searoute.jar functionality")
    
    # Example coordinates for testing (Cochin, India to Amsterdam, Netherlands)
    from_lat = 9.9312
    from_lon = 76.2673
    to_lat = 52.3676
    to_lon = 4.9041
    
    # Create input CSV file in the current directory
    input_csv = "test_input.csv"
    output_geojson = "test_output.geojson"
    
    # Write CSV with header and one row using the correct column names
    with open(input_csv, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['olon', 'olat', 'dlon', 'dlat'])
        writer.writerow([from_lon, from_lat, to_lon, to_lat])
    
    print(f"Created input CSV file {input_csv} with test coordinates")
    
    # Change to the data directory where the JAR file is located
    os.chdir('data')
    
    # Verify file existence
    if not os.path.exists("searoute.jar"):
        print("ERROR: searoute.jar not found in the current directory")
        return
    
    if not os.path.exists("marnet"):
        print("ERROR: marnet directory not found in the current directory")
        return
    
    # Execute searoute.jar to generate route
    # Specify resolution (20km appears to be the default according to help output)
    cmd = ['java', '-jar', 'searoute.jar', '-i', f'../{input_csv}', '-o', f'../{output_geojson}', '-res', '20']
    print(f"Executing command: {' '.join(cmd)}")
    
    try:
        # Run the command and capture output
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )
        
        print(f"Command exit code: {result.returncode}")
        
        if result.stdout:
            print(f"Command stdout: {result.stdout}")
            
        if result.stderr:
            print(f"Command stderr: {result.stderr}")
        
        # Change back to original directory
        os.chdir('..')
        
        # Check if output file was created
        if os.path.exists(output_geojson):
            print(f"Output file was created successfully!")
            
            # Read and print basic info from the GeoJSON output
            with open(output_geojson, 'r') as f:
                route_data = json.load(f)
                
            if route_data.get('features') and len(route_data['features']) > 0:
                route_feature = route_data['features'][0]
                distance_km = route_feature['properties'].get('distKM', 0)
                print(f"Route distance: {distance_km} km")
                
                # Print additional properties
                for prop, value in route_feature['properties'].items():
                    print(f"Property: {prop} = {value}")
        else:
            print(f"ERROR: Output file {output_geojson} was not created!")
    
    except Exception as e:
        print(f"Exception during execution: {str(e)}")
        os.chdir('..')  # Make sure we return to the original directory

if __name__ == "__main__":
    test_searoute() 
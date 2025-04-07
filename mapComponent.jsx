import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../assets/MapComponent.css';

import marker from 'leaflet/dist/images/marker-icon.png';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';


function decodePolyline(encoded, multiplier = 1e5) {
    const points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
        let shift = 0, result = 0;
        let byte;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;

        shift = 0;
        result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;

        points.push([lat / multiplier, lng / multiplier]);
    }
    return points;
}


const clickedIcon = new L.Icon({
    iconUrl: marker,
    iconRetinaUrl: marker2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

const airportIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

const seaportIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});


function MapResizer() {
    const map = useMap();
    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 100);
        return () => clearTimeout(timer);
    }, [map]);
    return null;
}


function MapEvents({ setPosition, setNearest, setRoutes, setIsLoading }) {
    const map = useMap();
    useMapEvents({
        click: async (e) => {
            setIsLoading(true);
            setPosition(e.latlng);
            const nearest = await fetchNearest(e.latlng.lat, e.latlng.lng);
            setNearest(nearest);
            const routes = await fetchRoutes(e.latlng, nearest);
            setRoutes(routes);
            map.flyTo(e.latlng, 12);
            setIsLoading(false);
        },
    });
    return null;
}


async function fetchNearest(lat, lng) {
    try {
        const response = await fetch(`http://localhost:5000/api/nearest?lat=${lat}&lng=${lng}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("got some trains",data.trainports )
        return {
            airports: data.airports || [],
            seaports: data.seaports || [],
            trainports: data.trainports || []
        };
    } catch (error) {
        console.error("Error fetching nearest locations:", error);
        return { airports: [], seaports: [],trainports:[] };
    }
}


async function fetchRoutes(position, nearest) {
    const apiKey = "93c936a0-a4c7-47bc-a37a-0e6a3712c647";
    const routes = [];
    for (const location of [...nearest.airports, ...nearest.seaports]) {
        try {
            const url = `https://graphhopper.com/api/1/route?point=${position.lat},${position.lng}&point=${location.latitude_dd},${location.longitude_dd}&profile=car&locale=en&calc_points=true&key=${apiKey}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (!data.paths || !data.paths[0]) {
                console.error('No paths found in route data for', location.name || location.code, data);
                continue;
            }

            const path = data.paths[0];

            let coordinates;
            if (path.points_encoded) {
                coordinates = decodePolyline(path.points, path.points_encoded_multiplier || 1e5);
            } else if (path.points && path.points.coordinates && Array.isArray(path.points.coordinates)) {
                coordinates = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
            } else {
                console.error('Invalid or missing coordinates in route data for', location.name || location.code, {
                    path,
                    isEncoded: path.points_encoded,
                    hasPoints: !!path.points
                });
                continue;
            }

            if (coordinates.length === 0) {
                console.error('Empty coordinates array in route data for', location.name || location.code, data);
                continue;
            }

            const route = {
                points: coordinates,
                distance: (path.distance || 0) / 1000,
                time: (path.time || 0) / 60000,
                type: location.type,
                name: location.name || location.code || 'Unknown',
                lat: location.latitude_dd,
                lng: location.longitude_dd
            };
            routes.push(route);
            console.log(`Route calculated for ${route.name}:`, {
                distance: route.distance,
                time: route.time,
                coordinatesLength: route.points.length
            });
        } catch (error) {
            console.error("Error fetching route for location", location.name || location.code, error);
        }
    }
    return routes;
}


class ErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Error caught in ErrorBoundary:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <h1>Something went wrong with the map. Please try again later.</h1>;
        }
        return this.props.children;
    }
}


function MapComponent() {
    const [position, setPosition] = useState(null);
    const [nearest, setNearest] = useState({ airports: [], seaports: [] });
    const [routes, setRoutes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const calculateEfficiency = (type) => {
        const items = type === 'airport' ? nearest.airports : nearest.seaports;
        return items.map(item => {
            const route = routes.find(route =>
                route.name === (item.name || item.code) ||
                (route.lat === item.latitude_dd && route.lng === item.longitude_dd)
            );
            if (!route) {
                console.log(`No route found for ${type}: ${item.name || item.code}`);
            }
            return {
                ...item,
                efficiency: route && route.time && route.distance ?
                    (route.time / route.distance).toFixed(4) : 'N/A',
                distance: route?.distance || 0,
                time: route?.time || 0
            };
        });
    };

    const airportEfficiencies = calculateEfficiency('airport');
    const seaportEfficiencies = calculateEfficiency('seaport');

    return (
        <ErrorBoundary>
            <div className="map-container">
                {isLoading && <div className="loading">Loading...</div>}
                <MapContainer center={[0, 0]} zoom={2} style={{ height: '500px', width: '100%' }}>
                    <MapResizer />
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {position && (
                        <Marker position={position} icon={clickedIcon}>
                            <Popup>
                                Selected Location: Lat {position.lat.toFixed(4)}, Lng {position.lng.toFixed(4)}
                            </Popup>
                        </Marker>
                    )}
                    <MapEvents
                        setPosition={setPosition}
                        setNearest={setNearest}
                        setRoutes={setRoutes}
                        setIsLoading={setIsLoading}
                    />

                    {nearest.airports.map(airport => (
                        <Marker
                            key={airport.code || airport.name || Math.random()}
                            position={[airport.latitude_dd, airport.longitude_dd]}
                            icon={airportIcon}
                        >
                            <Popup>
                                Airport: {airport.code || airport.name || 'Unknown'}<br />
                                Distance: {(airport.distance || 0).toFixed(2)} km<br />
                                Time: {(airport.time || 0).toFixed(2)} min
                            </Popup>
                        </Marker>
                    ))}

                    {nearest.seaports.map(seaport => (
                        <Marker
                            key={seaport.code || seaport.name || Math.random()}
                            position={[seaport.latitude_dd, seaport.longitude_dd]}
                            icon={seaportIcon}
                        >
                            <Popup>
                                Seaport: {seaport.name || seaport.code || 'Unknown'}<br />
                                Distance: {(seaport.distance || 0).toFixed(2)} km<br />
                                Time: {(seaport.time || 0).toFixed(2)} min
                            </Popup>
                        </Marker>
                    ))}

                    {routes.map((route, index) => (
                        <Polyline
                            key={index}
                            positions={route.points}
                            color={route.type === 'airport' ? 'blue' : 'green'}
                        >
                            <Popup>
                                {route.name} - {(route.distance || 0).toFixed(2)} km, {(route.time || 0).toFixed(2)} min
                            </Popup>
                        </Polyline>
                    ))}
                </MapContainer>

                <div className="sidebar">
                    <h3>Efficiencies</h3>
                    <div className="section">
                        <h4>Airport Efficiencies</h4>
                        <ul>
                            {airportEfficiencies.map(airport => (
                                <li key={airport.code || airport.name || Math.random()}>
                                    {airport.code || airport.name || 'Unknown'} - <br />
                                    Distance: {airport.distance.toFixed(2)} km<br />
                                    Time: {airport.time.toFixed(2)} min<br />
                                    Efficiency: {airport.efficiency} (Time/Km)
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="section">
                        <h4>Seaport Efficiencies</h4>
                        <ul>
                            {seaportEfficiencies.map(seaport => (
                                <li key={seaport.code || seaport.name || Math.random()}>
                                    {seaport.name || seaport.code || 'Unknown'} - <br />
                                    Distance: {seaport.distance.toFixed(2)} km<br />
                                    Time: {seaport.time.toFixed(2)} min<br />
                                    Efficiency: {seaport.efficiency} (Time/Km)
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default MapComponent;
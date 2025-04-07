import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import styles from '../../assets/MapComponent.module.scss';
import ErrorBoundary from '../../components/errorBoundary.jsx';
import MapResizer from './MapResizer';
import MapEvents from './MapEvents';
import MapMarkers from './MapMarkers';
import MapPolylines from './MapPolylines';
import MapSidebar from './MapSidebar';
import { fetchNearest, fetchRoute } from '@/services/api';
import { decodePolyline } from '@/utils/polyline';

const MapComponent = () => {
    const [positions, setPositions] = useState([]);
    const [nearest, setNearest] = useState([{ airports: [], seaports: [] }, { airports: [], seaports: [] }]);
    const [routes, setRoutes] = useState([[], []]);
    const [isLoading, setIsLoading] = useState(false);

    const processRouteData = (data, location) => {
        if (!data.paths?.[0]) return null;
        const path = data.paths[0];

        return {
            points: path.points_encoded
                ? decodePolyline(path.points, path.points_encoded_multiplier || 1e5)
                : path.points.coordinates.map(([lng, lat]) => [lat, lng]),
            distance: path.distance / 1000,
            time: path.time / 60000,
            type: location.type,
            name: location.name || location.code,
            lat: location.latitude_dd,
            lng: location.longitude_dd
        };
    };

    const calculateForPositions = async (pos1, pos2) => {
        setIsLoading(true);
        try {
            const nearestData1 = await fetchNearest(pos1[0], pos1[1]);
            const nearestData2 = await fetchNearest(pos2[0], pos2[1]);

            const validLocations1 = [
                ...(nearestData1.airports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData1.seaports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData1.trainports || []).filter(l => l.latitude_dd && l.longitude_dd),
            ];
            const validLocations2 = [
                ...(nearestData2.airports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData2.seaports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData2.trainports || []).filter(l => l.latitude_dd && l.longitude_dd)
            ];

            const routes1 = await Promise.all(
                validLocations1.map(async (location) => {
                    try {
                        const data = await fetchRoute({ lat: pos1[0], lng: pos1[1] }, location);
                        return processRouteData(data, location);
                    } catch (error) {
                        console.error('Route error for position 1:', error);
                        return null;
                    }
                })
            );

            const routes2 = await Promise.all(
                validLocations2.map(async (location) => {
                    try {
                        const data = await fetchRoute({ lat: pos2[0], lng: pos2[1] }, location);
                        return processRouteData(data, location);
                    } catch (error) {
                        console.error('Route error for position 2:', error);
                        return null;
                    }
                })
            );

            setNearest([
                { airports: nearestData1.airports || [], seaports: nearestData1.seaports || [],trainports: nearestData1.trainports||[] },
                { airports: nearestData2.airports || [], seaports: nearestData2.seaports || [],trainports: nearestData2.trainports||[] }
            ]);
            setRoutes([routes1.filter(Boolean), routes2.filter(Boolean)]);
        } catch (error) {
            console.error("Map calculation error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLocationSelect = (location, index) => {
        const newPositions = [...positions];
        newPositions[index] = location;
        setPositions(newPositions);


        if (newPositions.length === 2 && newPositions[0] && newPositions[1]) {
            calculateForPositions(newPositions[0], newPositions[1]);
        }
    };

    return (
        <ErrorBoundary>
            <div className={styles.mapDashboard}>
                <MapContainer center={[0, 0]} zoom={2} className={styles.mapContainer}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapResizer />
                    <MapEvents {...{ setPositions, setNearest, setRoutes, setIsLoading, positions }} />
                    <MapMarkers position={positions} nearest={nearest} />
                    <MapPolylines routes={routes} />
                </MapContainer>
                <MapSidebar {...{ isLoading, nearest, routes, onLocationSelect: handleLocationSelect }} />
            </div>
        </ErrorBoundary>
    );
};

export default MapComponent;
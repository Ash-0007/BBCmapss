import { useState } from 'react';
import { fetchNearest } from '@/services/api';
import { decodePolyline } from '@/utils/polyline';

export const useRouteCalculation = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [routes, setRoutes] = useState([]);
    const [position, setPosition] = useState(null);
    const [nearest, setNearest] = useState({ airports: [], seaports: [] });

    const calculateRoutes = async (latlng) => {
        setIsLoading(true);
        try {
            const nearestData = await fetchNearest(latlng.lat, latlng.lng);
            setNearest(nearestData);

            const newRoutes = await Promise.all(
                [...nearestData.airports, ...nearestData.seaports].map(async (location) => {
                    const data = await fetchRoute(latlng, location);
                    return processRouteData(data, location);
                })
            );

            setRoutes(newRoutes.filter(route => route !== null));
            setPosition(latlng);
        } catch (error) {
            console.error('Route calculation error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const processRouteData = (data, location) => {
        if (!data.paths?.[0]) return null;
        const path = data.paths[0];

        let coordinates = [];
        if (path.points_encoded) {
            coordinates = decodePolyline(path.points, path.points_encoded_multiplier);
        } else if (path.points?.coordinates) {
            coordinates = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
        }

        return {
            points: coordinates,
            distance: path.distance / 1000,
            time: path.time / 60000,
            type: location.type,
            name: location.name || location.code,
            ...location
        };
    };

    return { isLoading, routes, position, nearest, calculateRoutes };
};
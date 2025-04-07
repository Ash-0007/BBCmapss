import { useMapEvents, useMap } from 'react-leaflet';
import { fetchNearest, fetchRoute } from '@/services/api';
import { decodePolyline } from '@/utils/polyline';

const MapEvents = ({ setPositions, setNearest, setRoutes, setIsLoading, positions }) => {
    const map = useMap();

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
            const nearestData1 = await fetchNearest(pos1.lat, pos1.lng);
            const nearestData2 = await fetchNearest(pos2.lat, pos2.lng);

            const validLocations1 = [
                ...(nearestData1.airports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData1.seaports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData1.trainports ||[]).filter(l=> l.latitude_dd && l.longitude_dd)
            ];
            const validLocations2 = [
                ...(nearestData2.airports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData2.seaports || []).filter(l => l.latitude_dd && l.longitude_dd),
                ...(nearestData2.trainports || []).filter(l => l.latitude_dd && l.longitude_dd)
            ];

            const routes1 = await Promise.all(
                validLocations1.map(async (location) => {
                    try {
                        const data = await fetchRoute(pos1, location);
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
                        const data = await fetchRoute(pos2, location);
                        return processRouteData(data, location);
                    } catch (error) {
                        console.error('Route error for position 2:', error);
                        return null;
                    }
                })
            );

            // Log trainports data for debugging
            console.log("trainports in nearestData1:", nearestData1.trainports);
            console.log("trainports in nearestData2:", nearestData2.trainports);

            setNearest([
                { 
                    airports: nearestData1.airports || [], 
                    seaports: nearestData1.seaports || [],
                    trainports: nearestData1.trainports || []
                },
                { 
                    airports: nearestData2.airports || [], 
                    seaports: nearestData2.seaports || [],
                    trainports: nearestData2.trainports || [] 
                }
            ]);
            setRoutes([routes1.filter(Boolean), routes2.filter(Boolean)]);

            map.fitBounds([pos1, pos2]);
        } catch (error) {
            console.error("Map calculation error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useMapEvents({
        click: (e) => {
            const newPositions = [...positions, e.latlng];
            setPositions(newPositions);

            if (newPositions.length === 2) {
                calculateForPositions(newPositions[0], newPositions[1]);
            }
        },
    });

    return null;
};

export default MapEvents;
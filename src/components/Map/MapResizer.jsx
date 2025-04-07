import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const MapResizer = () => {
    const map = useMap();

    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 100);

        return () => clearTimeout(timer);
    }, [map]);

    return null;
};

export default MapResizer;
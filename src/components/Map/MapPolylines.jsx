import { Polyline, Popup } from 'react-leaflet';

export default function MapPolylines({ routes }) {
    return (
        <>
            {routes[0].map((route, index) => (
                <Polyline
                    key={`route-0-${index}`}
                    positions={route.points}
                    color={route.type === 'airport' ? '#3B82F6' : '#10B981'}
                    weight={3}
                    opacity={0.8}
                >
                    <Popup>
                        <div className="route-popup">
                            <h4>{route.name} Route (Pos 1)</h4>
                            <p>Distance: {route.distance.toFixed(1)} km</p>
                            <p>Duration: {route.time.toFixed(1)} mins</p>
                        </div>
                    </Popup>
                </Polyline>
            ))}
            {routes[1].map((route, index) => (
                <Polyline
                    key={`route-1-${index}`}
                    positions={route.points}
                    color={route.type === 'airport' ? '#3B82F6' : '#10B981'}
                    weight={3}
                    opacity={0.8}
                >
                    <Popup>
                        <div className="route-popup">
                            <h4>{route.name} Route (Pos 2)</h4>
                            <p>Distance: {route.distance.toFixed(1)} km</p>
                            <p>Duration: {route.time.toFixed(1)} mins</p>
                        </div>
                    </Popup>
                </Polyline>
            ))}
        </>
    );
}
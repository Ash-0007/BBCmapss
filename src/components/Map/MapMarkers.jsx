import { Marker, Popup } from 'react-leaflet';
import { clickedIcon, airportIcon, seaportIcon, trainportIcon } from '@/utils/icons';

export default function MapMarkers({ position: positions, nearest = [{ airports: [], seaports: [], trainports:[] }, { airports: [], seaports: [],trainports:[] }] }) {
    console.log("MapMarkers - trainports data:", nearest[0].trainports, nearest[1].trainports);
    
    return (
        <>
            {positions && positions.map((pos, index) => {

                const lat = Array.isArray(pos) ? pos[0] : pos.lat;
                const lng = Array.isArray(pos) ? pos[1] : pos.lng;
                
                if (lat === undefined || lng === undefined) return null;

                return (
                    <Marker key={index} position={[lat, lng]} icon={clickedIcon}>
                        <Popup>
                            <div className="marker-popup">
                                <h4>Selected Location {index + 1}</h4>
                                <p>Lat: {lat.toFixed(4)}</p>
                                <p>Lng: {lng.toFixed(4)}</p>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}

            {nearest[0].airports.map(airport => (
                <Marker
                    key={`airport-0-${airport.code}`}
                    position={[airport.latitude_dd, airport.longitude_dd]}
                    icon={airportIcon}
                >
                    <Popup>
                        <div className="airport-popup">
                            <h4>✈️ {airport.code} (Loc 1)</h4>
                            <p>{airport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
            {nearest[1].airports.map(airport => (
                <Marker
                    key={`airport-1-${airport.code}`}
                    position={[airport.latitude_dd, airport.longitude_dd]}
                    icon={airportIcon}
                >
                    <Popup>
                        <div className="airport-popup">
                            <h4>✈️ {airport.code} (Loc 2)</h4>
                            <p>{airport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}

            {nearest[0].seaports.map(seaport => (
                <Marker
                    key={`seaport-0-${seaport.code}`}
                    position={[seaport.latitude_dd, seaport.longitude_dd]}
                    icon={seaportIcon}
                >
                    <Popup>
                        <div className="seaport-popup">
                            <h4>⚓ {seaport.code} (Loc 1)</h4>
                            <p>{seaport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
            {nearest[1].seaports.map(seaport => (
                <Marker
                    key={`seaport-1-${seaport.code}`}
                    position={[seaport.latitude_dd, seaport.longitude_dd]}
                    icon={seaportIcon}
                >
                    <Popup>
                        <div className="seaport-popup">
                            <h4>⚓ {seaport.code} (Loc 2)</h4>
                            <p>{seaport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}


            {nearest[0].trainports && nearest[0].trainports.map(trainport => (
                <Marker
                    key={`trainport-0-${trainport.code || trainport.name}`}
                    position={[trainport.latitude_dd, trainport.longitude_dd]}
                    icon={trainportIcon}
                >
                    <Popup>
                        <div className="trainport-popup">
                            <h4>🚂 {trainport.code || trainport.name} (Loc 1)</h4>
                            <p>{trainport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
            {nearest[1].trainports && nearest[1].trainports.map(trainport => (
                <Marker
                    key={`trainport-1-${trainport.code || trainport.name}`}
                    position={[trainport.latitude_dd, trainport.longitude_dd]}
                    icon={trainportIcon}
                >
                    <Popup>
                        <div className="trainport-popup">
                            <h4>🚂 {trainport.code || trainport.name} (Loc 2)</h4>
                            <p>{trainport.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}
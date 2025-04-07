import React, { useState } from 'react';
import MapComponent from './components/Map/MapComponent.jsx';
import FreightSimulationPage from './components/FreightSimulation/FreightSimulationPage.jsx';
import './App.css';

function App() {
    const [activePage, setActivePage] = useState('map');
    
    return (
        <div className="app-container">
            <nav className="main-nav">
                <div className="nav-logo">Maritime Explorer</div>
                <ul className="nav-links">
                    <li>
                        <button 
                            className={activePage === 'map' ? 'active' : ''} 
                            onClick={() => setActivePage('map')}
                        >
                            Map View
                        </button>
                    </li>
                    <li>
                        <button 
                            className={activePage === 'freight' ? 'active' : ''} 
                            onClick={() => setActivePage('freight')}
                        >
                            Freight Simulation
                        </button>
                    </li>
                </ul>
            </nav>
            
            <main className="main-content">
                {activePage === 'map' ? (
                    <MapComponent />
                ) : (
                    <FreightSimulationPage />
                )}
            </main>
        </div>
    );
}

export default App;
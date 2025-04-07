import React, { useState, useEffect, useRef } from 'react';
import styles from '../../assets/MapComponent.module.scss';

const LocationSearch = ({ onLocationSelect, index }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const searchLocation = async () => {
            if (query.length < 3) {
                setSuggestions([]);
                return;
            }

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
                );
                const data = await response.json();
                setSuggestions(data);
                setIsOpen(true);
            } catch (error) {
                console.error('Error searching location:', error);
            }
        };

        const timeoutId = setTimeout(searchLocation, 300);
        return () => clearTimeout(timeoutId);
    }, [query]);

    const handleSelect = (location) => {
        setQuery(location.display_name);
        setSuggestions([]);
        setIsOpen(false);
        onLocationSelect([parseFloat(location.lat), parseFloat(location.lon)], index);
    };

    return (
        <div className={styles.searchContainer} ref={searchRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search for location ${index + 1}...`}
                className={styles.searchInput}
            />
            {isOpen && suggestions.length > 0 && (
                <ul className={styles.suggestionsList}>
                    {suggestions.map((suggestion) => (
                        <li
                            key={suggestion.place_id}
                            onClick={() => handleSelect(suggestion)}
                            className={styles.suggestionItem}
                        >
                            {suggestion.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default LocationSearch; 
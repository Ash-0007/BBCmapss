import React from 'react';
import styles from '../../assets/MapComponent.module.scss';

const EfficiencyCard = ({ item, type, routes }) => {
    const { name, main_port_name, code, distance, time, efficiency } = item;
    
    const displayName = name || main_port_name || 'Unknown';
    const portCode = code || 'N/A';
    
    return (
        <div className={styles.efficiencyCard}>
            <div className={`${styles.cardHeader} ${styles[type]}`}>
                <div className={styles.locationInfo}>
                    <div className={styles.locationName}>{displayName}</div>
                    <div className={styles.locationCode}>{portCode}</div>
                </div>
                <span className={styles.efficiencyBadge}>
                    {efficiency !== 'N/A' ? `${efficiency} min/km` : 'N/A'}
                </span>
            </div>
            <div className={styles.cardBody}>
                <div className={styles.metric}>
                    <span>Distance</span>
                    <span>{distance ? `${distance.toFixed(1)} km` : 'N/A'}</span>
                </div>
                <div className={styles.metric}>
                    <span>Time</span>
                    <span>{time ? `${time.toFixed(0)} min` : 'N/A'}</span>
                </div>
            </div>
        </div>
    );
};

export default EfficiencyCard;
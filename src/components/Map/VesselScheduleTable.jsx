import React from 'react';
import styles from '../../assets/MapComponent.module.scss';

/**
 * Component to display vessel schedule data in a structured way
 * @param {Object} props
 * @param {string} props.html - The HTML response from the vessel API
 * @param {string} props.title - The title of the vessel schedule
 * @param {Array} props.vesselSchedules - Array of vessel schedules with detailed information
 */
const VesselScheduleTable = ({ html, title, vesselSchedules }) => {

  const renderStandardTable = () => {
    if (!vesselSchedules || vesselSchedules.length === 0) {
      return (
        <div className={styles.noData}>
          No vessel schedules found for the selected date range.
        </div>
      );
    }

    return (
      <div className={styles.vesselTableContainer}>
        <table className={styles.vesselTable}>
          <thead>
            <tr>
              <th>Vessel Name</th>
              <th>Voyage</th>
              <th>Line</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {vesselSchedules.map((vessel, index) => (
              <tr key={`${vessel.vesselName}-${vessel.voyage}-${index}`}>
                <td>{vessel.vesselName}</td>
                <td>{vessel.voyage}</td>
                <td>{vessel.line}</td>
                <td>
                  <table className={styles.scheduleTable}>
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>ETA</th>
                        <th>ETD</th>
                        <th>Pilot Time</th>
                        <th>Berth Time</th>
                        <th>Departure Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vessel.schedule.map((port, portIndex) => (
                        <tr key={`${port.port}-${portIndex}`}>
                          <td>
                            {port.port === 'CURRENT PORT' ? (
                              <strong>{port.port}</strong>
                            ) : (
                              port.port
                            )}
                          </td>
                          <td>{port.eta}</td>
                          <td>{port.etd}</td>
                          <td>{port.pilotTime}</td>
                          <td>{port.berthTime}</td>
                          <td>{port.departureTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  return (
    <div className={styles.vesselScheduleContainer}>
      <h2 className={styles.vesselScheduleTitle}>{title}</h2>
      
      <div className={styles.vesselTableWrapper}>
        {renderStandardTable()}
      </div>
    </div>
  );
};

export default VesselScheduleTable; 
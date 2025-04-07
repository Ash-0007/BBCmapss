import React, { useState } from 'react';
import styles from '../../assets/MapComponent.module.scss';
import { fetchVesselArrivalTime, fetchAllVesselSchedules } from '../../services/vesselService';
import HtmlPopup from '../UI/HtmlPopup';
import VesselScheduleTable from './VesselScheduleTable';

const DateRangeSelector = ({ onDateRangeSelect, nearestPorts = [] }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [popupData, setPopupData] = useState(null);
    const [error, setError] = useState(null);
    const [useStructuredView, setUseStructuredView] = useState(true);


    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    };

    const handleStartDateChange = (e) => {
        const date = e.target.value;
        setStartDate(date);
        setError(null);
        
        if (date && endDate) {
            const formattedStartDate = formatDate(date);
            const formattedEndDate = formatDate(endDate);
            console.log(`Formatted dates: ${formattedStartDate} - ${formattedEndDate}`);
            onDateRangeSelect({ startDate: date, endDate });
            

            fetchVesselDataForAllPorts(formattedStartDate, formattedEndDate);
        }
    };

    const handleEndDateChange = (e) => {
        const date = e.target.value;
        setEndDate(date);
        setError(null);
        
        if (startDate && date) {
            const formattedStartDate = formatDate(startDate);
            const formattedEndDate = formatDate(date);
            console.log(`Formatted dates: ${formattedStartDate} - ${formattedEndDate}`);
            onDateRangeSelect({ startDate, endDate: date });
            

            fetchVesselDataForAllPorts(formattedStartDate, formattedEndDate);
        }
    };

    const fetchVesselDataForAllPorts = async (startDate, endDate) => {
        if (!nearestPorts || nearestPorts.length === 0) {
            setError('No ports available to query vessel data. Please select a location first.');
            return;
        }

        setLoading(true);
        setError(null);
        
        try {

            const seaports = nearestPorts.filter(port => port.type === 'seaport');
            console.log(`Found ${seaports.length} seaports out of ${nearestPorts.length} total ports`);
            
            const selectedPort = seaports.length > 0 ? seaports[0] : nearestPorts[0];
            
            if (!selectedPort) {
                setError('No valid ports found. Please select a different location.');
                setLoading(false);
                return;
            }
            

            let portCode = selectedPort.code || selectedPort.world_port_index;
            

            if (!portCode) {
                if (selectedPort.type === 'seaport') {


                    const portName = selectedPort.name || selectedPort.main_port_name || 'UNKNOWN';
                    const namePrefix = portName.substring(0, 3).toUpperCase();
                    const lat = Math.abs(selectedPort.latitude_dd).toFixed(0);
                    const lng = Math.abs(selectedPort.longitude_dd).toFixed(0);
                    portCode = `SEA${namePrefix}${lat}${lng}`;
                } else {

                    portCode = 'INCOK';
                }
            }
            

            portCode = portCode.replace(/[^a-zA-Z0-9]/g, '');
            

            if (portCode.length < 3) {
                portCode = `SEA${portCode}`;
            }
            
            console.log(`Querying vessel data for seaport: ${portCode} (${selectedPort.name || selectedPort.main_port_name || 'Unknown'})`);
            console.log(`Date range: ${startDate} - ${endDate}`);
            

            const vesselSchedules = await fetchAllVesselSchedules(portCode, startDate, endDate);
            

            const html = generateVesselSchedulesHtml(vesselSchedules);
            

            setPopupData({
                html,
                title: `Vessel Schedule for ${selectedPort.name || selectedPort.main_port_name || portCode} (${startDate} - ${endDate})`,
                vesselSchedules
            });
        } catch (error) {
            console.error('Error fetching vessel data:', error);
            setError('Failed to fetch vessel data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };


    const generateVesselSchedulesHtml = (vesselSchedules) => {
        if (!vesselSchedules || !Array.isArray(vesselSchedules)) {
            return '<div class="error-message">No vessel schedule data available</div>';
        }

        let html = '<table class="vessel-table">';
        html += '<thead><tr><th>Vessel Name</th><th>Voyage</th><th>Line</th><th>Schedule</th></tr></thead>';
        html += '<tbody>';
        
        vesselSchedules.forEach(vessel => {
            html += `<tr>
                <td>${vessel.vesselName || 'N/A'}</td>
                <td>${vessel.voyage || 'N/A'}</td>
                <td>${vessel.line || 'N/A'}</td>
                <td>
                    ${vessel.schedule && Array.isArray(vessel.schedule) ? `
                        <table class="schedule-table">
                            <tr><th>Port</th><th>ETA</th><th>ETD</th></tr>
                            ${vessel.schedule.map(port => `
                                <tr>
                                    <td>${port.port || 'N/A'}</td>
                                    <td>${port.eta || 'N/A'}</td>
                                    <td>${port.etd || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </table>
                    ` : '<div class="no-schedule">No schedule data available</div>'}
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        return html;
    };

    const closePopup = () => {
        setPopupData(null);
    };

    const toggleView = () => {
        setUseStructuredView(!useStructuredView);
    };

    return (
        <div className={styles.dateRangeContainer}>
            <div className={styles.dateInput}>
                <label htmlFor="startDate">Start Date:</label>
                <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={handleStartDateChange}
                    min={new Date().toISOString().split('T')[0]}
                />
            </div>
            <div className={styles.dateInput}>
                <label htmlFor="endDate">End Date:</label>
                <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={handleEndDateChange}
                    min={startDate || new Date().toISOString().split('T')[0]}
                />
            </div>
            
            {loading && <div className={styles.loadingIndicator}>Loading vessel data...</div>}
            
            {error && <div className={styles.errorMessage}>{error}</div>}
            
        </div>
    );
};

export default DateRangeSelector; 
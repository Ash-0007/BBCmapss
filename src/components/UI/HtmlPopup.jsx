import React from 'react';
import styles from '../../assets/MapComponent.module.scss';

const HtmlPopup = ({ html, onClose, title }) => {
  return (
    <div className={styles.popupOverlay}>
      <div className={styles.popupContent}>
        <div className={styles.popupHeader}>
          <h3>{title}</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div 
          className={styles.popupBody}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};

export default HtmlPopup; 
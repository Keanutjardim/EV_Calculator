import React from 'react';
import Iframe from 'react-iframe';

interface EVChargerMapProps {
  height?: string;
}

const EVChargerMap: React.FC<EVChargerMapProps> = ({ height = '400px' }) => {
  return (
    <div className="rounded-lg overflow-hidden" style={{ height, position: 'relative' }}>
      <Iframe
        url="https://gridcars.net/live-map/"
        width="100%"
        height="100%"
        id="gridcars-map"
        className="gridcars-map"
        display="block"
        position="relative"
        styles={{
          border: 'none',
          // Apply custom styles to focus on the map and show accept button at bottom
          margin: '-150px 0 -80px 0',  // Less negative margin at bottom to show accept button
          height: 'calc(100% + 250px)', // Adjusted to account for smaller bottom margin
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          clipPath: 'inset(150px 0 50px 0)' // Reduced bottom clip to show the accept button
        }}
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
};

export default EVChargerMap; 
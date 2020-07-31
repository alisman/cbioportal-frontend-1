import React from 'react';
import { TIMELINE_ROW_HEIGHT } from 'cbioportal-clinical-timeline/src/TimelineRow';

const SampleMarker: React.FunctionComponent<{
    color: string;
    label: string;
    y: number;
}> = function({ color, label, y }) {
    return (
        <g style={{ transform: `translate(0, ${y}px)` }}>
            <circle cx="0" cy="0" r="7" fill={color} />
            <text
                x="0"
                y="0"
                text-anchor="middle"
                fill="white"
                font-size="10px"
                font-family="Arial"
                dy=".3em"
            >
                {label}
            </text>
        </g>
    );
};

export default SampleMarker;

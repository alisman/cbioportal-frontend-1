import React from 'react';
import oncoprintData from './mockData/oncoprintData';
import Plotly from 'react-plotlyjs';
import _ from 'lodash';
import transformData from './transformData';

import cancerData from './mockData/cancerTypes';

export default class Histogram extends React.Component {

    render() {

        if (this.props.status === 'fetching') {
            return null;
        } else {

            const mockData = transformData(oncoprintData, cancerData);

            const alterationList = mockData[0].alterations;
            const cancerTypes = _.map(mockData, (item) => item.typeOfCancer);

            let traces = [];

            Object.keys(alterationList).forEach((key) => {
                if (key !== 'all') {
                    traces.push({
                        x: cancerTypes,
                        y: _.map(mockData, (cancer)=>cancer.alterations[key] / cancer.caseSetLength),
                        name: key,
                        type: 'bar'
                    });
                }
            });

            var layout = {
                barmode: 'stack',
                yaxis: {
                    tickformat: '%'
                },
                margin: {
                    t: 20
                },
                legend: {
                    orientation: 'v'
                },
                width: 500,
                height: 250
            };

            return (
                <div>
                    <h3>KRAS</h3>
                    <Plotly className="whatever" data={traces} layout={layout}/>
                </div>
            );
        }

    }

}











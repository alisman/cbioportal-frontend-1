import * as React from 'react';
import oncoprintData from './mockData/oncoprintData';
import Plotly from 'react-plotlyjs';
import * as _ from 'lodash';
import transformData from './transformData';

import cancerData from './mockData/cancerTypes';

interface IHistogramProps {
    status: string;
    data: any;
}

export default class Histogram extends React.Component<IHistogramProps, {}>  {

    public render() {
//
        if (this.props.status === 'fetching') {
            return <div>fetching</div>;
        } else {

            const mockData: any = transformData(oncoprintData, cancerData);

            const alterationList = mockData[0].alterations;
            const cancerTypes = _.map(mockData, (item: any) => item.typeOfCancer);

            let traces = [];

            Object.keys(alterationList).forEach((key) => {
                if (key !== 'all') {
                    traces.push({
                        x: cancerTypes,
                        y: _.map(mockData, (cancer: any)=>cancer.alterations[key] / cancer.caseSetLength),
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











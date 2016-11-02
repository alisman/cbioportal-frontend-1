import * as React from 'react';

import EnhancedFixedDataTable from 'shared/components/enhancedFixedDataTable/EnhancedFixedDataTable';

import covertSampleData from './lib/convertSamplesData';

type TODO = any;

export interface IClinicalInformationSamplesTableProps {
    data: TODO;
};


export class ClinicalInformationSamplesTable extends React.Component<IClinicalInformationSamplesTableProps, {}> {

    render() {

        const data = covertSampleData(this.props.data);

        const cells: Array<TODO> = [];

        Object.keys(data.items).forEach((key: string) => {
            const item:TODO = data.items[key];

            data.columns.forEach((col: any) => {
                if (col.id in item) {
                    cells.push({ attr_name: key, attr_id: col.id, attr_val: item[col.id] });
                } else {
                    cells.push({ attr_name: key, attr_id: col.id, attr_val: 'N/A' });
                }
            });
        });

        const d = {
            attributes: data.columns.map((col:TODO) => {
                return { attr_id: col.id, datatype: 'STRING', display_name: col.id };
            }),
            data: cells,
        };

        d.attributes.unshift({ attr_id: 'attr_name', datatype: 'STRING', display_name: 'Attribute' });

        return <EnhancedFixedDataTable input={d} groupHeader={false} filter="GLOBAL" rowHeight={33} headerHeight={33} download="ALL" uniqueId="attr_name" tableWidth={1190} autoColumnWidth={true} />;
    }
}

export default ClinicalInformationSamplesTable;


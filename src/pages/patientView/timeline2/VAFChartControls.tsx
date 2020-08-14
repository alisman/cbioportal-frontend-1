import React from 'react';
import { observer } from 'mobx-react';
import { TimelineStore } from 'cbioportal-clinical-timeline';
import ReactSelect from 'react-select';
import SampleManager from '../SampleManager';
import LabeledCheckbox from '../../../shared/components/labeledCheckbox/LabeledCheckbox';
import autobind from 'autobind-decorator';

interface IVAFChartControlsProps {
    store: TimelineStore;
    sampleManager: SampleManager;
}

export const GROUP_BY_NONE = 'None';

const VAFChartControls: React.FunctionComponent<
    IVAFChartControlsProps
> = observer(function({ store, sampleManager }) {
    const groupByOptions = [
        {
            label: GROUP_BY_NONE,
            value: GROUP_BY_NONE,
        },
        ...sampleManager
            .getClinicalAttributeList(sampleManager.samples)
            .map(item => ({
                label: `${item.value}`,
                value: `${item.id}`,
            })),
    ];

    function groupByValue() {
        let value = groupByOptions.find(
            opt => opt.value == store.groupByOption
        );

        return value
            ? {
                  label: value.label,
                  value: store.groupByOption,
              }
            : '';
    }

    return (
        <div
            style={{
                marginTop: 5,
                marginLeft: 130,
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <span style={{ marginTop: -3, marginRight: 3 }}>Group by:</span>
            <div
                style={{
                    minWidth: 200,
                    width: 200,
                    zIndex: 20,
                    marginRight: 15,
                }}
            >
                <ReactSelect
                    value={groupByValue()}
                    options={groupByOptions}
                    onChange={(option: any) => {
                        store.setGroupByOption(option ? option.value : '');
                    }}
                    clearable={false}
                    searchable={true}
                />
            </div>
            <div style={{ float: 'left', marginRight: 15, marginTop: 4 }}>
                <LabeledCheckbox
                    checked={store.onlyShowSelectedInVAFChart}
                    onChange={() =>
                        store.setOnlyShowSelectedInVAFChart(
                            !store.onlyShowSelectedInVAFChart
                        )
                    }
                    labelProps={{ style: { marginRight: 10 } }}
                    inputProps={{ 'data-test': 'TableShowOnlyHighlighted' }}
                >
                    <span style={{ marginTop: -3 }}>
                        Show only selected mutations
                    </span>
                </LabeledCheckbox>
            </div>
            <div style={{ float: 'left', marginRight: 15, marginTop: 4 }}>
                <LabeledCheckbox
                    checked={store.vafChartLogScale}
                    onChange={() => {
                        store.setVafChartLogScale(!store.vafChartLogScale);
                    }}
                    labelProps={{ style: { marginRight: 10 } }}
                    inputProps={{ 'data-test': 'VAFLogScale' }}
                >
                    <span style={{ marginTop: -3 }}>Log scale</span>
                </LabeledCheckbox>
            </div>
            <div style={{ float: 'left', marginRight: 15, marginTop: 4 }}>
                <LabeledCheckbox
                    checked={store.vafChartYAxisToDataRange}
                    onChange={() => {
                        store.setVafChartYAxisToDataRange(
                            !store.vafChartYAxisToDataRange
                        );
                    }}
                    labelProps={{ style: { marginRight: 10 } }}
                    inputProps={{ 'data-test': 'VAFDataRange' }}
                >
                    <span style={{ marginTop: -3 }}>
                        Set y-axis to data range
                    </span>
                </LabeledCheckbox>
            </div>
        </div>
    );
});
export default VAFChartControls;

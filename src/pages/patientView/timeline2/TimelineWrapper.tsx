import React, { useEffect, useState } from 'react';
import _ from 'lodash';
import { observer } from 'mobx-react-lite';
import { CoverageInformation } from '../../resultsView/ResultsViewPageStoreUtils';
import { Sample } from 'cbioportal-ts-api-client';
import PatientViewMutationsDataStore from '../mutation/PatientViewMutationsDataStore';
import VAFChartControls from './VAFChartControls';
import VAFChartWrapper from 'pages/patientView/timeline2/VAFChartWrapper';

import 'cbioportal-clinical-timeline/dist/styles.css';

import {
    configureTracks,
    formatDate,
    getAttributeValue,
    Timeline,
    TimelineEvent,
    TimelineStore,
    TimelineTrackSpecification,
    TimelineTrackType,
} from 'cbioportal-clinical-timeline';

import { ClinicalEvent } from 'cbioportal-ts-api-client';
import SampleManager from 'pages/patientView/SampleManager';
import SampleMarker from 'pages/patientView/timeline2/SampleMarker';
import { TIMELINE_TRACK_HEIGHT } from 'cbioportal-clinical-timeline/src/TimelineTrack';

function makeItems(eventData: ClinicalEvent[]) {
    return eventData.map((e: ClinicalEvent) => {
        return {
            end:
                e.endNumberOfDaysSinceDiagnosis ||
                e.startNumberOfDaysSinceDiagnosis,
            start: e.startNumberOfDaysSinceDiagnosis,
            event: e,
        };
    });
}

function organizeDataIntoTracks(
    rootTrackType: string,
    trackStructure: string[],
    eventData: ClinicalEvent[]
): TimelineTrackSpecification {
    const dataByRootValue = _.groupBy(eventData, item => {
        const rootData = item.attributes.find(
            (att: any) => att.key === trackStructure[0]
        );
        return rootData ? rootData.value : 'Other';
    });

    const tracks: TimelineTrackSpecification[] = _.map(
        dataByRootValue,
        (data, rootValue) => {
            if (trackStructure.length > 1) {
                // If trackStructure is non-trivial, recurse for this rootValue
                const track = organizeDataIntoTracks(
                    rootValue,
                    trackStructure.slice(1),
                    data
                );
                return track;
            } else {
                // If trackStructure is trivial, then just return a single track for this rootValue
                return {
                    type: rootValue,
                    items: makeItems(data),
                };
            }
        }
    );

    // Finally, organize all tracks under an empty root track
    const track = {
        type: rootTrackType,
        tracks,
        items: [],
    };

    return track;
}

export interface ISampleMetaDeta {
    color: { [sampleId: string]: string };
    index: { [sampleId: string]: number };
    label: { [sampleId: string]: string };
}

export interface ITimeline2Props {
    dataStore: PatientViewMutationsDataStore;
    data: ClinicalEvent[];
    caseMetaData: ISampleMetaDeta;
    sampleManager: SampleManager;
    width: number;
    samples: Sample[];
    mutationProfileId: string;
    coverageInformation: CoverageInformation;
}

const TimelineWrapper: React.FunctionComponent<ITimeline2Props> = observer(
    function({
        dataStore,
        data,
        caseMetaData,
        sampleManager,
        width,
        samples,
        mutationProfileId,
        coverageInformation,
    }: ITimeline2Props) {
        const [events, setEvents] = useState<
            TimelineTrackSpecification[] | null
        >(null);

        const [store, setStore] = useState<TimelineStore | null>(null);

        useEffect(() => {
            var isGenieBpcStudy = window.location.href.includes('genie_bpc');

            let baseConfig: any = {
                sortOrder: [
                    'Specimen',
                    'Sequencing',
                    'Sample Acquisition',
                    'Surgery',
                    'Med Onc Assessment',
                    'Status',
                    'Diagnostics',
                    'Diagnostic',
                    'Imaging',
                    'Lab_test',
                    'Treatment',
                ],
                trackStructures: [
                    ['TREATMENT', 'TREATMENT_TYPE', 'SUBTYPE', 'AGENT'],
                    ['LAB_TEST', 'TEST'],
                ],
                trackEventRenderers: [
                    {
                        trackTypeMatch: /LAB_TEST/i,
                        configureTrack: (cat: TimelineTrackSpecification) => {
                            const psaTrack = cat.tracks
                                ? cat.tracks.find(t => t.type === 'PSA')
                                : undefined;

                            if (psaTrack && psaTrack && psaTrack.items.length) {
                                psaTrack.trackType =
                                    TimelineTrackType.LINE_CHART;
                                psaTrack.getLineChartValue = (
                                    e: TimelineEvent
                                ) => {
                                    const val = getAttributeValue('VALUE', e);
                                    if (val === undefined) {
                                        return null;
                                    } else {
                                        return parseFloat(
                                            val.replace(/^[<>]/gi, '')
                                        );
                                    }
                                };

                                const psaValues = psaTrack.items.map(event => {
                                    const val = getAttributeValue(
                                        'VALUE',
                                        event
                                    );

                                    return val
                                        ? parseFloat(val.replace(/^[<>]/gi, ''))
                                        : undefined;
                                });

                                //console.log(psaValues.map(v => v.value));
                                const max = _.max(psaValues);

                                /*psaTrack.items.forEach(event => {
                                    event.render = () => {
                                        let perc =
                                            getAttributeValue('VALUE', event) /
                                            (max || 1)!;
                                        perc = perc > 0.2 ? perc : 0.2;
                                        return (
                                            <circle
                                                cx={0}
                                                cy={TIMELINE_TRACK_HEIGHT / 2}
                                                r={8 * perc}
                                                fill={'#999999'}
                                            />
                                        );
                                    };
                                });*/
                            }
                        },
                    },
                    {
                        trackTypeMatch: /SPECIMEN|SAMPLE ACQUISITION|SEQUENCING/i,
                        configureTrack: (cat: TimelineTrackSpecification) => {
                            // we want a custom tooltip for samples, which includes clinical data
                            // not included in the timeline event
                            cat.renderTooltip = function(event: TimelineEvent) {
                                const hoveredSample = event.event.attributes.find(
                                    (att: any) => att.key === 'SAMPLE_ID'
                                );

                                const sampleWithClinicalData = sampleManager.samples.find(
                                    sample => {
                                        return (
                                            sample.id === hoveredSample.value
                                        );
                                    }
                                );

                                if (sampleWithClinicalData) {
                                    return (
                                        <table>
                                            <tr>
                                                <th>SAMPLE ID</th>
                                                <td>
                                                    {sampleWithClinicalData.id}
                                                </td>
                                            </tr>
                                            {sampleWithClinicalData.clinicalData.map(
                                                d => {
                                                    return (
                                                        <tr>
                                                            <th>
                                                                {d.clinicalAttributeId
                                                                    .toUpperCase()
                                                                    .replace(
                                                                        /_/g,
                                                                        ' '
                                                                    )}
                                                            </th>
                                                            <td>{d.value}</td>
                                                        </tr>
                                                    );
                                                }
                                            )}
                                            <tr>
                                                <th>START DATE</th>
                                                <td className={'nowrap'}>
                                                    {formatDate(event.start)}
                                                </td>
                                            </tr>
                                        </table>
                                    );
                                } else {
                                    return (
                                        <div>
                                            Error. Cannot find data for sample.
                                        </div>
                                    );
                                }
                            };

                            cat.items.forEach((event, i) => {
                                const sampleId = event.event.attributes.find(
                                    (att: any) => att.key === 'SAMPLE_ID'
                                );
                                if (sampleId) {
                                    const color =
                                        caseMetaData.color[sampleId.value] ||
                                        '#333333';
                                    const label =
                                        caseMetaData.label[sampleId.value] ||
                                        '-';
                                    event.render = event => {
                                        return (
                                            <SampleMarker
                                                color={color}
                                                label={label}
                                                y={TIMELINE_TRACK_HEIGHT / 2}
                                            />
                                        );
                                    };
                                }
                            });
                        },
                    },
                ],
            };

            if (isGenieBpcStudy) {
                baseConfig.sortOrder = [
                    'Sample acquisition',
                    'Sequencing',
                    'Surgery',
                    'Diagnostics',
                    'Diagnostic',
                    'Treatment',
                    'Lab_test',
                    'Status',
                    'IMAGING',
                    'Med Onc Assessment',
                ];

                // this differs from default in that on genie, we do NOT distinguish tracks based on subtype. we hide on subtype
                baseConfig.trackStructures = [
                    ['TREATMENT', 'TREATMENT_TYPE', 'AGENT'],
                    ['LAB_TEST', 'TEST'],
                ];

                // status track
                baseConfig.trackEventRenderers.push({
                    trackTypeMatch: /STATUS|Med Onc Assessment/i,
                    configureTrack: (cat: TimelineTrackSpecification) => {
                        cat.label = 'Med Onc Assessment';
                        const colorMappings = [
                            { re: /indeter/i, color: '#ffffff' },
                            { re: /stable/i, color: 'gainsboro' },
                            { re: /mixed/i, color: 'goldenrod' },
                            { re: /improving/i, color: 'rgb(44, 160, 44)' },
                            { re: /worsening/i, color: 'rgb(214, 39, 40)' },
                        ];
                        cat.items.forEach((event, i) => {
                            const status = event.event.attributes.find(
                                (att: any) => att.key === 'STATUS'
                            );
                            let color = '#ffffff';
                            if (status) {
                                const colorConfig = colorMappings.find(m =>
                                    m.re.test(status.value)
                                );
                                if (colorConfig) {
                                    color = colorConfig.color;
                                }
                            }
                            event.render = event => {
                                return (
                                    <circle
                                        cx="0"
                                        cy={TIMELINE_TRACK_HEIGHT / 2}
                                        r="4"
                                        stroke="#999999"
                                        fill={color}
                                    />
                                );
                            };
                        });
                    },
                });

                // imaging track
                baseConfig.trackEventRenderers.push({
                    trackTypeMatch: /IMAGING/i,
                    configureTrack: (cat: TimelineTrackSpecification) => {
                        cat.label = 'Imaging Assessment';

                        const colorMappings = [
                            {
                                re: /indeter|does not mention/i,
                                color: '#ffffff',
                            },
                            { re: /stable/i, color: 'gainsboro' },
                            { re: /mixed/i, color: 'goldenrod' },
                            { re: /improving/i, color: 'rgb(44, 160, 44)' },
                            { re: /worsening/i, color: 'rgb(214, 39, 40)' },
                        ];
                        if (cat.items && cat.items.length) {
                            cat.items.forEach((event, i) => {
                                const status = event.event.attributes.find(
                                    (att: any) => att.key === 'IMAGE_OVERALL'
                                );
                                let color = '#ffffff';
                                if (status) {
                                    const colorConfig = colorMappings.find(m =>
                                        m.re.test(status.value)
                                    );
                                    if (colorConfig) {
                                        color = colorConfig.color;
                                    }
                                }
                                event.render = event => {
                                    return (
                                        <circle
                                            cx="0"
                                            cy={TIMELINE_TRACK_HEIGHT / 2}
                                            r="4"
                                            stroke="#999999"
                                            fill={color}
                                        />
                                    );
                                };
                            });
                        }
                    },
                });
            }

            const trackStructuresByRoot = _.keyBy(
                baseConfig.trackStructures,
                arr => arr[0]
            );

            const dataByEventType = _.groupBy(data, (e: ClinicalEvent) =>
                e.eventType.toUpperCase()
            );

            const allTracksInOrder: string[] = _.uniq(
                baseConfig.sortOrder
                    .map((name: string) => name.toUpperCase())
                    .concat(Object.keys(dataByEventType))
            );

            const trackSpecifications = allTracksInOrder.reduce(
                (specs: TimelineTrackSpecification[], trackKey) => {
                    const data = dataByEventType[trackKey];
                    if (!data) {
                        return specs;
                    }

                    if (trackKey in trackStructuresByRoot) {
                        specs.push(
                            organizeDataIntoTracks(
                                trackKey,
                                trackStructuresByRoot[trackKey].slice(1),
                                data
                            )
                        );
                    } else {
                        specs.push({
                            type: trackKey,
                            items: makeItems(data),
                        });
                    }
                    return specs;
                },
                []
            );

            configureTracks(
                trackSpecifications,
                baseConfig.trackEventRenderers
            );

            const store = new TimelineStore(trackSpecifications);

            setStore(store);

            (window as any).store = store;
        }, []);

        if (store) {
            return (
                <div>
                    <Timeline
                        store={store}
                        width={width}
                        customTracks={[
                            {
                                renderHeader: () => 'VAF',
                                renderTrack: (store: TimelineStore) => (
                                    <VAFChartWrapper
                                        dataStore={dataStore}
                                        store={store}
                                        sampleMetaData={caseMetaData}
                                        samples={samples}
                                        mutationProfileId={mutationProfileId}
                                        coverageInformation={
                                            coverageInformation
                                        }
                                        sampleManager={sampleManager}
                                    />
                                ),
                                height: (store: TimelineStore) => {
                                    return store.vafChartHeight;
                                },
                                labelForExport: 'VAF',
                            },
                        ]}
                    />
                    <VAFChartControls
                        store={store}
                        sampleManager={sampleManager}
                    />
                </div>
            );
        } else {
            return <div />;
        }
    }
);

export default TimelineWrapper;

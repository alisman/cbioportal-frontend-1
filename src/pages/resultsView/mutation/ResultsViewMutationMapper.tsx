import autobind from 'autobind-decorator';
import * as React from 'react';
import * as _ from 'lodash';
import {
    DataFilter,
    DataFilterType,
    onFilterOptionSelect,
} from 'react-mutation-mapper';
import { observer } from 'mobx-react';
import { action, computed, observable, makeObservable } from 'mobx';

import { getRemoteDataGroupStatus } from 'cbioportal-utils';
import { Mutation } from 'cbioportal-ts-api-client';
import { EnsemblTranscript } from 'genome-nexus-ts-api-client';
import {
    columnIdToFilterId,
    matchCategoricalFilterSearch,
} from 'shared/lib/MutationUtils';
import DiscreteCNACache from 'shared/cache/DiscreteCNACache';
import CancerTypeCache from 'shared/cache/CancerTypeCache';
import MutationCountCache from 'shared/cache/MutationCountCache';
import ClinicalAttributeCache from 'shared/cache/ClinicalAttributeCache';
import { Column } from 'shared/components/lazyMobXTable/LazyMobXTable';
import FilterIconModal from 'shared/components/filterIconModal/FilterIconModal';
import DoubleHandleSlider from 'shared/components/doubleHandleSlider/DoubleHandleSlider';
import CategoricalFilterMenu from 'shared/components/categoricalFilterMenu/CategoricalFilterMenu';

import {
    IMutationMapperProps,
    default as MutationMapper,
} from 'shared/components/mutationMapper/MutationMapper';
import MutationMapperDataStore, {
    MUTATION_STATUS_FILTER_ID,
} from 'shared/components/mutationMapper/MutationMapperDataStore';

import MutationRateSummary from 'pages/resultsView/mutation/MutationRateSummary';
import ResultsViewMutationMapperStore from 'pages/resultsView/mutation/ResultsViewMutationMapperStore';
import { ResultsViewPageStore } from '../ResultsViewPageStore';
import ResultsViewMutationTable from 'pages/resultsView/mutation/ResultsViewMutationTable';

export interface IResultsViewMutationMapperProps extends IMutationMapperProps {
    store: ResultsViewMutationMapperStore;
    discreteCNACache?: DiscreteCNACache;
    cancerTypeCache?: CancerTypeCache;
    mutationCountCache?: MutationCountCache;
    clinicalAttributeCache?: ClinicalAttributeCache;
    existsSomeMutationWithAscnProperty: { [property: string]: boolean };
    userEmailAddress: string;
    onClickSettingMenu?: (visible: boolean) => void;
}

@observer
export default class ResultsViewMutationMapper extends MutationMapper<
    IResultsViewMutationMapperProps
> {
    @observable private minMaxColumns: Set<Column<Mutation[]>>;
    @observable private allDataColumns: Set<Column<Mutation[]>>;

    constructor(props: IResultsViewMutationMapperProps) {
        super(props);
        makeObservable(this);
        this.minMaxColumns = new Set();
        this.allDataColumns = new Set();
    }

    @computed get mutationStatusFilter() {
        return this.store.dataStore.dataFilters.find(
            f => f.id === MUTATION_STATUS_FILTER_ID
        );
    }

    protected getMutationRateSummary(): JSX.Element | null {
        // TODO we should not be even calculating mskImpactGermlineConsentedPatientIds for studies other than msk impact
        if (
            this.props.store.germlineConsentedSamples &&
            this.props.store.germlineConsentedSamples.result &&
            this.props.store.mutationData.isComplete &&
            this.props.store.mutationData.result.length > 0 &&
            this.props.store.samples.isComplete &&
            this.props.store.samples.result &&
            this.props.store.samples.result.length > 0
        ) {
            return (
                <MutationRateSummary
                    hugoGeneSymbol={this.props.store.gene.hugoGeneSymbol}
                    molecularProfileIdToMolecularProfile={
                        this.props.store.molecularProfileIdToMolecularProfile
                    }
                    mutations={this.props.store.mutationData.result}
                    samples={this.props.store.samples.result!}
                    germlineConsentedSamples={
                        this.props.store.germlineConsentedSamples
                    }
                    onMutationStatusSelect={this.onMutationStatusSelect}
                    mutationStatusFilter={this.mutationStatusFilter}
                />
            );
        } else {
            return null;
        }
    }

    protected get isMutationTableDataLoading() {
        return (
            getRemoteDataGroupStatus(
                this.props.store.clinicalDataForSamples,
                this.props.store.studiesForSamplesWithoutCancerTypeClinicalData,
                this.props.store.canonicalTranscript,
                this.props.store.mutationData,
                this.props.store.indexedVariantAnnotations,
                this.props.store.activeTranscript,
                this.props.store.clinicalDataGroupedBySampleMap,
                this.props.store.mutationsTabClinicalAttributes
            ) === 'pending'
        );
    }

    protected get totalExonNumber() {
        const canonicalTranscriptId =
            this.props.store.canonicalTranscript.result &&
            this.props.store.canonicalTranscript.result.transcriptId;
        const transcript = (this.props.store.activeTranscript.result &&
        this.props.store.activeTranscript.result === canonicalTranscriptId
            ? this.props.store.canonicalTranscript.result
            : this.props.store.transcriptsByTranscriptId[
                  this.props.store.activeTranscript.result!
              ]) as EnsemblTranscript;
        return transcript && transcript.exons && transcript.exons.length > 0
            ? transcript.exons.length.toString()
            : 'None';
    }

    protected get mutationTableComponent(): JSX.Element | null {
        return (
            <ResultsViewMutationTable
                uniqueSampleKeyToTumorType={
                    this.props.store.uniqueSampleKeyToTumorType
                }
                oncoKbCancerGenes={this.props.store.oncoKbCancerGenes}
                discreteCNACache={this.props.discreteCNACache}
                studyIdToStudy={this.props.store.studyIdToStudy.result}
                molecularProfileIdToMolecularProfile={
                    this.props.store.molecularProfileIdToMolecularProfile.result
                }
                pubMedCache={this.props.pubMedCache}
                mutationCountCache={this.props.mutationCountCache}
                clinicalAttributeCache={this.props.clinicalAttributeCache}
                genomeNexusCache={this.props.genomeNexusCache}
                genomeNexusMutationAssessorCache={
                    this.props.genomeNexusMutationAssessorCache
                }
                dataStore={
                    this.props.store.dataStore as MutationMapperDataStore
                }
                itemsLabelPlural={this.itemsLabelPlural}
                downloadDataFetcher={this.props.store.downloadDataFetcher}
                myCancerGenomeData={this.props.store.myCancerGenomeData}
                hotspotData={this.props.store.indexedHotspotData}
                indexedVariantAnnotations={
                    this.props.store.indexedVariantAnnotations
                }
                indexedMyVariantInfoAnnotations={
                    this.props.store.indexedMyVariantInfoAnnotations
                }
                cosmicData={this.props.store.cosmicData.result}
                oncoKbData={this.props.store.oncoKbData}
                usingPublicOncoKbInstance={
                    this.props.store.usingPublicOncoKbInstance
                }
                civicGenes={this.props.store.civicGenes}
                civicVariants={this.props.store.civicVariants}
                userEmailAddress={this.props.userEmailAddress}
                enableOncoKb={this.props.enableOncoKb}
                enableFunctionalImpact={this.props.enableGenomeNexus}
                enableHotspot={this.props.enableHotspot}
                enableMyCancerGenome={this.props.enableMyCancerGenome}
                enableCivic={this.props.enableCivic}
                totalNumberOfExons={this.totalExonNumber}
                generateGenomeNexusHgvsgUrl={
                    this.props.store.generateGenomeNexusHgvsgUrl
                }
                isCanonicalTranscript={this.props.store.isCanonicalTranscript}
                selectedTranscriptId={this.props.store.activeTranscript.result}
                sampleIdToClinicalDataMap={
                    this.props.store.clinicalDataGroupedBySampleMap
                }
                existsSomeMutationWithAscnProperty={
                    this.props.existsSomeMutationWithAscnProperty
                }
                mutationsTabClinicalAttributes={
                    this.props.store.mutationsTabClinicalAttributes
                }
                clinicalAttributeIdToAvailableFrequency={
                    this.props.store.clinicalAttributeIdToAvailableFrequency
                }
                columnToHeaderFilterIconModal={
                    this.columnToHeaderFilterIconModal
                }
                deactivateColumnFilter={this.deactivateColumnFilter}
            />
        );
    }

    protected get mutationTable(): JSX.Element | null {
        return (
            <span>
                {!this.isMutationTableDataLoading &&
                    this.mutationTableComponent}
            </span>
        );
    }

    @action.bound
    protected onMutationStatusSelect(
        selectedMutationStatusIds: string[],
        allValuesSelected: boolean
    ) {
        onFilterOptionSelect(
            selectedMutationStatusIds,
            allValuesSelected,
            this.store.dataStore,
            DataFilterType.MUTATION_STATUS,
            MUTATION_STATUS_FILTER_ID
        );
    }

    @computed get dataFilterColumns() {
        return new Set([
            ...this.props.store.numericalFilterColumns,
            ...this.props.store.categoricalFilterColumns,
        ]);
    }

    @computed get getFilters() {
        const filters: { [columnId: string]: DataFilter } = {};
        for (let columnId of this.dataFilterColumns) {
            const filter = this.store.dataStore.dataFilters.find(
                f => f.type === columnId
            );
            if (filter) {
                filters[columnId] = filter;
            }
        }
        return filters;
    }

    protected columnFilterIsActive(columnId: string) {
        return columnId in this.getFilters;
    }

    @computed get columnMinMax() {
        const minMax: { [columnId: string]: { min: string; max: string } } = {};
        for (let column of this.minMaxColumns) {
            const columnId = column.name;
            let minText = '0';
            let maxText = '100';

            if (column.sortBy) {
                let min = Infinity;
                let max = -Infinity;
                let dMin, dMax;

                for (let i = 0; i < this.store.dataStore.allData.length; i++) {
                    const d = this.store.dataStore.allData[i];
                    const val = column.sortBy(d);
                    if (val !== null) {
                        if (+val < min) {
                            min = +val;
                            dMin = d;
                        }
                        if (+val > max) {
                            max = +val;
                            dMax = d;
                        }
                    }
                }

                if (column.download && dMin && dMax) {
                    minText = _.flatten([column.download(dMin)])[0];
                    maxText = _.flatten([column.download(dMax)])[0];
                } else {
                    minText = '' + min;
                    maxText = '' + max;
                }
            }

            minMax[columnId] = { min: minText, max: maxText };
        }
        return minMax;
    }

    @computed get allUniqColumnData() {
        const allUniqColumnData: { [columnId: string]: Set<string> } = {};
        for (let column of this.allDataColumns) {
            const columnId = column.name;
            if (column.download) {
                allUniqColumnData[columnId] = new Set();
                for (let i = 0; i < this.store.dataStore.allData.length; i++) {
                    const d = this.store.dataStore.allData[i];
                    const value = _.flatten([column.download(d)])[0];

                    let match = true;
                    if (this.columnFilterIsActive(columnId)) {
                        const filter = this.getFilters[columnId];
                        const filterType = filter.values[0];
                        const filterString = filter.values[1];
                        match =
                            filterString === '' ||
                            matchCategoricalFilterSearch(
                                value.toUpperCase(),
                                filterType,
                                filterString.toUpperCase()
                            );
                    }
                    if (match && value !== '') {
                        allUniqColumnData[columnId].add(value);
                    }
                }
            } else {
                allUniqColumnData[columnId] = new Set();
            }
        }
        return allUniqColumnData;
    }

    protected deactivateColumnFilter = (columnId: string) => {
        onFilterOptionSelect(
            [],
            true,
            this.store.dataStore,
            columnId,
            columnIdToFilterId(columnId)
        );
    };

    protected activateColumnFilter = (column: Column<Mutation[]>) => {
        const columnId = column.name;
        if (this.props.store.numericalFilterColumns.has(columnId)) {
            this.minMaxColumns.add(column);
            const min = this.columnMinMax[columnId].min;
            const max = this.columnMinMax[columnId].max;

            onFilterOptionSelect(
                [min, max],
                false,
                this.store.dataStore,
                columnId,
                columnIdToFilterId(columnId)
            );
        } else if (this.props.store.categoricalFilterColumns.has(columnId)) {
            this.allDataColumns.add(column);
            const defaultSelections = this.allUniqColumnData[column.name];

            onFilterOptionSelect(
                ['contains', '', defaultSelections],
                false,
                this.store.dataStore,
                columnId,
                columnIdToFilterId(columnId)
            );
        }
    };

    protected columnToHeaderFilterIconModal = (column: Column<Mutation[]>) => {
        const columnId = column.name;
        const isNumericalFilterColumn = this.props.store.numericalFilterColumns.has(
            columnId
        );
        const isCategoricalFilterColumn = this.props.store.categoricalFilterColumns.has(
            columnId
        );

        if (isNumericalFilterColumn || isCategoricalFilterColumn) {
            let menuComponent;
            if (this.columnFilterIsActive(columnId)) {
                const filter = this.getFilters[columnId];
                if (isNumericalFilterColumn) {
                    menuComponent = (
                        <DoubleHandleSlider
                            id={columnId}
                            min={this.columnMinMax[columnId].min}
                            max={this.columnMinMax[columnId].max}
                            callbackLowerValue={newLowerBound => {
                                filter.values[0] = newLowerBound;
                            }}
                            callbackUpperValue={newUpperBound => {
                                filter.values[1] = newUpperBound;
                            }}
                        />
                    );
                } else if (isCategoricalFilterColumn) {
                    menuComponent = (
                        <CategoricalFilterMenu
                            id={columnId}
                            currSelections={filter.values[2]}
                            allSelections={this.allUniqColumnData[columnId]}
                            updateFilterType={newFilterType => {
                                filter.values[0] = newFilterType;
                            }}
                            updateFilterString={newFilterString => {
                                filter.values[1] = newFilterString;
                            }}
                            toggleSelection={selection => {
                                const selections = filter.values[2];
                                if (selections.has(selection)) {
                                    selections.delete(selection);
                                } else {
                                    selections.add(selection);
                                }
                            }}
                        />
                    );
                }
            }

            return (
                <FilterIconModal
                    id={columnId}
                    filterIsActive={this.columnFilterIsActive(columnId)}
                    deactivateFilter={() =>
                        this.deactivateColumnFilter(columnId)
                    }
                    activateFilter={() => this.activateColumnFilter(column)}
                    menuComponent={menuComponent}
                />
            );
        }
    };
}

import OncoprintJS, {RuleSetParams, TrackSortComparator} from "oncoprintjs";
import {ClinicalTrackSpec, GeneticTrackDatum, GeneticTrackSpec, HeatmapTrackSpec} from "./Oncoprint";
import {ClinicalAttribute} from "../../api/generated/CBioPortalAPI";
import {genetic_rule_set_same_color_for_all_no_recurrence,
    genetic_rule_set_same_color_for_all_recurrence,
    genetic_rule_set_different_colors_no_recurrence,
    genetic_rule_set_different_colors_recurrence} from "./geneticrules";
import {OncoprintPatientGeneticTrackData, OncoprintSampleGeneticTrackData} from "../../lib/QuerySession";
import {ResultsViewPageStore} from "../../../pages/resultsView/ResultsViewPageStore";
import {remoteData} from "../../api/remoteData";
import {makeGeneticTrackData, makeHeatmapTrackData} from "./DataUtils";
import ResultsViewOncoprint from "./ResultsViewOncoprint";
import _ from "lodash";
import {action} from "mobx";

export function doWithRenderingSuppressedAndSortingOff(oncoprint:OncoprintJS<any>, task:()=>void) {
    oncoprint.suppressRendering();
    oncoprint.keepSorted(false);
    task();
    oncoprint.keepSorted(true);
    oncoprint.releaseRendering();
}

export function getHeatmapTrackRuleSetParams() {
    return {
        type: 'gradient' as 'gradient',
        legend_label: 'Heatmap',
        value_key: "profile_data",
        value_range: [-3,3] as [number, number],
        colors: [[0,0,255,1], [0,0,0,1], [255,0,0,1]],
        value_stop_points: [-3, 0, 3],
        null_color: 'rgba(224,224,224,1)'
    };
}

export function getGeneticTrackRuleSetParams(distinguishMutationType?:boolean, distinguishDrivers?:boolean):RuleSetParams {
    if (!distinguishMutationType && !distinguishDrivers) {
        return genetic_rule_set_same_color_for_all_no_recurrence;
    } else if (!distinguishMutationType && distinguishDrivers) {
        return genetic_rule_set_same_color_for_all_recurrence;
    } else if (distinguishMutationType && !distinguishDrivers) {
        return genetic_rule_set_different_colors_no_recurrence;
    } else {
        return genetic_rule_set_different_colors_recurrence;
    }
}

export function getClinicalTrackRuleSetParams(track:ClinicalTrackSpec<any>) {
    if (track.datatype === "number") {
        return {
            type: 'bar',
            value_key: track.valueKey,
            value_range: track.numberRange,
            log_scale: track.numberLogScale
        };
    } else if (track.datatype === "counts") {
        return {
            type: "stacked_bar",
            value_key: track.valueKey,
            categories: track.countsCategoryLabels,
            fills: track.countsCategoryFills
        };
    } else {
        return {
            type: 'categorical',
            category_key: track.valueKey
        };
    }
}

export function percentAltered(altered:number, sequenced:number) {
    const p = altered/sequenced;
    const percent = 100*p;
    let fixed:string;
    if (p < 0.03) {
        // if less than 3%, use one decimal digit
        fixed = percent.toFixed(1);
        // if last digit is a 0, use no decimal digits
        if (fixed[fixed.length-1] === "0") {
            fixed = percent.toFixed();
        }
    } else {
        fixed = percent.toFixed();
    }
    return fixed+"%";
}

export function getPercentAltered(oncoprintTrackData:OncoprintSampleGeneticTrackData|OncoprintPatientGeneticTrackData):string {
    if (oncoprintTrackData.hasOwnProperty("altered_samples")) {
        return percentAltered((oncoprintTrackData as OncoprintSampleGeneticTrackData).altered_sample_uids.length,
                            (oncoprintTrackData as OncoprintSampleGeneticTrackData).sequenced_samples.length);
    } else {
        return percentAltered((oncoprintTrackData as OncoprintPatientGeneticTrackData).altered_patient_uids.length,
            (oncoprintTrackData as OncoprintPatientGeneticTrackData).sequenced_patients.length);
    }
}

export function makeGeneticTracksMobxPromise(oncoprint:ResultsViewOncoprint, sampleMode:boolean) {
    return remoteData<GeneticTrackSpec[]>({
        await:()=>[
            oncoprint.props.store.genes,
            oncoprint.props.store.samples,
            oncoprint.props.store.patients,
            oncoprint.props.store.caseAggregatedDataByOQLLine,
            oncoprint.props.store.molecularProfileIdToMolecularProfile,
            oncoprint.props.store.genePanelInformation,
            oncoprint.props.store.alteredSampleKeys,
            oncoprint.props.store.sequencedSampleKeys,
            oncoprint.props.store.alteredPatientKeys,
            oncoprint.props.store.sequencedPatientKeys
        ],
        invoke: async()=>{
            return oncoprint.props.store.caseAggregatedDataByOQLLine.result!.map((x:any, index:number)=>{
                const data = makeGeneticTrackData(
                    sampleMode ? x.cases.samples : x.cases.patients,
                    x.oql.gene,
                    sampleMode ? oncoprint.props.store.samples.result! : oncoprint.props.store.patients.result!,
                    oncoprint.props.store.genePanelInformation.result!,
                    oncoprint.isPutativeDriver
                );
                return {
                    key: index+"",
                    label: x.oql.gene,
                    oql: x.oql.oql_line,
                    info: sampleMode ? percentAltered(oncoprint.props.store.alteredSampleKeys.result!.length, oncoprint.props.store.sequencedSampleKeys.result!.length)
                                    : percentAltered(oncoprint.props.store.alteredPatientKeys.result!.length, oncoprint.props.store.sequencedPatientKeys.result!.length),
                    data
                };
            });
        },
        default: [],
    });   
}

export function makeHeatmapTracksMobxPromise(oncoprint:ResultsViewOncoprint, sampleMode:boolean) {
    return remoteData<HeatmapTrackSpec[]>({
        await:()=>[
            oncoprint.props.store.samples,
            oncoprint.props.store.patients,
            oncoprint.props.store.molecularProfileIdToMolecularProfile,
        ],
        invoke:async()=>{

            const molecularProfileIdToMolecularProfile = oncoprint.props.store.molecularProfileIdToMolecularProfile.result!;
            const molecularProfileIdToHeatmapTracks = oncoprint.molecularProfileIdToHeatmapTracks;

            const neededGenes = _.flatten(molecularProfileIdToHeatmapTracks.values().map(v=>v.genes.keys()));
            const genes = await oncoprint.props.store.geneCache.getPromise(neededGenes.map(g=>({hugoGeneSymbol:g})), true);

            const cacheQueries = _.flatten(molecularProfileIdToHeatmapTracks.entries().map(entry=>(
                entry[1].genes.keys().map(g=>({
                    molecularProfileId: entry[0],
                    entrezGeneId: oncoprint.props.store.geneCache.get({ hugoGeneSymbol:g })!.data!.entrezGeneId,
                    hugoGeneSymbol: g.toUpperCase()
                }))
            )));
            await oncoprint.props.store.geneMolecularDataCache.getPromise(cacheQueries, true);

            const samples = oncoprint.props.store.samples.result!;
            const patients = oncoprint.props.store.patients.result!;

            return cacheQueries.map(query=>{
                const molecularProfileId = query.molecularProfileId;
                const gene = query.hugoGeneSymbol;
                const data = oncoprint.props.store.geneMolecularDataCache.get(query)!.data!;
                return {
                    key: `${molecularProfileId},${gene}`,
                    label: gene,
                    molecularProfileId: molecularProfileId,
                    molecularAlterationType: molecularProfileIdToMolecularProfile[molecularProfileId].molecularAlterationType,
                    datatype: molecularProfileIdToMolecularProfile[molecularProfileId].datatype,
                    data: makeHeatmapTrackData(gene, sampleMode? samples : patients, data),
                    trackGroupIndex: molecularProfileIdToHeatmapTracks.get(molecularProfileId)!.trackGroupIndex,
                    onRemove:action(()=>{
                        const trackGroup = molecularProfileIdToHeatmapTracks.get(molecularProfileId);
                        if (trackGroup) {
                            trackGroup.genes.delete(gene);
                            if (!trackGroup.genes.size) {
                                molecularProfileIdToHeatmapTracks.delete(molecularProfileId);
                                if (oncoprint.sortMode.type === "heatmap" && oncoprint.sortMode.clusteredHeatmapProfile === molecularProfileId) {
                                    oncoprint.sortByData();
                                }
                            }
                        }
                    })
                };
            });
        },
        default: []
    });
}
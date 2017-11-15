import {
    CaseAggregatedData, ExtendedAlteration,
    GenePanelInformation
} from "../../../pages/resultsView/ResultsViewPageStore";
import {
    GeneMolecularData, GenePanelData, MolecularProfile, Mutation, Patient,
    Sample
} from "../../api/generated/CBioPortalAPI";
import {GeneticTrackDatum, HeatmapTrackDatum} from "./Oncoprint";
import {isSample, isSampleList} from "../../lib/CBioPortalAPIUtils";
import {getSimplifiedMutationType, SimplifiedMutationType} from "../../lib/oql/accessors";
import _ from "lodash";

const cnaDataToString:{[integerCNA:string]:string|undefined} = {
    "-2": "homdel",
    "-1": "hetloss",
    "0": undefined,
    "1": "gain",
    "2": "amp"
};
const mutRenderPriority = {
    'trunc_rec':1,
    'inframe_rec':2,
    'missense_rec':3,
    'trunc': 4,
    'inframe': 5,
    'missense': 6
};
const cnaRenderPriority = {
    'amp': 0,
    'homdel': 0,
    'gain': 1,
    'hetloss': 1
};
const mrnaRenderPriority = {
    'up': 0,
    'down': 0
};
const protRenderPriority = {
    'up': 0,
    'down': 0
};

export type OncoprintMutationType = "missense" | "inframe" | "fusion" | "trunc";

export function getOncoprintMutationType(type:SimplifiedMutationType):OncoprintMutationType {
    if (type === "missense" || type === "inframe" || type === "fusion") {
        return type;
    } else {
        return "trunc";
    }
}

function selectDisplayValue(counts:{[value:string]:number}, priority:{[value:string]:number}) {
    const options = Object.keys(counts).map(k=>({key:k, value:counts[k]}));
    if (options.length > 0) {
        options.sort(function (kv1, kv2) {
            const rendering_priority_diff = priority[kv1.key] - priority[kv2.key];
            if (rendering_priority_diff < 0) {
                return -1;
            } else if (rendering_priority_diff > 0) {
                return 1;
            } else {
                if (kv1.value < kv2.value) {
                    return 1;
                } else if (kv1.value > kv2.value) {
                    return -1;
                } else {
                    return 0;
                }
            }
        });
        return options[0].key;
    } else {
        return undefined;
    }
};

function fillGeneticTrackDatum(
    newDatum:Partial<GeneticTrackDatum>,
    hugoGeneSymbol:string,
    data:ExtendedAlteration[],
    isPutativeDriver?:(datum:ExtendedAlteration)=>boolean
):void {
    newDatum.gene = hugoGeneSymbol;
    newDatum.data = data;

    let dispFusion = false;
    const dispCnaCounts:{[cnaEvent:string]:number} = {};
    const dispMrnaCounts:{[mrnaEvent:string]:number} = {};
    const dispProtCounts:{[protEvent:string]:number} = {};
    const dispMutCounts:{[mutType:string]:number} = {};

    for (const event of data) {
        const molecularAlterationType = event.molecularProfileAlterationType;
        switch (molecularAlterationType) {
            case "COPY_NUMBER_ALTERATION":
                const cnaEvent = cnaDataToString[(event as GeneMolecularData).value];
                if (cnaEvent) {
                    // not diploid
                    dispCnaCounts[cnaEvent] = dispCnaCounts[cnaEvent] || 0;
                    dispCnaCounts[cnaEvent] += 1;
                }
                break;
            case "MRNA_EXPRESSION":
                if (event.alterationSubType) {
                    const mrnaEvent = event.alterationSubType;
                    dispMrnaCounts[mrnaEvent] = dispMrnaCounts[mrnaEvent] || 0;
                    dispMrnaCounts[mrnaEvent] += 1;
                }
                break;
            case "PROTEIN_LEVEL":
                if (event.alterationSubType) {
                    const protEvent = event.alterationSubType;
                    dispProtCounts[protEvent] = dispProtCounts[protEvent] || 0;
                    dispProtCounts[protEvent] += 1;
                }
                break;
            case "MUTATION_EXTENDED":
                let oncoprintMutationType = getOncoprintMutationType(getSimplifiedMutationType(event.mutationType)!);
                if (oncoprintMutationType === "fusion") {
                    dispFusion = true;
                } else {
                    if (isPutativeDriver && isPutativeDriver(event)) {
                        oncoprintMutationType += "_rec";
                    }
                    dispMutCounts[oncoprintMutationType] = dispMutCounts[oncoprintMutationType] || 0;
                    dispMutCounts[oncoprintMutationType] += 1;
                }

        }
    }
    if (dispFusion) {
        newDatum.disp_fusion = true;
    }
    newDatum.disp_cna = selectDisplayValue(dispCnaCounts, cnaRenderPriority);
    newDatum.disp_mrna = selectDisplayValue(dispMrnaCounts, mrnaRenderPriority);
    newDatum.disp_prot = selectDisplayValue(dispProtCounts, protRenderPriority);
    newDatum.disp_mut = selectDisplayValue(dispMutCounts, mutRenderPriority);
}

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<ExtendedAlteration>["samples"],
    hugoGeneSymbol:string,
    samples:Sample[],
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:ExtendedAlteration)=>boolean
):GeneticTrackDatum[];

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<ExtendedAlteration>["patients"],
    hugoGeneSymbol:string,
    patients:Patient[],
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:ExtendedAlteration)=>boolean
):GeneticTrackDatum[];

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<ExtendedAlteration>["samples"]|CaseAggregatedData<ExtendedAlteration>["patients"],
    hugoGeneSymbol:string,
    cases:Sample[]|Patient[],
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:ExtendedAlteration)=>boolean
):GeneticTrackDatum[] {
    if (!cases.length) {
        return [];
    }
    const ret:GeneticTrackDatum[] = [];
    if (isSampleList(cases)) {
        // case: Samples
        for (const sample of cases) {
            const newDatum:Partial<GeneticTrackDatum> = {};
            newDatum.sample = sample.sampleId;
            newDatum.study_id = sample.studyId;
            newDatum.uid = sample.uniqueSampleKey;

            if (!genePanelInformation.samples[sample.uniqueSampleKey] ||
                !genePanelInformation.samples[sample.uniqueSampleKey][hugoGeneSymbol]) {
                //todo: uncomment this when you figure out WXS //newDatum.na = true;
            } else {
                newDatum.coverage = genePanelInformation.samples[sample.uniqueSampleKey][hugoGeneSymbol];
            }
            fillGeneticTrackDatum(
                newDatum, hugoGeneSymbol,
                caseAggregatedAlterationData[sample.uniqueSampleKey],
                isPutativeDriver
            );
            ret.push(newDatum as GeneticTrackDatum);
        }
    } else {
        // case: Patients
        for (const patient of cases) {
            const newDatum:Partial<GeneticTrackDatum> = {};
            newDatum.patient = patient.patientId;
            newDatum.study_id = patient.studyId;
            newDatum.uid = patient.uniquePatientKey

            if (!genePanelInformation.patients[patient.uniquePatientKey] ||
                !genePanelInformation.patients[patient.uniquePatientKey][hugoGeneSymbol]) {
                //todo: uncomment this when you figure out WXS //newDatum.na = true;
            } else {
                newDatum.coverage = genePanelInformation.patients[patient.uniquePatientKey][hugoGeneSymbol];
            }
            fillGeneticTrackDatum(
                newDatum, hugoGeneSymbol,
                caseAggregatedAlterationData[patient.uniquePatientKey],
                isPutativeDriver
            );
            ret.push(newDatum as GeneticTrackDatum);
        }
    }
    return ret;
}


function fillHeatmapTrackDatum(
    trackDatum: Partial<HeatmapTrackDatum>,
    hugoGeneSymbol: string,
    case_:Sample|Patient,
    data?:GeneMolecularData[]
) {
    trackDatum.hugo_gene_symbol = hugoGeneSymbol;
    trackDatum.study = case_.studyId;
    if (!data || !data.length) {
        trackDatum.profile_data = null;
        trackDatum.na = true;
    } else if (data.length === 1) {
        trackDatum.profile_data = parseFloat(data[0].value);
    } else {
        if (isSample(case_)) {
            throw Error("Unexpectedly received multiple heatmap profile data for one sample");
        } else {
            // aggregate samples for this patient by selecting the highest absolute (Z-)score
            trackDatum.profile_data = data.reduce((maxInAbsVal:number, next:GeneMolecularData)=>{
                const val = parseFloat(next.value);
                if (Math.abs(val) > Math.abs(maxInAbsVal)) {
                    return val;
                } else {
                    return maxInAbsVal;
                }
            }, 0);
        }
    }
    return trackDatum;
}

export function makeHeatmapTrackData(
    hugoGeneSymbol: string,
    cases:Sample[]|Patient[],
    data: GeneMolecularData[]
):HeatmapTrackDatum[] {
    if (!cases.length) {
        return [];
    }
    const sampleData = isSampleList(cases);
    let keyToData:{[uniqueKey:string]:GeneMolecularData[]};
    let ret:HeatmapTrackDatum[]
    if (isSampleList(cases)) {
        keyToData = _.groupBy(data, d=>d.uniqueSampleKey);
        ret = cases.map(c=>{
            const trackDatum:Partial<HeatmapTrackDatum> = {};
            trackDatum.sample = c.sampleId;
            trackDatum.uid = c.uniqueSampleKey;
            const data = keyToData[c.uniqueSampleKey];
            fillHeatmapTrackDatum(trackDatum, hugoGeneSymbol, c, data);
            return trackDatum as HeatmapTrackDatum;
        });
    } else {
        keyToData = _.groupBy(data, d=>d.uniquePatientKey);
        ret = cases.map(c=>{
            const trackDatum:Partial<HeatmapTrackDatum> = {};
            trackDatum.patient = c.patientId;
            trackDatum.uid = c.uniquePatientKey;
            const data = keyToData[c.uniquePatientKey];
            fillHeatmapTrackDatum(trackDatum, hugoGeneSymbol, c, data);
            return trackDatum as HeatmapTrackDatum;
        });
    }
    return ret;
}
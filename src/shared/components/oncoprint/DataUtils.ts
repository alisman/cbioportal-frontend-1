import {
    AlterationData, CaseAggregatedData,
    GenePanelInformation
} from "../../../pages/resultsView/ResultsViewPageStore";
import {
    GeneMolecularData, GenePanelData, MolecularProfile, Mutation, Patient,
    Sample
} from "../../api/generated/CBioPortalAPI";
import {GeneticTrackDatum} from "./Oncoprint";
import {isSample, isSampleList} from "../../lib/CBioPortalAPIUtils";
import {getSimplifiedMutationType, SimplifiedMutationType} from "../../lib/oql/accessors";

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
    molecularProfileIdToMolecularProfile:{[molecularProfileId:string]:MolecularProfile},
    data:AlterationData[],
    isPutativeDriver?:(datum:Mutation)=>boolean
):void {
    newDatum.gene = hugoGeneSymbol;
    newDatum.data = data;

    let dispFusion = false;
    const dispCnaCounts:{[cnaEvent:string]:number} = {};
    const dispMrnaCounts:{[mrnaEvent:string]:number} = {};
    const dispProtCounts:{[protEvent:string]:number} = {};
    const dispMutCounts:{[mutType:string]:number} = {};

    for (const event of data) {
        const molecularAlterationType = molecularProfileIdToMolecularProfile[event.molecularProfileId].molecularAlterationType;
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
                if ((event as any).oql_regulation_direction /* todo */) {
                    const mrnaEvent = (event as any).oql_regulation_direction === 1 ? "up" : "down";
                    dispMrnaCounts[mrnaEvent] = dispMrnaCounts[mrnaEvent] || 0;
                    dispMrnaCounts[mrnaEvent] += 1;
                }
                break;
            case "PROTEIN_LEVEL":
                if ((event as any).oql_regulation_direction /* todo */) {
                    const protEvent = (event as any).oql_regulation_direction === 1 ? "up" : "down";
                    dispProtCounts[protEvent] = dispProtCounts[protEvent] || 0;
                    dispProtCounts[protEvent] += 1;
                }
                break;
            case "MUTATION_EXTENDED":
                let oncoprintMutationType = getOncoprintMutationType(getSimplifiedMutationType((event as Mutation).mutationType)!);
                if (oncoprintMutationType === "fusion") {
                    dispFusion = true;
                } else {
                    if (isPutativeDriver && isPutativeDriver(event as Mutation)) {
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
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>["samples"],
    hugoGeneSymbols:string[],
    samples:Sample[],
    molecularProfileIdToMolecularProfile:{[molecularProfileId:string]:MolecularProfile},
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[];

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>["patients"],
    hugoGeneSymbols:string[],
    patients:Patient[],
    molecularProfileIdToMolecularProfile:{[molecularProfileId:string]:MolecularProfile},
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[];

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>["samples"]|CaseAggregatedData<AlterationData>["patients"],
    hugoGeneSymbols:string[],
    cases:Sample[]|Patient[],
    molecularProfileIdToMolecularProfile:{[molecularProfileId:string]:MolecularProfile},
    genePanelInformation:GenePanelInformation,
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[] {
    if (!cases.length) {
        return [];
    }
    const ret:GeneticTrackDatum[] = [];
    if (isSampleList(cases)) {
        // case: Samples
        for (const gene of hugoGeneSymbols) {
            for (const sample of cases) {
                const newDatum:Partial<GeneticTrackDatum> = {};
                newDatum.sample = sample.sampleId;
                newDatum.study_id = sample.studyId;
                newDatum.uid = sample.uniqueSampleKey;

                if (!genePanelInformation.samples[sample.uniqueSampleKey] ||
                    !genePanelInformation.samples[sample.uniqueSampleKey][gene]) {
                    //todo: uncomment this when you figure out WXS //newDatum.na = true;
                } else {
                    newDatum.coverage = genePanelInformation.samples[sample.uniqueSampleKey][gene];
                }
                fillGeneticTrackDatum(
                    newDatum, gene,
                    molecularProfileIdToMolecularProfile,
                    caseAggregatedAlterationData[sample.uniqueSampleKey],
                    isPutativeDriver
                );
                ret.push(newDatum as GeneticTrackDatum);
            }
        }
    } else {
        // case: Patients
        for (const gene of hugoGeneSymbols) {
            for (const patient of cases) {
                const newDatum:Partial<GeneticTrackDatum> = {};
                newDatum.patient = patient.patientId;
                newDatum.study_id = patient.studyId;
                newDatum.uid = patient.uniquePatientKey

                if (!genePanelInformation.patients[patient.uniquePatientKey] ||
                    !genePanelInformation.patients[patient.uniquePatientKey][gene]) {
                    //todo: uncomment this when you figure out WXS //newDatum.na = true;
                } else {
                    newDatum.coverage = genePanelInformation.patients[patient.uniquePatientKey][gene];
                }
                fillGeneticTrackDatum(
                    newDatum, gene,
                    molecularProfileIdToMolecularProfile,
                    caseAggregatedAlterationData[patient.uniquePatientKey],
                    isPutativeDriver
                );
                ret.push(newDatum as GeneticTrackDatum);
            }
        }
    }
    return ret;
}
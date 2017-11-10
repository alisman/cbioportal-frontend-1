import {AlterationData, CaseAggregatedData} from "../../../pages/resultsView/ResultsViewPageStore";
import {GenePanelData, Mutation, Patient, Sample} from "../../api/generated/CBioPortalAPI";
import {GeneticTrackDatum} from "./Oncoprint";

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

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>,
    genes:string[],
    samples:Sample[],
    genePanelInformation:{[molecularProfileId:string]:CaseAggregatedData<GenePanelData>},
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[];

export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>,
    genes:string[],
    patients:Patient[],
    genePanelInformation:{[molecularProfileId:string]:CaseAggregatedData<GenePanelData>},
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[];


export function makeGeneticTrackData(
    caseAggregatedAlterationData:CaseAggregatedData<AlterationData>,
    genes:string[],
    cases:Sample[]|Patient[],
    genePanelInformation:{[molecularProfileId:string]:CaseAggregatedData<GenePanelData>},
    isPutativeDriver?:(datum:Mutation)=>boolean
):GeneticTrackDatum[] {
    // Gather data by id and gene
    var gene_id_study_to_datum = {};
    var studies = Object.keys(study_to_id_map);
    for (var i = 0; i < genes.length; i++) {
        var gene = genes[i].toUpperCase();
        for (var j = 0; j < studies.length; j++) {
            var study = studies[j];
            var ids = study_to_id_map[study];
            for (var h = 0; h < ids.length; h++) {
                var id = ids[h];
                var new_datum = {};
                new_datum['gene'] = gene;
                new_datum[sample_or_patient] = id;
                new_datum['data'] = [];
                new_datum['study_id'] = study;
                new_datum['uid'] = case_uid_map[study][id];

                if (typeof sequencing_data === "undefined") {
                    new_datum['coverage'] = undefined;
                } else if (typeof sequencing_data[study][id] === "undefined" ||
                    typeof sequencing_data[study][id][gene] === "undefined") {
                    new_datum['na'] = true;
                } else {
                    new_datum['coverage'] = Object.keys(sequencing_data[study][id][gene]);
                }
                gene_id_study_to_datum[gene+','+id+','+study] = new_datum;
            }
        }
    }
    for (var i = 0; i < webservice_data.length; i++) {
        var datum = webservice_data[i];
        var gene = datum.hugo_gene_symbol.toUpperCase();
        var study = datum.study_id;
        var id = (sample_or_patient === "patient" ? sample_to_patient_map[study][datum.sample_id] : datum.sample_id);
        var gene_id_datum = gene_id_study_to_datum[gene + "," + id + "," + study];
        if (gene_id_datum) {
            gene_id_datum.data.push(datum);
        }
    }

    // Compute display parameters
    var data = objectValues(gene_id_study_to_datum);
    var cna_profile_data_to_string = {
        "-2": "homdel",
        "-1": "hetloss",
        "0": undefined,
        "1": "gain",
        "2": "amp"
    };
    var mut_rendering_priority = {'trunc_rec':1, 'inframe_rec':2, 'missense_rec':3, 'trunc': 4, 'inframe': 5, 'missense': 6};
    var cna_rendering_priority = {'amp': 0, 'homdel': 0, 'gain': 1, 'hetloss': 1};
    var mrna_rendering_priority = {'up': 0, 'down': 0};
    var prot_rendering_priority = {'up': 0, 'down': 0};

    for (var i = 0; i < data.length; i++) {
        var datum = data[i];
        var datum_events = datum.data;

        var disp_fusion = false;
        var disp_cna_counts = {};
        var disp_mrna_counts = {};
        var disp_prot_counts = {};
        var disp_mut_counts = {};

        for (var j = 0; j < datum_events.length; j++) {
            var event = datum_events[j];
            if (event.genetic_alteration_type === "COPY_NUMBER_ALTERATION") {
                var cna_event = cna_profile_data_to_string[event.profile_data];
                disp_cna_counts[cna_event] = disp_cna_counts[cna_event] || 0;
                disp_cna_counts[cna_event] += 1;
            } else if (event.genetic_alteration_type === "MRNA_EXPRESSION") {
                if (event.oql_regulation_direction) {
                    var mrna_event = (event.oql_regulation_direction === 1 ? "up" : "down");
                    disp_mrna_counts[mrna_event] = disp_mrna_counts[mrna_event] || 0;
                    disp_mrna_counts[mrna_event] += 1;
                }
            } else if (event.genetic_alteration_type === "PROTEIN_LEVEL") {
                if (event.oql_regulation_direction) {
                    var prot_event = (event.oql_regulation_direction === 1 ? "up" : "down");
                    disp_prot_counts[prot_event] = disp_prot_counts[prot_event] || 0;
                    disp_prot_counts[prot_event] += 1;
                }
            } else if (event.genetic_alteration_type === "MUTATION_EXTENDED") {
                var oncoprint_mutation_type = event.oncoprint_mutation_type;
                if (use_putative_driver && event.putative_driver) {
                    oncoprint_mutation_type += "_rec";
                }
                if (oncoprint_mutation_type === "fusion") {
                    disp_fusion = true;
                } else {
                    disp_mut_counts[oncoprint_mutation_type] = disp_mut_counts[oncoprint_mutation_type] || 0;
                    disp_mut_counts[oncoprint_mutation_type] += 1;
                }
            }
        }
        if (disp_fusion) {
            datum.disp_fusion = true;
        }
        datum.disp_cna = selectDisplayValue(disp_cna_counts, cna_rendering_priority);
        datum.disp_mrna = selectDisplayValue(disp_mrna_counts, mrna_rendering_priority);
        datum.disp_prot = selectDisplayValue(disp_prot_counts, prot_rendering_priority);
        datum.disp_mut = selectDisplayValue(disp_mut_counts, mut_rendering_priority);
    }
    return data;
}

function makeGeneticTrackData__old(api_data:AlterationData[], genes:string[], cases:Sample[]|Patient[], sample_or_patient, sample_to_patient_map, case_uid_map, sequencing_data, use_putative_driver) {

};
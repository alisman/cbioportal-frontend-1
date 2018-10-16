import * as _ from "lodash";
import {getMolecularProfiles} from "./ResultsViewPageStoreUtils";
import {runInAction} from "mobx";
import {ResultsViewPageStore, SamplesSpecificationElement} from "./ResultsViewPageStore";
import client from "../../shared/api/cbioportalClientInstance";
import sessionServiceClient from "../../shared/api/sessionServiceInstance";
import {CancerStudy} from "../../shared/api/generated/CBioPortalAPI";
import {VirtualStudy} from "../../shared/model/VirtualStudy";

export function updateStoreFromQuery(resultsViewPageStore:ResultsViewPageStore, query:any,
                                     samplesSpecification:SamplesSpecificationElement[], cancerStudyIds:string[], oql:string, cohortIdsList:string[]){

        if (!resultsViewPageStore.samplesSpecification || !_.isEqual(resultsViewPageStore.samplesSpecification.slice(), samplesSpecification)) {
            resultsViewPageStore.samplesSpecification = samplesSpecification;
        }

        // set the study Ids
        if (resultsViewPageStore._selectedStudyIds !== cancerStudyIds) {
            resultsViewPageStore._selectedStudyIds = cancerStudyIds;
        }

        // sometimes the submitted case_set_id is not actually a case_set_id but
        // a category of case set ids (e.g. selected studies > 1 and case category selected)
        // in that case, note that on the query
        if (query.case_set_id && ["w_mut","w_cna","w_mut_cna"].includes(query.case_set_id)) {
            if (resultsViewPageStore.sampleListCategory !== query.case_set_id) {
                resultsViewPageStore.sampleListCategory = query.case_set_id;
            }
        } else {
            resultsViewPageStore.sampleListCategory = undefined;
        }

        if (query.data_priority !== undefined && parseInt(query.data_priority,10) !== resultsViewPageStore.profileFilter) {
            resultsViewPageStore.profileFilter = parseInt(query.data_priority,10);
        }

        // note that this could be zero length if we have multiple studies
        // in that case we derive default selected profiles
        const profiles = getMolecularProfiles(query);
        if (!resultsViewPageStore.selectedMolecularProfileIds || !_.isEqual(resultsViewPageStore.selectedMolecularProfileIds.slice(), profiles)) {
            resultsViewPageStore.selectedMolecularProfileIds = profiles;
        }

        if (!_.isEqual(query.RPPA_SCORE_THRESHOLD, resultsViewPageStore.rppaScoreThreshold)) {
            resultsViewPageStore.rppaScoreThreshold = parseFloat(query.RPPA_SCORE_THRESHOLD);
        }

        if (!_.isEqual(query.Z_SCORE_THRESHOLD, resultsViewPageStore.zScoreThreshold)) {
            resultsViewPageStore.zScoreThreshold = parseFloat(query.Z_SCORE_THRESHOLD);
        }

        if (query.geneset_list) {
            // we have to trim because for some reason we get a single space from submission
            const parsedGeneSetList = query.geneset_list.trim().length ? (query.geneset_list.trim().split(/\s+/)) : [];
            if (!_.isEqual(parsedGeneSetList, resultsViewPageStore.genesetIds)) {
                resultsViewPageStore.genesetIds = parsedGeneSetList;
            }
        }

        // cohortIdsList will contain virtual study ids (physicalstudies will contain the phsyical studies which comprise the virtual studies)
        // although resultsViewStore doesn
        if (!resultsViewPageStore.cohortIdsList || !_.isEqual(resultsViewPageStore.cohortIdsList.slice(), cohortIdsList)) {
            resultsViewPageStore.cohortIdsList = cohortIdsList;
        }

        if (resultsViewPageStore.oqlQuery !== oql) {
            resultsViewPageStore.oqlQuery = oql;
        }

}

export function getVirtualStudies(cancerStudyIds:string[]):Promise<VirtualStudy[]>{

    const prom = new Promise<VirtualStudy[]>((resolve, reject)=>{
        client.getAllStudiesUsingGET({projection:"SUMMARY"}).then((allStudies)=>{
            //console.log(cancerStudyIds);
            //console.log(allStudies);
            const virtualStudyIds = _.differenceWith(cancerStudyIds, allStudies,(id:string, study:CancerStudy)=>id==study.studyId);

            if (virtualStudyIds.length > 0) {
                Promise.all(virtualStudyIds.map(id =>  sessionServiceClient.getVirtualStudy(id)))
                    .then((virtualStudies)=>{
                         resolve(virtualStudies);
                    })
            } else {
                resolve([]);
            }
        });
    });
    return prom;

}
import URL from 'url';
import * as _ from 'lodash';
import CBioPortalAPI from "../../../shared/api/generated/CBioPortalAPI";
import { ClinicalDataBySampleId } from "../../../shared/api/api-types-extended";
import {ClinicalData} from "../../../shared/api/generated/CBioPortalAPI";
import {ClinicalInformationData} from "shared/model/ClinicalInformation";
import {getCbioPortalApiUrl} from "../../../shared/api/urls";
import {PatientWithClinicalData} from "../../../shared/model/PatientWithClinicalData";
//import { getTreeNodesFromClinicalData, PDXNode } from './PDXTree';
//import sampleQuery from 'shared/api/mock/Samples_query_patient_P04.json';

export function groupByEntityId(clinicalDataArray: Array<ClinicalData>) {

    return _.map(
        _.groupBy(clinicalDataArray, 'entityId'),
        (v:ClinicalData[], k:string):ClinicalDataBySampleId => ({
            clinicalData: v,
            id: k,
        })
    );

}


/*
 * Transform clinical data from API to clinical data shape as it will be stored
 * in the store
 */
function transformClinicalInformationToStoreShape(patientId: string, studyId: string, clinicalDataPatient: Array<ClinicalData>, clinicalDataSample: Array<ClinicalData>):ClinicalInformationData {
    const patient: PatientWithClinicalData = {
        id: patientId,
        clinicalData: clinicalDataPatient,
        studyId:studyId
    };

    const samples = groupByEntityId(clinicalDataSample);

    return {
        patient,
        samples
    };
}

const tsClient = new CBioPortalAPI(getCbioPortalApiUrl());

export default async function getClinicalInformationData():Promise<ClinicalInformationData> {
    const qs = URL.parse(location.href, true).query;

    const studyId = qs['cancer_study_id'] + '';
    const patientId = qs['case_id'] + '';

    if (!studyId || !patientId)
        throw new Error("cancer_study_id and case_id are required page query parameters");

    const clinicalDataPatientPromise = tsClient.getAllClinicalDataOfPatientInStudyUsingGET({
        projection: 'DETAILED',
        studyId,
        patientId
    });

    const samplesOfPatient = await tsClient.getAllSamplesOfPatientInStudyUsingGET({
        studyId,
        patientId
    });

    const clinicalDataSample = await tsClient.fetchClinicalDataUsingPOST({
        clinicalDataType: 'SAMPLE',
        identifiers: samplesOfPatient.map(sample => ({
            entityId: sample.sampleId,
            studyId
        })),
        projection: 'DETAILED',
    });

    return transformClinicalInformationToStoreShape(
        patientId,
        studyId,
        await clinicalDataPatientPromise,
        clinicalDataSample
    );
}

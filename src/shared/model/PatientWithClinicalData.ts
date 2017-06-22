import {ClinicalData} from "../api/generated/CBioPortalAPI";
export type PatientWithClinicalData = {
    id: string,
    clinicalData: ClinicalData[],
    studyId:string
}
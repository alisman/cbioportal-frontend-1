import {ClinicalDataBySampleId} from "shared/api/api-types-extended";
import {PatientWithClinicalData} from "./PatientWithClinicalData";

export type ClinicalInformationData = {
    patient?: PatientWithClinicalData,
    samples?: ClinicalDataBySampleId[],
    nodes?: any[]//PDXNode[],
};

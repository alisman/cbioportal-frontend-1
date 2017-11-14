import {GeneMolecularData, Mutation, Patient, Sample} from "../api/generated/CBioPortalAPI";

export function isMutation(datum:Mutation|GeneMolecularData): datum is Mutation {
    return datum.hasOwnProperty("mutationType");
}

export function isSample(datum:Sample|Patient): datum is Sample {
    return datum.hasOwnProperty("sampleId");
}

export function isSampleList(data:Sample[]|Patient[]):data is Sample[] {
    return !data.length || isSample(data[0]);
}
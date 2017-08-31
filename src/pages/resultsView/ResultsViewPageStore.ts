import {
    DiscreteCopyNumberFilter, DiscreteCopyNumberData, Mutation, Gene, GeneticDataFilter, GeneticProfile, GeneGeneticData
} from "shared/api/generated/CBioPortalAPI";
import client from "shared/api/cbioportalClientInstance";
import {computed, observable, action} from "mobx";
import {remoteData, addErrorHandler} from "shared/api/remoteData";
import {labelMobxPromises, cached} from "mobxpromise";
import OncoKbEvidenceCache from "shared/cache/OncoKbEvidenceCache";
import PubMedCache from "shared/cache/PubMedCache";
import CancerTypeCache from "shared/cache/CancerTypeCache";
import MutationCountCache from "shared/cache/MutationCountCache";
import DiscreteCNACache from "shared/cache/DiscreteCNACache";
import PdbHeaderCache from "shared/cache/PdbHeaderCache";
import {
    findGeneticProfileIdDiscrete, fetchMyCancerGenomeData,
    fetchDiscreteCNAData, findMutationGeneticProfileId, mergeDiscreteCNAData,
    fetchSamples, fetchClinicalDataInStudy, generateDataQueryFilter,
    fetchSamplesWithoutCancerTypeClinicalData, fetchStudiesForSamplesWithoutCancerTypeClinicalData
} from "shared/lib/StoreUtils";
import {MutationMapperStore} from "./mutation/MutationMapperStore";
import AppConfig from "appConfig";
import * as _ from 'lodash';
import accessors from "../../shared/lib/oql/accessors";
import {filterCBioPortalWebServiceData} from "../../shared/lib/oql/oqlfilter";
import {keepAlive} from "mobx-utils";


export function ourCached<T>(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {
    keepAlive(target, propertyKey);
}


export class ResultsViewPageStore {

    constructor() {
        labelMobxPromises(this);

        addErrorHandler((error: any) => {
            this.ajaxErrors.push(error);
        });
    }

    @observable public urlValidationError: string | null = null;

    @observable ajaxErrors: Error[] = [];

    @observable zScoreThreshold: number;

    @observable rppaScoreThreshold: number;

    @observable studyId: string = '';

    @observable sampleListId: string|null = null;

    @observable hugoGeneSymbols: string[]|null;

    @observable sampleList: string[]|null = null;

    @observable oqlQuery: string = '';

    @observable selectedGeneticProfileIds: string[] = [];

    readonly mutationGeneticProfileId = remoteData({
        await: () => [
            this.geneticProfilesInStudy
        ],
        invoke: async() => findMutationGeneticProfileId(this.geneticProfilesInStudy, this.studyId)
    });

    @computed get myCancerGenomeData() {
        return fetchMyCancerGenomeData();
    }

    protected mutationMapperStores: {[hugoGeneSymbol: string]: MutationMapperStore} = {};

    public getMutationMapperStore(hugoGeneSymbol: string): MutationMapperStore|undefined {
        if (this.mutationMapperStores[hugoGeneSymbol]) {
            return this.mutationMapperStores[hugoGeneSymbol];
        }
        else if (!this.hugoGeneSymbols || !this.hugoGeneSymbols.find((gene: string) => gene === hugoGeneSymbol)) {
            return undefined;
        }
        else {
            const store = new MutationMapperStore(AppConfig,
                hugoGeneSymbol,
                this.mutationGeneticProfileId,
                this.sampleIds,
                this.clinicalDataForSamples,
                this.studiesForSamplesWithoutCancerTypeClinicalData,
                this.samplesWithoutCancerTypeClinicalData,
                this.sampleListId,
                this.germlineConsentedSampleIds);

            this.mutationMapperStores[hugoGeneSymbol] = store;

            return store;
        }
    }

    readonly sampleIds = remoteData(async() => {
        // first priority: user provided custom sample list
        if (this.sampleList) {
            // cannot return an observable array directly, need to create a copy
            return this.sampleList.map(sampleId => sampleId);
        }
        // if no custom sample list try to fetch sample ids from the API
        else if (this.sampleListId) {
            return await client.getAllSampleIdsInSampleListUsingGET({
                sampleListId: this.sampleListId
            });
        }

        return [];
    }, []);

    readonly clinicalDataForSamples = remoteData({
        await: () => [
            this.sampleIds
        ],
        invoke: () => {
            const clinicalDataSingleStudyFilter = {
                attributeIds: ["CANCER_TYPE", "CANCER_TYPE_DETAILED"],
                ids: this.sampleIds.result
            };
            return fetchClinicalDataInStudy(this.studyId, clinicalDataSingleStudyFilter, 'SAMPLE')
        }
    }, []);

    readonly germlineConsentedSampleIds = remoteData({
        invoke: async() => {
            if (this.germlineSampleListId) {
                return await client.getAllSampleIdsInSampleListUsingGET({
                    sampleListId: this.germlineSampleListId
                });
            } else {
                return [];
            }
        },
        onError: () => {
            // fail silently
        }
    }, []);

    readonly samples = remoteData({
        await: () => [
            this.sampleIds
        ],
        invoke: async() => fetchSamples(this.sampleIds, this.studyId)
    }, []);

    readonly samplesWithoutCancerTypeClinicalData = remoteData({
        await: () => [
            this.sampleIds,
            this.clinicalDataForSamples
        ],
        invoke: async() => fetchSamplesWithoutCancerTypeClinicalData(this.sampleIds, this.studyId, this.clinicalDataForSamples)
    }, []);

    readonly studiesForSamplesWithoutCancerTypeClinicalData = remoteData({
        await: () => [
            this.samplesWithoutCancerTypeClinicalData
        ],
        invoke: async() => fetchStudiesForSamplesWithoutCancerTypeClinicalData(this.samplesWithoutCancerTypeClinicalData)
    }, []);

    readonly studies = remoteData({
        invoke: async() => ([await client.getStudyUsingGET({studyId: this.studyId})])
    }, []);

    @computed get germlineSampleListId(): string|undefined {
        if (this.studyId) {
            return `${this.studyId}_germline`;
        }
        else {
            return undefined;
        }
    }

    readonly selectedGeneticProfiles = remoteData(() => {
        return Promise.all(this.selectedGeneticProfileIds.map((id) => client.getGeneticProfileUsingGET({geneticProfileId: id})));
    });

    readonly geneticProfilesInStudy = remoteData(() => {
        return client.getAllGeneticProfilesInStudyUsingGET({
            studyId: this.studyId
        });
    }, []);

    //NOTE: this can only be invoked after mutationMapperStores is populated.  not great.
    readonly allMutations = remoteData({
        await: () =>
            _.flatMap(this.mutationMapperStores, (store: MutationMapperStore) => store.mutationData)
        ,
        invoke: async() => {
            return _.mapValues(this.mutationMapperStores, (store: MutationMapperStore) => store.mutationData.result);
        }
    });

    readonly geneticData = remoteData({
        await: () => [
            this.dataQueryFilter,
            this.genes,
            this.selectedGeneticProfiles
        ],
        invoke: async() => {
            // we get mutations with mutations endpoint, all other alterations with this one, so filter out mutation genetic profile
            const profilesWithoutMutationProfile = _.filter(this.selectedGeneticProfiles.result, (profile: GeneticProfile) => profile.geneticAlterationType !== 'MUTATION_EXTENDED');
            if (profilesWithoutMutationProfile) {
                const promises:Promise<GeneGeneticData[]>[] = profilesWithoutMutationProfile.map((profile: GeneticProfile) => {
                    const filter:GeneticDataFilter = (Object.assign({}, { entrezGeneIds:this.genes.result!.map(gene => gene.entrezGeneId) }, this.dataQueryFilter.result!) as GeneticDataFilter);
                    return client.fetchAllGeneticDataInGeneticProfileUsingPOST({
                        geneticProfileId: profile.geneticProfileId,
                        geneticDataFilter: filter,
                        projection: 'DETAILED'
                    });
                });
                return Promise.all(promises).then((arrs: GeneGeneticData[][]) => _.concat(...arrs));
            } else {
                return [];
            }
        }
    });

    readonly filteredAlterations = remoteData({
        await: () => [
            this.allMutations,
            this.selectedGeneticProfiles,
            this.geneticData,
            this.defaultOQLQuery
        ],
        invoke: async() => {

            //const filteredItems = filterCBioPortalWebServiceData(this.oqlQuery, this.geneticData.result, (new accessors(this.selectedGeneticProfiles.result)));

            const filteredItemsByGene = _.groupBy(this.geneticData.result, (item: GeneGeneticData) => item.gene.hugoGeneSymbol);

            // now merge alterations with mutations by gene
            const mergedAlterationsByGene = _.mapValues(this.allMutations.result, (mutations: Mutation[], gene: string) => {
                // if for some reason it doesn't exist, assign empty array;
                return (gene in filteredItemsByGene) ? _.concat(mutations, filteredItemsByGene[gene]) : [];
            });
            const ret = _.mapValues(mergedAlterationsByGene, (mutations: (Mutation|GeneGeneticData)[]) => {
                return filterCBioPortalWebServiceData(this.oqlQuery, mutations, (new accessors(this.selectedGeneticProfiles.result)), this.defaultOQLQuery.result)
            });

            return ret;
        }
    });

    readonly defaultOQLQuery = remoteData({
        await: () => [this.selectedGeneticProfiles],
        invoke: () => {
            const all_profile_types = _.map(this.selectedGeneticProfiles.result,(profile)=>profile.geneticAlterationType);
            var default_oql_uniq: any = {};
            for (var i = 0; i < all_profile_types.length; i++) {
                var type = all_profile_types[i];
                switch (type) {
                    case "MUTATION_EXTENDED":
                        default_oql_uniq["MUT"] = true;
                        default_oql_uniq["FUSION"] = true;
                        break;
                    case "COPY_NUMBER_ALTERATION":
                        default_oql_uniq["AMP"] = true;
                        default_oql_uniq["HOMDEL"] = true;
                        break;
                    case "MRNA_EXPRESSION":
                        default_oql_uniq["EXP>=" + this.zScoreThreshold] = true;
                        default_oql_uniq["EXP<=-" + this.zScoreThreshold] = true;
                        break;
                    case "PROTEIN_LEVEL":
                        default_oql_uniq["PROT>=" + this.rppaScoreThreshold] = true;
                        default_oql_uniq["PROT<=-" + this.rppaScoreThreshold] = true;
                        break;
                }
            }
            return Promise.resolve(Object.keys(default_oql_uniq).join(" "));
        }

    });


    readonly filteredAlterationsAsSampleIdArrays = remoteData({
        await: () => [
            this.filteredAlterations
        ],
        invoke: async() => {
            return _.mapValues(this.filteredAlterations.result, (mutations: Mutation[]) => _.map(mutations, 'sampleId'));
        }
    });

    readonly isSampleAlteredMap = remoteData({
        await: () => [this.filteredAlterationsAsSampleIdArrays, this.sampleIds],
        invoke: async() => {
            return _.mapValues(this.filteredAlterationsAsSampleIdArrays.result, (sampleIds: string[]) => {
                return this.sampleIds.result.map((sampleId: string) => {
                    return _.includes(sampleIds, sampleId);
                });
            });
        }
    });

    readonly genes = remoteData(async() => {
        if (this.hugoGeneSymbols) {
            return client.fetchGenesUsingPOST({
                geneIds: this.hugoGeneSymbols.peek(),
                geneIdType: "HUGO_GENE_SYMBOL"
            });
        }
        return undefined;
    });

    readonly geneticProfileIdDiscrete = remoteData({
        await: () => [
            this.geneticProfilesInStudy
        ],
        invoke: async() => {
            return findGeneticProfileIdDiscrete(this.geneticProfilesInStudy);
        }
    });

    // readonly geneticData = remoteData({
    //     await: () => [
    //         this.geneticProfileIdDiscrete,
    //         this.dataQueryFilter,
    //         this.genes
    //     ],
    //     invoke: async() => {
    //
    //         const filter = this.dataQueryFilter.result as GeneticDataFilter;
    //         const f = filter.asMutable();
    //         f.entrezGeneIds = this.genes.result.map(gene=>gene.entrezGeneId);
    //
    //         return client.fetchAllGeneticDataInGeneticProfileUsingPOST({
    //             geneticProfileId:(this.geneticProfileIdDiscrete.result as string),
    //             geneticDataFilter:f
    //         });
    //
    //     }
    // }, []);

    readonly dataQueryFilter = remoteData({
        await: () => [
            this.sampleIds
        ],
        invoke: async() => generateDataQueryFilter(this.sampleListId, this.sampleIds.result)
    });

    // @computed get mergedDiscreteCNAData(): DiscreteCopyNumberData[][] {
    //     return mergeDiscreteCNAData(this.discreteCNAData);
    // }

    @cached get oncoKbEvidenceCache() {
        return new OncoKbEvidenceCache();
    }

    @cached get pubMedCache() {
        return new PubMedCache();
    }

    @cached get discreteCNACache() {
        console.log("instantiating");
        return new DiscreteCNACache(this.geneticProfileIdDiscrete.result);
    }

    @cached get cancerTypeCache() {
        return new CancerTypeCache(this.studyId);
    }

    @cached get mutationCountCache() {
        return new MutationCountCache(this.mutationGeneticProfileId.result);
    }

    @cached get pdbHeaderCache() {
        return new PdbHeaderCache();
    }

    @action clearErrors() {
        this.ajaxErrors = [];
    }
}

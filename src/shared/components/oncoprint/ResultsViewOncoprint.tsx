import * as React from "react";
import {Observer, observer} from "mobx-react";
import {
    action,
    computed,
    IObservableObject,
    IReactionDisposer,
    observable,
    ObservableMap,
    reaction,
    runInAction
} from "mobx";
import {remoteData} from "public-lib/api/remoteData";
import Oncoprint, {GENETIC_TRACK_GROUP_INDEX, IHeatmapTrackSpec} from "./Oncoprint";
import OncoprintControls, {
    IOncoprintControlsHandlers,
    IOncoprintControlsState,
    ISelectOption
} from "shared/components/oncoprint/controls/OncoprintControls";
import {Gene, MolecularProfile, Sample} from "../../api/generated/CBioPortalAPI";
import {ResultsViewPageStore, AlterationTypeConstants} from "../../../pages/resultsView/ResultsViewPageStore";
import {
    getAlteredUids,
    getUnalteredUids,
    makeClinicalTracksMobxPromise,
    makeGenesetHeatmapExpansionsMobxPromise,
    makeGenesetHeatmapTracksMobxPromise,
    makeGeneticTracksMobxPromise,
    makeHeatmapTracksMobxPromise,
    makeTreatmentProfileHeatmapTracksMobxPromise
} from "./OncoprintUtils";
import _ from "lodash";
import onMobxPromise from "shared/lib/onMobxPromise";
import AppConfig from "appConfig";
import LoadingIndicator from "shared/components/loadingIndicator/LoadingIndicator";
import OncoprintJS, {TrackGroupHeader, TrackGroupIndex, TrackId} from "oncoprintjs";
import fileDownload from 'react-file-download';
import svgToPdfDownload from "public-lib/lib/svgToPdfDownload";
import tabularDownload from "./tabularDownload";
import classNames from 'classnames';
import FadeInteraction from "public-lib/components/fadeInteraction/FadeInteraction";
import {clinicalAttributeIsLocallyComputed, SpecialAttribute} from "../../cache/ClinicalDataCache";
import OqlStatusBanner from "../banners/OqlStatusBanner";
import {getAnnotatingProgressMessage, treatmentsToSelectOptions} from "./ResultsViewOncoprintUtils";
import ProgressIndicator, {IProgressIndicatorItem} from "../progressIndicator/ProgressIndicator";
import autobind from "autobind-decorator";
import getBrowserWindow from "../../../public-lib/lib/getBrowserWindow";
import {parseOQLQuery} from "../../lib/oql/oqlfilter";
import AlterationFilterWarning from "../banners/AlterationFilterWarning";
import { selectDisplayValue } from "./DataUtils";
import { Treatment } from "shared/api/generated/CBioPortalAPIInternal";
import WindowStore from "../window/WindowStore";
import {isWebdriver} from "../../../public-lib/lib/webdriverUtils";
import {MakeMobxView} from "../MobxView";

interface IResultsViewOncoprintProps {
    divId: string;
    store:ResultsViewPageStore;
    addOnBecomeVisibleListener?:(callback:()=>void)=>void;
}

export enum SortByUrlParamValue {
    CASE_ID = "case_id",
    CASE_LIST = "case_list",
    NONE = ""
}

export type SortMode = (
    {type:"data"|"alphabetical"|"caseList", clusteredHeatmapProfile?:undefined} |
    {type:"heatmap", clusteredHeatmapProfile:string}
);


export interface IGenesetExpansionRecord {
    entrezGeneId: number;
    hugoGeneSymbol: string;
    molecularProfileId: string;
    correlationValue: number;
}

const CLINICAL_TRACK_KEY_PREFIX = "CLINICALTRACK_";

/*  Each heatmap track group can hold tracks of a single entity type.
    Implemented entity types are genes and treatments. In the
    HeatmapTrackGroupRecord type the `entities` member refers to
    hugo_gene_symbols (for genes) or to treatment_id's (for treatments). */
export type HeatmapTrackGroupRecord = {
    trackGroupIndex:number,
    molecularAlterationType:string,
    entities: { [entity:string]:boolean }, // map of hugo_gene_symbols or treatment_id's
    molecularProfileId:string
}

/* fields and methods in the class below are ordered based on roughly
/* chronological setup concerns, rather than on encapsulation and public API */
/* tslint:disable: member-ordering */
@observer
export default class ResultsViewOncoprint extends React.Component<IResultsViewOncoprintProps, {}> {
    //@observable columnMode:"sample"|"patient" = "patient";

    @computed get columnMode(){
        return this.props.store.urlWrapper.query.show_samples === "true" ? "sample" : "patient";
    }

    @computed get sortMode() {
        let mode:SortMode;
        switch (this.props.store.urlWrapper.query.oncoprint_sortby) {
            case "case_id":
                mode = {type:"alphabetical"};
                break;
            case "case_list":
                mode = {type:"caseList"};
                break;
            case "cluster":
                mode = {type:"heatmap", clusteredHeatmapProfile:this.props.store.urlWrapper.query.oncoprint_cluster_profile};
                break;
            case "":
            default:
                mode = {type:"data"};
        }

        return mode;
    }

    @computed get sortByMutationType() {
        return !this.props.store.urlWrapper.query.oncoprint_sort_by_mutation_type || // on by default
            this.props.store.urlWrapper.query.oncoprint_sort_by_mutation_type === "true";
    }

    @computed get sortByDrivers() {
        return !this.props.store.urlWrapper.query.oncoprint_sort_by_drivers || // on by default
            this.props.store.urlWrapper.query.oncoprint_sort_by_drivers === "true";
    }

    @observable distinguishGermlineMutations:boolean = true;
    @observable distinguishMutationType:boolean = true;
    @observable showUnalteredColumns:boolean = true;
    @observable showWhitespaceBetweenColumns:boolean = true;
    @observable showClinicalTrackLegends:boolean = true;
    @observable _onlyShowClinicalLegendForAlteredCases = false;
    @observable showOqlInLabels = false;

    private selectedTreatmentsFromUrl:string[] = [];

    @computed get onlyShowClinicalLegendForAlteredCases() {
        return this.showClinicalTrackLegends && this._onlyShowClinicalLegendForAlteredCases;
    }

    @observable showMinimap:boolean = false;

    @observable selectedHeatmapProfile = "";
    @observable heatmapGeneInputValue = "";

    @observable horzZoom:number = 0.5;

    @observable mouseInsideBounds:boolean = false;

    @observable renderingComplete = false;

    private heatmapGeneInputValueUpdater:IReactionDisposer;

    private molecularProfileIdToHeatmapTrackGroupIndex:{[molecularProfileId:string]:number} = {};

    private isLoading_setRenderingCompleteTimeout:any = null;

    @computed get selectedClinicalAttributeIds() {

        const list = this.props.store.urlWrapper.query.clinicallist ?
            this.props.store.urlWrapper.query.clinicallist.split(',') : [];

        // when there is no user selection in ULR, we want to
        // have some default tracks based on certain conditions
        if (this.props.store.urlWrapper.query.clinicallist === undefined) {

            if(this.props.store.studyIds.result && this.props.store.studyIds.result.length > 1) {
                list.push(SpecialAttribute.StudyOfOrigin);
            }

            if (
                this.props.store.samples.result && this.props.store.patients.result &&
                (this.props.store.samples.result.length > this.props.store.patients.result.length)
            ) {
                list.push(SpecialAttribute.NumSamplesPerPatient);
            }

            _.forEach(this.props.store.clinicalAttributes_profiledIn.result,(attr)=>{
                list.push(attr.clinicalAttributeId);
            });

        }

        console.log("computing selectedClinicalAttributeIds");
        return list.reduce((acc, key)=>{
            acc.set(key, true);
            return acc;
        },observable.shallowMap<boolean>())
    }

    public expansionsByGeneticTrackKey = observable.map<number[]>();
    public expansionsByGenesetHeatmapTrackKey =
        observable.map<IGenesetExpansionRecord[]>();

    @computed get molecularProfileIdToHeatmapTracks(){

        // empty if no heatmap tracks param
        const groups = this.props.store.urlWrapper.query.heatmap_track_groups ?
            this.props.store.urlWrapper.query.heatmap_track_groups.split(";").map((x:string)=>x.split(",")) : [];

        const parsedGroups = groups.reduce((acc:{ [molecularProfileId:string]:string[]}, group)=>{
            acc[group[0] as string] = group.slice(1);
            return acc;
        }, {});

        const map: { [molecularProfileId:string] : HeatmapTrackGroupRecord } = {};

        let nextTrackGroupIndex:number;
        // start next track group index based on existing heatmap track groups
        if (_.isEmpty(this.molecularProfileIdToHeatmapTrackGroupIndex)) {
            nextTrackGroupIndex = 2;
        } else {
            nextTrackGroupIndex = Math.max(..._.values(this.molecularProfileIdToHeatmapTrackGroupIndex))+1;
        }
        _.forEach(parsedGroups, (entities:string[], molecularProfileId)=>{
            const profile:MolecularProfile = this.props.store.molecularProfileIdToMolecularProfile.result[molecularProfileId];
            if (profile && entities && entities.length) {
                if (!(profile.molecularProfileId in this.molecularProfileIdToHeatmapTrackGroupIndex)) {
                    // set track group index if doesnt yet exist
                    this.molecularProfileIdToHeatmapTrackGroupIndex[profile.molecularProfileId] = nextTrackGroupIndex;
                    nextTrackGroupIndex += 1;
                }
                const trackGroup: HeatmapTrackGroupRecord = {
                      trackGroupIndex: this.molecularProfileIdToHeatmapTrackGroupIndex[profile.molecularProfileId],
                      molecularProfileId: profile.molecularProfileId,
                      molecularAlterationType: profile.molecularAlterationType,
                      entities: {}
                };
                entities.forEach((entity: string) => trackGroup.entities[entity] = true);
                map[molecularProfileId] = trackGroup;
            }
        });

        return map;

    }

    public controlsHandlers:IOncoprintControlsHandlers;
    private controlsState:IOncoprintControlsState & IObservableObject;

    @observable.ref private oncoprint:OncoprintJS;

    private urlParamsReaction:IReactionDisposer;

    constructor(props:IResultsViewOncoprintProps) {
        super(props);

        this.showOqlInLabels = props.store.queryContainsOql;
        (window as any).resultsViewOncoprint = this;

        // The heatmap tracks can only be added when detailed information on
        // molecular profiles has been retrieved from the server.
        onMobxPromise(props.store.molecularProfileIdToMolecularProfile, (result:any)=>{
            this.initFromUrlParams(getBrowserWindow().globalStores.routing.location.query);
        });

        // onMobxPromise(props.store.studyIds, (studyIds:string[])=>{
        //     if (studyIds.length > 1) {
        //         this.selectedClinicalAttributeIds.set(SpecialAttribute.StudyOfOrigin, true);
        //     }
        // });
        // onMobxPromise([props.store.samples, props.store.patients], (samples:any[], patients:any[])=>{
        //     if (samples.length !== patients.length) {
        //         this.selectedClinicalAttributeIds.set(SpecialAttribute.NumSamplesPerPatient, true);
        //     }
        // });
        //
        // onMobxPromise(props.store.clinicalAttributes_profiledIn, (result:any[])=>{
        //     for (const attr of result) {
        //         this.selectedClinicalAttributeIds.set(attr.clinicalAttributeId, true);
        //     }
        // });
        const self = this;

        this.onChangeSelectedClinicalTracks = this.onChangeSelectedClinicalTracks.bind(this);
        this.onDeleteClinicalTrack = this.onDeleteClinicalTrack.bind(this);
        this.onMinimapClose = this.onMinimapClose.bind(this);
        this.oncoprintRef = this.oncoprintRef.bind(this);
        this.toggleColumnMode = this.toggleColumnMode.bind(this);
        this.onTrackSortDirectionChange = this.onTrackSortDirectionChange.bind(this);
        this.onSuppressRendering = this.onSuppressRendering.bind(this);
        this.onReleaseRendering = this.onReleaseRendering.bind(this);

        onMobxPromise(this.props.store.heatmapMolecularProfiles, (profiles:MolecularProfile[])=>{
            // select first initially
            if (profiles.length) {
                this.selectedHeatmapProfile = profiles[0].molecularProfileId;
            }
        });

        this.heatmapGeneInputValueUpdater = onMobxPromise(this.props.store.genes, (genes:Gene[])=>{
            this.heatmapGeneInputValue = genes.map(g=>g.hugoGeneSymbol).join(" ");
        }, Number.POSITIVE_INFINITY);

        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);

        // update URL parameters according to UI events
        // and trigger a page refresh
        // this.urlParamsReaction = reaction(
        //     ()=>[
        //         this.treatmentsUrlParam
        //     ],
        //     ()=>{
        //         const newParams = Object.assign({}, getBrowserWindow().globalStores.routing.location.query);
        //         // if (!this.heatmapTrackGroupsUrlParam) {
        //         //     delete newParams[HEATMAP_TRACKS_URL_PARAM];
        //         // } else {
        //         //     newParams[HEATMAP_TRACKS_URL_PARAM] = this.heatmapTrackGroupsUrlParam;
        //         // }
        //
        //         // if (!this.treatmentsUrlParam) {
        //         //     delete newParams[TREATMENT_LIST_URL_PARAM];
        //         // } else {
        //         //     newParams[TREATMENT_LIST_URL_PARAM] = this.treatmentsUrlParam;
        //         // }
        //         getBrowserWindow().globalStores.routing.updateRoute(newParams, undefined, true, true);
        //     }
        // );

        this.controlsHandlers = this.buildControlsHandlers();

        this.controlsState = observable({
            get selectedClinicalAttributeIds() {
                return self.selectedClinicalAttributeIds.keys();
            },
            get selectedColumnType() {
                return self.columnMode;
            },
            get showUnalteredColumns() {
                return self.showUnalteredColumns;
            },
            get showWhitespaceBetweenColumns() {
                return self.showWhitespaceBetweenColumns;
            },
            get showClinicalTrackLegends(){
                return self.showClinicalTrackLegends;
            },
            get onlyShowClinicalLegendForAlteredCases() {
                return self.onlyShowClinicalLegendForAlteredCases;
            },
            get showOqlInLabels() {
                return self.showOqlInLabels;
            },
            get showMinimap() {
                return self.showMinimap;
            },
            get hideHeatmapMenu() {
                return self.props.store.studies.result.length > 1;
            },
            get sortByMutationType() {
                return self.sortByMutationType;
            },
            get sortByCaseListDisabled() {
                return ! self.caseListSortPossible;
            },
            get distinguishMutationType() {
                return self.distinguishMutationType;
            },
            get distinguishDrivers() {
                return self.distinguishDrivers;
            },
            get distinguishGermlineMutations() {
                return self.distinguishGermlineMutations;
            },
            get annotateDriversOncoKb() {
                return self.props.store.driverAnnotationSettings.oncoKb;
            },
            get annotateDriversOncoKbDisabled() {
                return !AppConfig.serverConfig.show_oncokb;
            },
            get annotateDriversOncoKbError() {
                return self.props.store.didOncoKbFailInOncoprint;
            },
            get annotateDriversHotspots() {
                return self.props.store.driverAnnotationSettings.hotspots;
            },
            get annotateDriversHotspotsDisabled() {
                return !AppConfig.serverConfig.show_hotspot;
            },
            get annotateDriversHotspotsError() {
                return self.props.store.didHotspotFailInOncoprint;
            },
            get annotateDriversCBioPortal() {
                return self.props.store.driverAnnotationSettings.cbioportalCount;
            },
            get annotateDriversCOSMIC() {
                return self.props.store.driverAnnotationSettings.cosmicCount;
            },
            get hidePutativePassengers() {
                return self.props.store.driverAnnotationSettings.excludeVUS;
            },
            get hideGermlineMutations() {
                return self.props.store.excludeGermlineMutations;
            },
            get annotateCBioPortalInputValue() {
                return self.props.store.driverAnnotationSettings.cbioportalCountThreshold + "";
            },
            get annotateCOSMICInputValue() {
                return self.props.store.driverAnnotationSettings.cosmicCountThreshold + "";
            },
            get sortMode() {
                return self.sortMode;
            },
            get sortByDrivers() {
                return self.sortByDrivers;
            },
            get heatmapProfilesPromise() {
                return self.props.store.heatmapMolecularProfiles;
            },
            get treatmentsPromise() {
                return self.props.store.treatmentsInStudies;
            },
            get selectedHeatmapProfile() {
                return self.selectedHeatmapProfile;
            },
            get selectedHeatmapProfileAlterationType() {
                return self.selectedHeatmapProfileAlterationType;
            },
            get heatmapIsDynamicallyQueried () {
                return self.heatmapIsDynamicallyQueried;
            },
            get heatmapGeneInputValue() {
                return self.heatmapGeneInputValue;
            },
            get customDriverAnnotationBinaryMenuLabel() {
                const label = AppConfig.serverConfig.oncoprint_custom_driver_annotation_binary_menu_label;
                const customDriverReport = self.props.store.customDriverAnnotationReport.result;
                if (label && customDriverReport && customDriverReport.hasBinary) {
                    return label;
                } else {
                    return undefined;
                }
            },
            get customDriverAnnotationTiersMenuLabel() {
                const label = AppConfig.serverConfig.oncoprint_custom_driver_annotation_tiers_menu_label;
                const customDriverReport = self.props.store.customDriverAnnotationReport.result;
                if (label && customDriverReport && customDriverReport.tiers.length) {
                    return label;
                } else {
                    return undefined;
                }
            },
            get customDriverAnnotationTiers() {
                const customDriverReport = self.props.store.customDriverAnnotationReport.result;
                if (customDriverReport && customDriverReport.tiers.length) {
                    return customDriverReport.tiers;
                } else {
                    return undefined;
                }
            },
            get annotateCustomDriverBinary() {
                return self.props.store.driverAnnotationSettings.customBinary;
            },
            get selectedCustomDriverAnnotationTiers() {
                return self.props.store.driverAnnotationSettings.driverTiers;
            },
            get columnMode() {
                return self.columnMode;
            },
            get horzZoom() {
                if (isNaN(self.horzZoom)) {
                    return 1;
                } else {
                    return self.horzZoom;
                }
            },
            get selectedTreatmentsInit() {
                return self.selectedTreatmentsFromUrl;
            }
        });
    }

    @computed get caseListSortPossible():boolean {
        return !!(this.props.store.givenSampleOrder.isComplete && this.props.store.givenSampleOrder.result.length);
    }

    @computed get distinguishDrivers() {
        return this.props.store.driverAnnotationSettings.driversAnnotated;
    }

    onMouseEnter(){
        this.mouseInsideBounds = true;
    }

    onMouseLeave(){
        this.mouseInsideBounds = false;
    }

    @action
    public selectHeatmapProfile(index:number) {
        onMobxPromise(this.props.store.heatmapMolecularProfiles, (profiles:MolecularProfile[])=>{
            this.selectedHeatmapProfile = this.props.store.heatmapMolecularProfiles.result![index].molecularProfileId;
        });
    }

    @action
    public setAnnotateCBioPortalInputValue(value:string) {
        this.controlsHandlers.onChangeAnnotateCBioPortalInputValue && this.controlsHandlers.onChangeAnnotateCBioPortalInputValue(value);
    }

    @action
    public setAnnotateCOSMICInputValue(value:string) {
        this.controlsHandlers.onChangeAnnotateCOSMICInputValue && this.controlsHandlers.onChangeAnnotateCOSMICInputValue(value);
    }

    private buildControlsHandlers() {
        return {
            onSelectColumnType:(type:"sample"|"patient")=>{this.setColumnMode(type);},
            onSelectShowUnalteredColumns:(show:boolean)=>{this.showUnalteredColumns = show;},
            onSelectShowWhitespaceBetweenColumns:(show:boolean)=>{this.showWhitespaceBetweenColumns = show;},
            onSelectShowClinicalTrackLegends:(show:boolean)=>{this.showClinicalTrackLegends = show; },
            onSelectOnlyShowClinicalLegendForAlteredCases:(show:boolean)=>{this._onlyShowClinicalLegendForAlteredCases = show; },
            onSelectShowOqlInLabels:(show:boolean)=>{this.showOqlInLabels = show;},
            onSelectShowMinimap:(show:boolean)=>{this.showMinimap = show;},
            onSelectDistinguishMutationType:(s:boolean)=>{this.distinguishMutationType = s;},
            onSelectDistinguishDrivers:action((s:boolean)=>{
                if (!s) {
                    this.props.store.driverAnnotationSettings.oncoKb = false;
                    this.props.store.driverAnnotationSettings.hotspots = false;
                    this.props.store.driverAnnotationSettings.cbioportalCount = false;
                    this.props.store.driverAnnotationSettings.cosmicCount = false;
                    this.props.store.driverAnnotationSettings.customBinary = false;
                    this.props.store.driverAnnotationSettings.driverTiers.forEach((value, key)=>{
                        this.props.store.driverAnnotationSettings.driverTiers.set(key, false);
                    });
                    this.props.store.driverAnnotationSettings.excludeVUS = false;
                } else {
                    if (!this.controlsState.annotateDriversOncoKbDisabled && !this.controlsState.annotateDriversOncoKbError)
                        this.props.store.driverAnnotationSettings.oncoKb = true;

                    if (!this.controlsState.annotateDriversHotspotsDisabled && !this.controlsState.annotateDriversHotspotsError)
                        this.props.store.driverAnnotationSettings.hotspots = true;

                    this.props.store.driverAnnotationSettings.cbioportalCount = true;
                    this.props.store.driverAnnotationSettings.cosmicCount = true;
                    this.props.store.driverAnnotationSettings.customBinary = true;
                    this.props.store.driverAnnotationSettings.driverTiers.forEach((value, key)=>{
                        this.props.store.driverAnnotationSettings.driverTiers.set(key, true);
                    });
                }
            }),
            onSelectDistinguishGermlineMutations:(s:boolean)=>{this.distinguishGermlineMutations = s; },
            onSelectAnnotateOncoKb:action((s:boolean)=>{
                this.props.store.driverAnnotationSettings.oncoKb = s;
            }),
            onSelectAnnotateHotspots:action((s:boolean)=>{
                this.props.store.driverAnnotationSettings.hotspots = s;
            }),
            onSelectAnnotateCBioPortal:action((s:boolean)=>{
                this.props.store.driverAnnotationSettings.cbioportalCount = s;
            }),
            onSelectAnnotateCOSMIC:action((s:boolean)=>{
                this.props.store.driverAnnotationSettings.cosmicCount = s;
            }),
            onChangeAnnotateCBioPortalInputValue:action((s:string)=>{
                this.props.store.driverAnnotationSettings.cbioportalCountThreshold = parseInt(s, 10);
                this.controlsHandlers.onSelectAnnotateCBioPortal && this.controlsHandlers.onSelectAnnotateCBioPortal(true);
            }),
            onChangeAnnotateCOSMICInputValue:action((s:string)=>{
                this.props.store.driverAnnotationSettings.cosmicCountThreshold = parseInt(s, 10);
                this.controlsHandlers.onSelectAnnotateCOSMIC && this.controlsHandlers.onSelectAnnotateCOSMIC(true);
            }),
            onSelectCustomDriverAnnotationBinary:action((s:boolean)=>{
                this.props.store.driverAnnotationSettings.customBinary = s;
            }),
            onSelectCustomDriverAnnotationTier:action((value:string, checked:boolean)=>{
                this.props.store.driverAnnotationSettings.driverTiers.set(value, checked);
            }),
            onSelectHidePutativePassengers:(s:boolean)=>{
                this.props.store.driverAnnotationSettings.excludeVUS = s;
            },
            onSelectHideGermlineMutations:(s:boolean)=>{
                this.props.store.excludeGermlineMutations = s;
            },
            onSelectSortByMutationType:(s:boolean)=>{
                this.props.store.urlWrapper.updateURL({ oncoprint_sort_by_mutation_type: s.toString() });
            },
            onClickSortAlphabetical:()=>{
                this.props.store.urlWrapper.updateURL({
                    oncoprint_sortby:"case_id",
                    oncoprint_cluster_profile:""
                });
            },
            onClickSortCaseListOrder:()=>{
                this.props.store.urlWrapper.updateURL({
                    oncoprint_sortby:"case_list",
                    oncoprint_cluster_profile:""
                });
            },
            onSelectSortByDrivers:(sort:boolean)=>{
                this.props.store.urlWrapper.updateURL({ oncoprint_sort_by_drivers: sort.toString() });
            },
            onClickSortByData:()=>{this.props.store.urlWrapper.updateURL({
                oncoprint_sortby:"",
                oncoprint_cluster_profile:""
            });},
            onChangeSelectedClinicalTracks: this.onChangeSelectedClinicalTracks,
            onChangeHeatmapGeneInputValue:action((s:string)=>{
                this.heatmapGeneInputValue = s;
                this.heatmapGeneInputValueUpdater(); // stop updating heatmap input if user has typed
            }),
            onSelectHeatmapProfile:(id:string)=>{this.selectedHeatmapProfile = id;},
            onClickAddGenesToHeatmap:()=>{
                const genes = parseOQLQuery(this.heatmapGeneInputValue.toUpperCase().trim()).map(q=>q.gene);
                this.addHeatmapTracks(this.selectedHeatmapProfile, genes);
            },
            onClickAddTreatmentsToHeatmap:(treatmentIds:string[])=>{
                this.addHeatmapTracks(this.selectedHeatmapProfile, treatmentIds);
            },
            onClickDownload:(type:string)=>{
                switch(type) {
                    case "pdf":
                        svgToPdfDownload("oncoprint.pdf", this.oncoprint.toSVG(false));
                        // if (!pdfDownload("oncoprint.pdf", this.oncoprint.toSVG(true))) {
                        //     alert("Oncoprint too big to download as PDF - please download as SVG.");
                        // }
                        break;
                    case "png":
                        const img = this.oncoprint.toCanvas((canvas, truncated)=>{
                            canvas.toBlob(blob=>{
                                if (truncated) {
                                    alert(
                                        `Oncoprint too large - PNG truncated to ${canvas.getAttribute("width")}x${canvas.getAttribute("height")}`
                                    );
                                }
                                fileDownload(
                                    blob,
                                    "oncoprint.png"
                                );
                            });
                        }, 2);
                        break;
                    case "svg":
                        fileDownload(
                            (new XMLSerializer).serializeToString(this.oncoprint.toSVG(false)),
                            "oncoprint.svg"
                        );
                        break;
                    case "order":
                        const capitalizedColumnMode = this.columnMode[0].toUpperCase() + this.columnMode.slice(1);
                        onMobxPromise(
                            [this.props.store.sampleKeyToSample,
                                this.props.store.patientKeyToPatient],
                            (sampleKeyToSample:{[sampleKey:string]:Sample}, patientKeyToPatient: any)=>{
                                let file = `${capitalizedColumnMode} order in the Oncoprint is:\n`;
                                const keyToCase = (this.columnMode === "sample" ? sampleKeyToSample : patientKeyToPatient);
                                const caseIds = this.oncoprint.getIdOrder().map(
                                    this.columnMode === "sample" ?
                                        ((id:string)=>(sampleKeyToSample[id].sampleId)) :
                                        ((id:string)=>(patientKeyToPatient[id].patientId))
                                );
                                for (const caseId of caseIds) {
                                    file += `${caseId}\n`;
                                }
                                fileDownload(
                                    file,
                                    `OncoPrint${capitalizedColumnMode}s.txt`
                                );
                            }
                        );
                        break;
                    case "tabular":
                        onMobxPromise(
                            [this.props.store.sampleKeyToSample,
                                this.props.store.patientKeyToPatient],
                            (sampleKeyToSample:{[sampleKey:string]:Sample}, patientKeyToPatient: any)=>{
                                tabularDownload(
                                    this.geneticTracks.result,
                                    this.clinicalTracks.result,
                                    this.heatmapTracks.result,
                                    this.treatmentHeatmapTracks.result,
                                    this.genesetHeatmapTracks.result,
                                    this.oncoprint.getIdOrder(),
                                    (this.columnMode === "sample" ?
                                        ((key:string)=>(sampleKeyToSample[key].sampleId)) :
                                        ((key:string)=>(patientKeyToPatient[key].patientId))),
                                    this.columnMode,
                                    this.distinguishDrivers
                                )
                            }
                        );
                        break;
                }
            },
            onSetHorzZoom:(z:number)=>{
                this.oncoprint.setHorzZoom(z);
            },
            onClickZoomIn:()=>{
                this.oncoprint.setHorzZoom(this.oncoprint.getHorzZoom()/0.7);
            },
            onClickZoomOut:()=>{
                this.oncoprint.setHorzZoom(this.oncoprint.getHorzZoom()*0.7);
            }
        };
    }

    /**
     * Indicates whether dynamic heatmap querying controls are relevant.
     *
     * They are if a non-geneset heatmap profile is currently selected; gene set
     * heatmaps are queried from the query page.
     */
    @computed get heatmapIsDynamicallyQueried(): boolean {
        const profileMap = this.props.store.molecularProfileIdToMolecularProfile.result;
        return (
            profileMap.hasOwnProperty(this.selectedHeatmapProfile) &&
            profileMap[this.selectedHeatmapProfile].molecularAlterationType !== 'GENESET_SCORE'
        );
    }

    @action public sortByData() {
        this.props.store.urlWrapper.updateURL({
            oncoprint_sortby:"",
            oncoprint_cluster_profile:""
        });
    }

    @computed get clinicalTracksUrlParam() {
        return this.selectedClinicalAttributeIds.keys().join(",");
    }

    private readonly unalteredKeys = remoteData({
        await:()=>[this.geneticTracks],
        invoke:async()=>getUnalteredUids(this.geneticTracks.result!)
    });

    readonly treatmentSelectOptions = remoteData<ISelectOption[]>({
        await:() => [this.props.store.treatmentsInStudies],
        invoke:async() => treatmentsToSelectOptions(this.props.store.treatmentsInStudies.result || [])
    });

    @computed get selectedHeatmapProfileAlterationType():string {
        let molecularProfile = this.props.store.molecularProfileIdToMolecularProfile.result[this.selectedHeatmapProfile];
        return molecularProfile.molecularAlterationType;
    }

    public addHeatmapTracks(molecularProfileId:string, entities:string[]) {

        const tracksMap = this.molecularProfileIdToHeatmapTracks;

        const entitiesMap = _.chain(entities).keyBy(entity=>entity).mapValues(()=>true).value();

        // first delete any existing track for this profileId
        delete tracksMap[molecularProfileId];

        const molecularAlterationType =
            this.props.store.molecularProfileIdToMolecularProfile.result[molecularProfileId].molecularAlterationType!;

        if (entities && entities.length) {
            tracksMap[molecularProfileId] = {
                entities: entitiesMap,
                molecularAlterationType,
                molecularProfileId,
                trackGroupIndex:0,
            } as HeatmapTrackGroupRecord
        } else {
            delete tracksMap[molecularProfileId];
        }

        const heatmap_track_groups = _.map(tracksMap, (track, molecularProfileId)=>{
            return `${molecularProfileId},${_.keys(track.entities).join(",")}`;
        }).join(";");

        // derive treaments from heatmap tracks since the only way to add treatments right now
        // is to use heatmap UI in oncoprint
        const treatment_list = _.filter(tracksMap, (x:HeatmapTrackGroupRecord)=> x.molecularAlterationType === AlterationTypeConstants.GENERIC_ASSAY)
            .map((x:HeatmapTrackGroupRecord)=>`${_.keys(x.entities).join(";")}`)
            .join(";");

        this.props.store.urlWrapper.updateURL({ heatmap_track_groups, treatment_list });
    }

    removeHeatmapTracksByProfileId(molecularProfileId:string){
        this.addHeatmapTracks
    }

    private toggleColumnMode() {
        if (this.columnMode === "sample") {
            this.controlsHandlers.onSelectColumnType && this.controlsHandlers.onSelectColumnType("patient");
        } else {
            this.controlsHandlers.onSelectColumnType && this.controlsHandlers.onSelectColumnType("sample");
        }
    }

    private oncoprintRef(oncoprint:OncoprintJS) {
        this.oncoprint = oncoprint;
        if (this.props.addOnBecomeVisibleListener) {
            this.props.addOnBecomeVisibleListener(
                ()=>this.oncoprint.triggerPendingResizeAndOrganize(this.onReleaseRendering)
            );
        }

        this.oncoprint.onHorzZoom(z=>(this.horzZoom = z));
        this.horzZoom = this.oncoprint.getHorzZoom();
        onMobxPromise(this.alteredKeys,
            (alteredUids:string[])=>{
                this.oncoprint.setHorzZoomToFit(alteredUids);
            });

    }

    private setColumnMode(type:"sample"|"patient") {
        this.props.store.urlWrapper.updateURL({ show_samples: type==="sample" ? "true" : "false" })
    }

    readonly alteredKeys = remoteData({
        await:()=>[this.geneticTracks],
        invoke:async()=>getAlteredUids(this.geneticTracks.result!),
        default: []
    });

    @action private onMinimapClose() {
        this.showMinimap = false;
    }

    @action private onSuppressRendering() {
        this.renderingComplete = false;
    }

    @action private onReleaseRendering() {
        clearTimeout(this.isLoading_setRenderingCompleteTimeout);
        this.isLoading_setRenderingCompleteTimeout = null;

        this.renderingComplete = true;
    }

    public clinicalTrackKeyToAttributeId(clinicalTrackKey:string) {
        return clinicalTrackKey.substr(CLINICAL_TRACK_KEY_PREFIX.length);
    }

    public clinicalAttributeIdToTrackKey(clinicalAttributeId:string|SpecialAttribute) {
        return `${CLINICAL_TRACK_KEY_PREFIX}${clinicalAttributeId}`;
    }

    @action private onChangeSelectedClinicalTracks(clinicalAttributeIds:(string|SpecialAttribute)[]) {
        this.props.store.urlWrapper.updateURL({ clinicallist: clinicalAttributeIds.join(",")  });
    }

    private onDeleteClinicalTrack(clinicalTrackKey:string) {
        // ignore tracks being deleted due to rendering process reasons
        if (!this.isHidden) {
            const ids = this.selectedClinicalAttributeIds.keys();
            const withoutDeleted = _.filter(ids,(item)=>item!==this.clinicalTrackKeyToAttributeId(clinicalTrackKey));
            this.props.store.urlWrapper.updateURL({ clinicallist: withoutDeleted.join(",")  });
        }
    }

    private onTrackSortDirectionChange(trackId:TrackId, dir:number) {
        // called when a clinical or heatmap track is sorted a-Z or Z-a, selected from within oncoprintjs UI
        if (dir === 1 || dir === -1) {
            this.sortByData();
        }
    }

    @autobind
    @action
    public clearSortDirectionsAndSortByData() {
        if (this.oncoprint) {
            this.oncoprint.resetSortableTracksSortDirection();
            this.sortByData();
        }
    }

    @computed get sortOrder() {
        if (this.sortMode.type === "alphabetical") {
            return this.columnMode === "sample" ? this.alphabeticalSampleOrder : this.alphabeticalPatientOrder;
        } else if (this.sortMode.type === "caseList") {
            if (this.columnMode === "sample" && this.props.store.givenSampleOrder.isComplete) {
                return this.props.store.givenSampleOrder.result.map(x=>x.uniqueSampleKey);
            } else if (this.columnMode === "patient" && this.props.store.givenSampleOrder.isComplete) {
                return _.uniq(this.props.store.givenSampleOrder.result.map(x=>x.uniquePatientKey));
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
    }

    @computed get alphabeticalSampleOrder() {
        if (this.props.store.samples.isComplete) {
            return _.sortBy(this.props.store.samples.result!, sample=>sample.sampleId).map(sample=>sample.uniqueSampleKey);
        } else {
            return undefined;
        }
    };

    @computed get alphabeticalPatientOrder() {
        if (this.props.store.patients.isComplete) {
            return _.sortBy(this.props.store.patients.result!, patient=>patient.patientId).map(patient=>patient.uniquePatientKey);
        } else {
            return undefined;
        }
    };

    readonly sampleGeneticTracks = makeGeneticTracksMobxPromise(this, true);
    readonly patientGeneticTracks = makeGeneticTracksMobxPromise(this, false);
    @computed get geneticTracks() {
        return (this.columnMode === "sample" ? this.sampleGeneticTracks : this.patientGeneticTracks);
    }

    readonly sampleClinicalTracks = makeClinicalTracksMobxPromise(this, true);
    readonly patientClinicalTracks = makeClinicalTracksMobxPromise(this, false);

    @computed get clinicalTracks() {
        return (this.columnMode === "sample" ? this.sampleClinicalTracks : this.patientClinicalTracks);
    }

    readonly sampleHeatmapTracks = makeHeatmapTracksMobxPromise(this, true);
    readonly patientHeatmapTracks = makeHeatmapTracksMobxPromise(this, false);
    @computed get heatmapTracks() {
        return (this.columnMode === "sample" ? this.sampleHeatmapTracks : this.patientHeatmapTracks);
    }

    readonly sampleTreatmentHeatmapTracks = makeTreatmentProfileHeatmapTracksMobxPromise(this, true);
    readonly patientTreatmentHeatmapTracks = makeTreatmentProfileHeatmapTracksMobxPromise(this, false);
    @computed get treatmentHeatmapTracks() {
        return (this.columnMode === "sample" ? this.sampleTreatmentHeatmapTracks : this.patientTreatmentHeatmapTracks);
    }

    @computed get genesetHeatmapTrackGroup(): number {
        return 1 + Math.max(
            GENETIC_TRACK_GROUP_INDEX,
            // observe the heatmap tracks to render in the very next group
            ...(this.heatmapTracks.result.map(hmTrack => hmTrack.trackGroupIndex)),
            ...(this.treatmentHeatmapTracks.result.map(hmTrack => hmTrack.trackGroupIndex))
        );
    }

    readonly sampleGenesetHeatmapTracks = makeGenesetHeatmapTracksMobxPromise(
            this, true,
            makeGenesetHeatmapExpansionsMobxPromise(this, true)
    );
    readonly patientGenesetHeatmapTracks = makeGenesetHeatmapTracksMobxPromise(
            this, false,
            makeGenesetHeatmapExpansionsMobxPromise(this, false)
    );
    @computed get genesetHeatmapTracks() {
        return (this.columnMode === "sample" ? this.sampleGenesetHeatmapTracks : this.patientGenesetHeatmapTracks);
    }

    @computed get clusteredHeatmapTrackGroupIndex() {
        if (this.sortMode.type === "heatmap") {
            const clusteredHeatmapProfile: string = this.sortMode.clusteredHeatmapProfile;
            const genesetHeatmapProfile: string | undefined = (
                this.props.store.genesetMolecularProfile.result &&
                this.props.store.genesetMolecularProfile.result.value &&
                this.props.store.genesetMolecularProfile.result.value.molecularProfileId
            );
            if (clusteredHeatmapProfile === genesetHeatmapProfile) {
                return this.genesetHeatmapTrackGroup;
            } else {
                const heatmapGroup = this.molecularProfileIdToHeatmapTracks[clusteredHeatmapProfile];
                return (heatmapGroup && heatmapGroup.trackGroupIndex);
            }
        }
        return undefined;
    }

    @computed get oncoprintLibrarySortConfig() {
        return {
            sortByMutationType:this.sortByMutationType,
            sortByDrivers:this.sortByDrivers,
            order: this.sortOrder,
            clusterHeatmapTrackGroupIndex: this.clusteredHeatmapTrackGroupIndex
        };
    }

    @autobind
    @action
    private clusterHeatmapByIndex(index:TrackGroupIndex) {

        if (this.oncoprint) {
            this.oncoprint.resetSortableTracksSortDirection();
        }

        const groupEntry = _.values(this.molecularProfileIdToHeatmapTracks).find(
            trackGroup=>trackGroup.trackGroupIndex === index
        );

        if (groupEntry) {
            this.props.store.urlWrapper.updateURL({
                                                      oncoprint_sortby: "cluster",
                                                      oncoprint_cluster_profile: groupEntry.molecularProfileId
                                                  });
        }
    }

    @autobind
    @action
    private removeHeatmapByIndex(index:TrackGroupIndex) {
        const groupEntry = _.values(this.molecularProfileIdToHeatmapTracks).find(
            group=>group.trackGroupIndex === index
        );
        if (groupEntry) {
            this.addHeatmapTracks(groupEntry.molecularProfileId,[]);
        }
    }

    readonly heatmapTrackHeaders = remoteData({
        await:()=>[this.props.store.molecularProfileIdToMolecularProfile],
        invoke:()=>{
            const profileMap = this.props.store.molecularProfileIdToMolecularProfile.result!;
            return Promise.resolve(
                _.reduce(this.molecularProfileIdToHeatmapTracks, (headerMap, nextEntry)=>{
                    headerMap[nextEntry.trackGroupIndex] = {
                        label:{
                            text: profileMap[nextEntry.molecularProfileId].name
                        },
                        options:[{
                            label: "Cluster",
                            onClick: this.clusterHeatmapByIndex,
                            weight:()=>{
                                if (this.clusteredHeatmapTrackGroupIndex === nextEntry.trackGroupIndex) {
                                    return "bold";
                                } else {
                                    return "normal";
                                }
                            }
                        },{
                            label:"Don't cluster",
                            onClick:()=>{
                                if (this.clusteredHeatmapTrackGroupIndex === nextEntry.trackGroupIndex) {
                                    this.sortByData();
                                }
                            },
                            weight:()=>{
                                if (this.clusteredHeatmapTrackGroupIndex === nextEntry.trackGroupIndex) {
                                    return "normal";
                                } else {
                                    return "bold";
                                }
                            }
                        }, {
                            separator:true
                        },{
                            label: "Delete",
                            onClick: this.removeHeatmapByIndex
                        }]
                    };
                    return headerMap;
                }, {} as {[trackGroupIndex:number]:TrackGroupHeader})
            );
        },
        default:{}
    });

    /* commenting this out because I predict it could make a comeback
    @computed get headerColumnModeButton() {
        if (!this.props.store.samples.isComplete ||
            !this.props.store.patients.isComplete ||
            (this.props.store.samples.result.length === this.props.store.patients.result.length)) {
            return null;
        }
        let text, tooltip;
        if (this.columnMode === "sample") {
            text = "Show only one column per patient.";
            tooltip = "Each sample for each patient is in a separate column. Click to show only one column per patient";
        } else {
            text = "Show all samples";
            tooltip = "All samples from a patient are merged into one column. Click to split samples into multiple columns.";
        }
        return (
            <DefaultTooltip
                overlay={<div style={{maxWidth:"400px"}}>{tooltip}</div>}
                placement="top"
            >
                <Button
                    bsSize="xs"
                    bsStyle="primary"
                    style={{
                        fontSize:"11px",
                        display:"inline-block",
                        color:"white",
                        marginLeft:"5px"
                    }}
                    onClick={this.toggleColumnMode}
                >{text}
                </Button>
            </DefaultTooltip>
        );
    }*/

    @computed get isLoading() {
        clearTimeout(this.isLoading_setRenderingCompleteTimeout);
        this.isLoading_setRenderingCompleteTimeout = setTimeout(()=>{
            this.renderingComplete = false;
            // otherwise, there will be a jumpy oncoprint render experience:
            //  oncoprint hides when loading
            //  loading finishes and oncoprint shows
            //  then oncoprint rendering begins, suppress rendering
            //  loading shows again
            //  then oncoprint rendering finishes, release rendering

            // by setting renderingComplete = false here, we bridge that gap so theres only one contiguous loading period
        });
        return this.oncoprintComponent.isPending;
    }

    @computed get isHidden() {
        return this.isLoading || !this.renderingComplete;
    }

    private get loadingIndicatorHeight() {
        return 300;
    }

    @computed get loadingIndicatorMessage() {
        if (this.isLoading)
            return "Downloading Oncoprint data...";
        else if (!this.renderingComplete)
            return "Data downloaded. Rendering Oncoprint..";
        // Otherwise, isHidden is false, so no message shown at all..
        // Putting this here just for Typescript
        return "";
    }

    readonly alterationTypesInQuery = remoteData({
        await:()=>[this.props.store.selectedMolecularProfiles],
        invoke:()=>Promise.resolve(_.uniq(this.props.store.selectedMolecularProfiles.result!.map(x=>x.molecularAlterationType)))
    });

    @autobind
    private getControls() {
        if (this.oncoprint && !this.oncoprint.webgl_unavailable && (this.treatmentSelectOptions.isComplete || this.treatmentSelectOptions.isError))  {
            return (<FadeInteraction showByDefault={true} show={true}>
                <OncoprintControls
                    handlers={this.controlsHandlers}
                    state={this.controlsState}
                    store={this.props.store}
                    treatmentSelectOptions={this.treatmentSelectOptions.result}
                    selectedTreatmentIds={this.selectedTreatmentsFromUrl}
                />
            </FadeInteraction>);
        } else {
            return <span/>;
        }
    }

    private loadingGeneticDataDuringCurrentLoad = false;
    private loadingClinicalDataDuringCurrentLoad = false;
    @autobind
    private getProgressItems(elapsedSecs:number):IProgressIndicatorItem[] {
        if (elapsedSecs === 0) {
            this.loadingGeneticDataDuringCurrentLoad = false;
            this.loadingClinicalDataDuringCurrentLoad = false;
        }

        const areNonLocalClinicalAttributesSelected =
            _.some(this.selectedClinicalAttributeIds.keys(),
                clinicalAttributeId=>!clinicalAttributeIsLocallyComputed({clinicalAttributeId})
            );

        if (this.geneticTracks.isPending) {
            this.loadingGeneticDataDuringCurrentLoad = true;
        }
        if (areNonLocalClinicalAttributesSelected && this.clinicalTracks.isPending) {
            this.loadingClinicalDataDuringCurrentLoad = true;
        }

        const ret:IProgressIndicatorItem[] = [];

        let queryingLabel:string;
        if (this.props.store.genes.isComplete && this.props.store.samples.isComplete) {
            const numGenes = this.props.store.genes.result!.length;
            const numSamples = this.props.store.samples.result!.length;
            queryingLabel = `Querying ${numGenes} genes in ${numSamples} samples`;
        } else {
            queryingLabel = "Querying ... genes in ... samples";
        }

        let waitingLabel:string = "";
        if (elapsedSecs > 2) {
            waitingLabel = " - this can take several seconds";
        }

        ret.push({
            label: `${queryingLabel}${waitingLabel}`,
            promises: [], // empty promises means insta-complete
            hideIcon: true, // dont show any icon, this is just a message
            style:{ fontWeight:"bold" }
        });

        const dataLoadingNames = [];
        if (this.loadingGeneticDataDuringCurrentLoad) {
            dataLoadingNames.push("genetic");
        }
        if (this.loadingClinicalDataDuringCurrentLoad) {
            dataLoadingNames.push("clinical");
        }

        ret.push({
            label: `Loading ${dataLoadingNames.join(" and ")} data`,
            promises: [this.props.store.molecularData, this.props.store.mutations, ...(areNonLocalClinicalAttributesSelected ? [this.clinicalTracks] : [])]
        });

        const usingOncokb = this.props.store.driverAnnotationSettings.oncoKb;
        const usingHotspot = this.props.store.driverAnnotationSettings.hotspots;
        ret.push({
            label: getAnnotatingProgressMessage(usingOncokb, usingHotspot),
            promises:[this.props.store.filteredAndAnnotatedMolecularData, this.props.store.filteredAndAnnotatedMutations]
        });

        ret.push({
            label: "Rendering"
        });

        return ret as IProgressIndicatorItem[];
    }

    @computed get width() {
        return WindowStore.size.width - 75;
    }

    readonly oncoprintComponent = MakeMobxView({
        await:()=>[
            this.clinicalTracks,
            this.geneticTracks,
            this.genesetHeatmapTracks,
            this.treatmentHeatmapTracks,
            this.heatmapTracks,
            this.props.store.molecularProfileIdToMolecularProfile,
            this.alterationTypesInQuery,
            this.alteredKeys,
            this.heatmapTrackHeaders,
            this.props.store.treatmentsInStudies
        ],
        render:()=>(
            <Oncoprint
                oncoprintRef={this.oncoprintRef}
                clinicalTracks={this.clinicalTracks.result}
                geneticTracks={this.geneticTracks.result}
                genesetHeatmapTracks={this.genesetHeatmapTracks.result}
                heatmapTracks={([] as IHeatmapTrackSpec[]).concat(this.treatmentHeatmapTracks.result).concat(this.heatmapTracks.result)}
                divId={this.props.divId}
                width={this.width}
                caseLinkOutInTooltips={true}
                suppressRendering={this.isLoading}
                onSuppressRendering={this.onSuppressRendering}
                onReleaseRendering={this.onReleaseRendering}
                hiddenIds={!this.showUnalteredColumns ? this.unalteredKeys.result : undefined}
                molecularProfileIdToMolecularProfile={this.props.store.molecularProfileIdToMolecularProfile.result}
                alterationTypesInQuery={this.alterationTypesInQuery.result}
                showSublabels={this.showOqlInLabels}
                heatmapTrackHeaders={this.heatmapTrackHeaders.result!}
                horzZoomToFitIds={this.alteredKeys.result}
                distinguishMutationType={this.distinguishMutationType}
                distinguishDrivers={this.distinguishDrivers}
                distinguishGermlineMutations={this.distinguishGermlineMutations}
                sortConfig={this.oncoprintLibrarySortConfig}
                showClinicalTrackLegends={this.showClinicalTrackLegends}
                showWhitespaceBetweenColumns={this.showWhitespaceBetweenColumns}
                showMinimap={this.showMinimap}

                onMinimapClose={this.onMinimapClose}
                onDeleteClinicalTrack={this.onDeleteClinicalTrack}
                onTrackSortDirectionChange={this.onTrackSortDirectionChange}
            />
        ),
        showLastRenderWhenPending: true, // otherwise oncoprint will reconstruct every time anything changes -- inefficient
    });

    public render() {
        return (
            <div style={{ position:"relative" }}>

                <LoadingIndicator isLoading={this.isHidden} size={"big"}  centerRelativeToContainer={false} center={true} className="oncoprintLoadingIndicator">
                    <div>
                        <ProgressIndicator getItems={this.getProgressItems} show={this.isHidden} sequential={true}/>
                    </div>
                </LoadingIndicator>

                <div className={"tabMessageContainer"}>
                    <OqlStatusBanner className="oncoprint-oql-status-banner" store={this.props.store} tabReflectsOql={true} />
                    <AlterationFilterWarning store={this.props.store}/>
                </div>

                <div className={classNames('oncoprintContainer', { fadeIn: !this.isHidden })}
                     onMouseEnter={this.onMouseEnter}
                     onMouseLeave={this.onMouseLeave}
                >
                    <Observer>
                        {this.getControls}
                    </Observer>

                    <div style={{position:"relative", marginTop:15}} >
                        <div>
                            {this.oncoprintComponent.component}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

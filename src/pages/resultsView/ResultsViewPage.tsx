import * as React from 'react';
import * as _ from 'lodash';
import {observer, inject, Observer} from "mobx-react";
import {reaction, computed} from "mobx";
import validateParameters from 'shared/lib/validateParameters';
import ValidationAlert from "shared/components/ValidationAlert";
import AjaxErrorModal from "shared/components/AjaxErrorModal";
import exposeComponentRenderer from 'shared/lib/exposeComponentRenderer';
import {ResultsViewPageStore} from "./ResultsViewPageStore";
import Mutations from "./mutation/Mutations";
import MutualExclusivityTab from "./mutualExclusivity/MutualExclusivityTab";

const resultsViewPageStore = new ResultsViewPageStore();

(window as any).resultsViewPageStore = resultsViewPageStore;

export interface IResultsViewPageProps {
    routing: any;
}

@inject('routing')
@observer
export default class ResultsViewPage extends React.Component<IResultsViewPageProps, {}> {

    constructor(props: IResultsViewPageProps) {
        super();

        this.exposeComponentRenderersToParentScript();

        // const reaction1 = reaction(
        //     () => props.routing.location.query,
        //     query => {
        //
        //         const validationResult = validateParameters(query, ['studyId']);
        //
        //         if (validationResult.isValid) {
        //             resultsViewPageStore.urlValidationError = null;
        //
        //             resultsViewPageStore.studyId = query.studyId;
        //
        //             if ('sampleListId' in query) {
        //                 resultsViewPageStore.sampleListId = query.sampleListId as string;
        //             }
        //
        //             // TODO we may want to split by ","
        //
        //             if ('sampleList' in query) {
        //                 resultsViewPageStore.sampleList = (query.sampleList as string).split(" ");
        //             }
        //
        //             if ('geneList' in query) {
        //                 resultsViewPageStore.hugoGeneSymbols = (query.geneList as string).split(" ");
        //             }
        //
        //             if ('tab' in query) {
        //                 resultsViewPageStore.tab = query.tab as string;
        //             }
        //         }
        //         else {
        //             resultsViewPageStore.urlValidationError = validationResult.message;
        //         }
        //
        //     },
        //     { fireImmediately:true }
        // );
    }

    componentDidMount(){
        setTimeout(function(){
            var qSession: any = (window as any).QuerySession;

            (window as any).renderMutExTab(document.getElementById('mutex-info-div'), {
                studyId: qSession.getCancerStudyIds()[0],
                genes:qSession.getQueryGenes(),
                samples:qSession.getSampleIds(),
                oqlQuery:qSession.oql_query
            });

        },2000);

    }

    public exposeComponentRenderersToParentScript() {

        exposeComponentRenderer('renderMutationsTab', (props: {genes: string[], studyId: string, samples: string[]|string}) => {

            resultsViewPageStore.hugoGeneSymbols = props.genes;
            resultsViewPageStore.studyId = props.studyId;
            if (typeof props.samples === "string") {
                resultsViewPageStore.sampleListId = props.samples;
            } else {
                resultsViewPageStore.sampleList = props.samples;
            }

            return <div>
                <AjaxErrorModal
                    show={(resultsViewPageStore.ajaxErrors.length > 0)}
                    onHide={()=>{ resultsViewPageStore.clearErrors() }}
                />
                <Mutations genes={props.genes} store={resultsViewPageStore}/>
            </div>
        });

        exposeComponentRenderer('renderMutExTab', (props: { oqlQuery: string, genes: string[], studyId: string, samples: string[]|string}) => {
            resultsViewPageStore.studyId = props.studyId;
            resultsViewPageStore.hugoGeneSymbols = props.genes;
            resultsViewPageStore.oqlQuery = props.oqlQuery;
            if (typeof props.samples === "string") {
                resultsViewPageStore.sampleListId = props.samples;
            } else {
                resultsViewPageStore.sampleList = props.samples;
            }
            _.each(props.genes, (gene:string)=>resultsViewPageStore.getMutationMapperStore(gene));

            // var isSampleAlteredMap = {
            //     "EGFR": [true, false, true, true, false, false, true, true, false, false],
            //     "KRAS": [false, true, false, false, true, true, false, false, true, true],
            //     "TP53": [false, false, false, false, false, true, false, false, true, true],
            //     "BRAF": [false, false, false, true, false, true, false, false, true, true]
            // };
            // isSampleAlteredMap = {
            //     "KRAS": [false, false, false, false, true, false, false, false, false, false, false, true, false, false, true, true, false, false, false, false, false, false, true, false, true, false, false, false, false, true, true, false, true, false, false, false, false, false, false, false, false, true, false, true, true, true, true, false, true, false, true, false, false, true, false, false, false, true, true, false, false, true, true, false, false, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false, false, true, false, false, true, false, false, true, true, false, true, false, false, true, true, false, false, false, true, false, true, false, true, true, true, false, false, true, true, false, false, true, false, false, true, false, true, true, true, false, false, true, true, false, true, true, false, true, true, false, true, true, false, true, true, true, true, false, false, true, true, false, true, true, true, true, false, true, true, true, false, true, false, false, true, false, true, true, true, true, false, false, true, false, true],
            //     "NRAS": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
            //     "BRAF": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
            // };
            return (<div className="cbioportal-frontend">
                    <MutualExclusivityTab store={resultsViewPageStore}/>
                </div>)
        });

    }

    public render() {

        return null;

        // if (resultsViewPageStore.urlValidationError) {
        //     return <ValidationAlert urlValidationError={resultsViewPageStore.urlValidationError} />;
        // }
        //


        //
        // return (
        //     <div className="resultsViewPage">
        //         <AjaxErrorModal
        //             show={(resultsViewPageStore.ajaxErrors.length > 0)}
        //             onHide={()=>{ resultsViewPageStore.clearErrors() }}
        //         />
        //
        //         {resultsViewPageStore.tab === "mutation" &&
        //         <Mutations
        //             genes={resultsViewPageStore.hugoGeneSymbols || []}
        //             store={resultsViewPageStore}
        //             routing={this.props.routing}
        //         />
        //         }
        //
        //         {resultsViewPageStore.tab === "mutualExclusivity" &&
        //         <MutualExclusivityTab isSampleAlteredMap={isSampleAlteredMap}/>
        //         }
        //     </div>
        // );
    }
}
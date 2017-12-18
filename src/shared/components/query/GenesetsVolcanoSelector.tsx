import * as _ from 'lodash';
import * as React from 'react';
import LabeledCheckbox from "../labeledCheckbox/LabeledCheckbox";
import * as styles_any from './styles/styles.module.scss';
import {action, ObservableMap, expr, toJS, computed, observable, autorun} from "mobx";
import {observer, Observer} from "mobx-react";
import EnhancedReactTable from "../enhancedReactTable/EnhancedReactTable";
import {Geneset} from "../../api/generated/CBioPortalAPIInternal";
import {IColumnFormatterData} from "../enhancedReactTable/IColumnFormatter";
import {IColumnDefMap} from "../enhancedReactTable/IEnhancedReactTableProps";
import {Td} from 'reactable';
import {toPrecision} from "../../lib/FormatUtils";
import { getHierarchyData } from "shared/lib/StoreUtils";
import ReactSelect from "react-select";
import LoadingIndicator from "shared/components/loadingIndicator/LoadingIndicator";
import { VictoryChart, VictoryScatter, VictoryTheme, VictorySelectionContainer,
    VictoryAxis, VictoryLabel, VictoryLine } from 'victory';

const styles = styles_any as {
    GenesetsVolcanoSelectorWindow: string,
    selectButton: string,
    selectionColumnHeader: string,
    selectionColumnCell: string,
};

class GenesetsVolcanoTable extends EnhancedReactTable<Geneset> {}

export interface GenesetsVolcanoSelectorProps
{
    gsvaProfile: string;
    sampleListId: string|undefined;
    onSelect: (map_genesets_selected:ObservableMap<boolean>) => void;
}

@observer
export default class GenesetsVolcanoSelector extends React.Component<GenesetsVolcanoSelectorProps, {plotData:{x: number, y: number, fill: string}[]}>
{
    @observable tableData: Geneset[] = [];
    @observable allTableData: Geneset[] = [];
    maxY = 1;
    plotData = autorun(() => {
        const newPlotData: {x: number, y: number, fill: string}[] = [];
        for (const tableDatum of this.allTableData) {
            const xValue = tableDatum.representativeScore;
            const yValue = -(Math.log(tableDatum.representativePvalue)/Math.log(10));
            if (yValue > this.maxY) {
                this.maxY = yValue;
            }
            const fillColor = this.map_genesets_selected.get(tableDatum.name) ? "tomato" : "3786C2";
            newPlotData.push({x: xValue, y: yValue, fill: fillColor});
        }
        this.setState({plotData: newPlotData});
    });
    @observable selectedPercentile: {label: string, value: string} = {label: '75%', value: '75'};
    @observable isLoading = true;
    @observable percentileHasChanged = false;
    readonly percentileOptions = [{label: '50%', value: '50'}, {label: '75%', value: '75'}, {label: '100%', value: '100'}];
    @observable private map_genesets_selected = new ObservableMap<boolean>();
    constructor(props:GenesetsVolcanoSelectorProps)
    {
        super(props);
        this.state = {plotData: []};
        this.percentileChange = this.percentileChange.bind(this);
        this.updateSelectionFromPlot = this.updateSelectionFromPlot.bind(this);
    }
    
    componentDidMount()
    {
        this.fetchData();
    }
    
    componentDidUpdate()
    {
        if (this.percentileHasChanged) {
            this.isLoading = true;
            this.fetchData();
            this.percentileHasChanged = false;
        }
    }
    
    private columns:IColumnDefMap = {
            'genesets': {
                priority: 1,
                dataField: 'name',
                name: "Gene Sets",
                sortable: true,
                filterable: true,
            },
            'gsvaScore': {
                priority: 2,
                dataField: 'representativeScore',
                name: "GSVA Score",
                sortable: true,
                filterable: true,
                formatter: ({name, columnData: value}: IColumnFormatterData<Geneset>) => (
                        <Td key={name} column={name} value={value}>
                        {value.toFixed(2)}
                        </Td>
                    ),
            },
            'pValue': {
                priority: 3,
                dataField: 'representativePvalue',
                name: "P Value",
                sortable: true,
                filterable: true,
                formatter: ({name, columnData: value}: IColumnFormatterData<Geneset>) => (
                    <Td key={name} column={name} value={value}>
                    {toPrecision(value, 2, 0.1)}
                    </Td>
                ),
            },
            'selected': {
                name: "Selected",
                priority: 4,
                sortable: false,
                filterable: false,
                formatter: ({name, rowData: geneset}:IColumnFormatterData<Geneset>) => (
                    <Td key={name} column={name}>
                    {!!(geneset) && (
                            <div className={styles.selectionColumnCell}>
                            <Observer>
                            {() => (
                                <LabeledCheckbox
                                checked={!!this.map_genesets_selected.get(geneset.name)}
                                onChange={event => (this.map_genesets_selected.set(geneset.name, event.target.checked)) }
                            />
                            )}
                    </Observer>
                    </div>
                    )}
                    </Td>
                ),
            },
    };
    
    async fetchData() {
        const tableData: Geneset[] = [];
        const plotData: {x: number, y: number, fill: string}[] = [];
        const hierarchyData = await getHierarchyData(
                this.props.gsvaProfile, Number(this.selectedPercentile.value),0, 1, this.props.sampleListId);
        for (const node of hierarchyData) {
            if (_.has(node, 'genesets')) {
                for (const geneset of node.genesets) {
                    tableData.push({
                        genesetId: geneset.genesetId,
                        name: geneset.genesetId,
                        description : geneset.description,
                        representativeScore : geneset.representativeScore,
                        representativePvalue : geneset.representativePvalue,
                        refLink : geneset.refLink,
                    });
                }
            }
        }
        
        this.tableData = tableData;
        this.allTableData = tableData;
        this.isLoading = false;
    }
    
    percentileChange(val: {label: string, value: string} | null)
    {
        this.selectedPercentile = val || {label: '75%', value: '75'};
        this.percentileHasChanged = true;
    }
    
    updateSelectionFromPlot(points: any, bounds: any) {
        const selectedPoints = [];
        const newTableData: Geneset[] = [];
        const newPlotData = this.state.plotData;
        this.map_genesets_selected = new ObservableMap<boolean>();
        if (points && points[0].data) {
            for (const point of points[0].data) {
                selectedPoints.push({x: point.x, y: point.y});
            }
        }
        
        for (const tableDatum of this.tableData) {
            const xValue = tableDatum.representativeScore;
            const yValue = -(Math.log(tableDatum.representativePvalue)/Math.log(10));
            for (const selectedPoint of selectedPoints) {
                if (selectedPoint.x === xValue && selectedPoint.y === yValue) {
                    this.map_genesets_selected.set(tableDatum.name, true);
                    newTableData.push(tableDatum);
                }
            }
        }
        
        this.tableData = newTableData;
    }
    
    render()
    {
        return (
                <div className={styles.GenesetsVolcanoSelectorWindow} style={ {height:"400px"} }>
                <div style={{float: "left"}} className="form-inline">
                <label htmlFor="PercentileScoreCalculation">Percentile for score calculation:</label>
                <span style={{display: "inline-block", verticalAlign: "middle", marginLeft: "1em"}}>
                <ReactSelect
                    addLabelText="Percentile for score calculation"
                    style={{width:160, borderRadius: "2px"}}
                    clearable={false}
                    name="PercentileScoreCalculation"
                    value={this.selectedPercentile}
                    options={this.percentileOptions}
                    onChange={this.percentileChange}
                />
                </span>
                    <LoadingIndicator isLoading={this.isLoading} />
                {  (!this.isLoading) && (
                <VictoryChart
                    theme={VictoryTheme.material}
                    width={510}
                    containerComponent={
                        <VictorySelectionContainer
                            onSelection={this.updateSelectionFromPlot}/>
                        }
                >
                <VictoryAxis crossAxis
                    domain={[-1, 1.25]}
                    tickValues={[-1, -0.5, 0, 0.5, 1]}
                    style={{axisLabel: {padding: 35}}}
                    label={"GSVA score"}
                    theme={VictoryTheme.material}
                    offsetY={50}
                    standalone={false}
                />
                <VictoryAxis dependentAxis crossAxis
                    domain={[0, this.maxY]}
                    style={{axisLabel: {padding: 35}, stroke: "none"}}
                    label={"-log10 p-value"}
                    theme={VictoryTheme.material}
                    offsetX={50}
                    standalone={false}
                />
                <VictoryLabel
                    text="significance ↑"
                    datum={{ x:1, y: 1.3}}
                    textAnchor="start"
                />
                <VictoryLine
                    style={{
                      data: { stroke: "black", strokeDasharray:5 },
                      parent: { border: "dotted 1px #f00"}
                    }}
                    data={[
                      { x: -1.2, y: 1.3 },
                      { x: 1, y: 1.3 }
                    ]}
                />
                <VictoryLine
                    style={{
                      data: { stroke: "rgb(144, 164, 174)" },
                      parent: { border: "1px dashed solid"}
                    }}
                    data={[
                      { x: 0, y: 0 },
                      { x: 0, y: this.maxY }
                    ]}
                />
                  <VictoryScatter
                      style={{data: {fillOpacity: 0.3}}}
                      size={3}
                      data={this.state.plotData}
                  />
                </VictoryChart>
                      )
                  }
                </div>
                <div style={{float: "right", maxHeight: "356.5px", overflowY: "scroll", width: "650px"}}>
                <LoadingIndicator isLoading={this.isLoading} />
                {  (!this.isLoading) && (
                <GenesetsVolcanoTable
                    itemsName="genesets"
                    initItemsPerPage={10}
                    columns={this.columns}
                    rawData={this.tableData}
                    headerControlsProps={{
                        showCopyAndDownload: false,
                        showHideShowColumnButton: false,
                        showPagination: true,
                        }}
                    reactTableProps={{
                        className: "table table-striped table-border-top",
                        hideFilterInput:true,
                        defaultSort: this.columns.pValue.name,
                        }}
                /> )
                }
                </div>
                <div style={{clear: "both"}}>
                {  (!this.isLoading) && (
                       <button style={{marginTop:-20}} 
                className="btn btn-primary btn-sm pull-right"
                onClick={() => this.props.onSelect(this.map_genesets_selected)}
                >
                    Add selection to the query
                </button>) }
                {  (!this.isLoading) && (
                        <button style={{marginTop:-20, marginRight:15}} 
                    className="btn btn-primary btn-sm pull-right"
                    onClick={() => (this.map_genesets_selected = new ObservableMap<boolean>(),
                                this.tableData = this.allTableData)}
                    >
                        Clear selection
                    </button>
                        )}
                </div>
                </div>
        );
    }
}

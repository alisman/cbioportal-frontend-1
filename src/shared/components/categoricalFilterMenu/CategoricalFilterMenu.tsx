import * as React from 'react';
import * as _ from 'lodash';
import { action, computed, makeObservable } from 'mobx';
import { Checkbox } from 'react-bootstrap';
import { inputBoxChangeTimeoutEvent } from 'shared/lib/EventUtils';

export interface ICategoricalFilterMenuProps {
    id: string;
    currSelections: Set<string>;
    allSelections: Set<string>;
    updateFilterType: (newFilterType: string) => void;
    updateFilterString: (newFilterString: string) => void;
    toggleSelection: (selection: string) => void;
}

export default class CategoricalFilterMenu extends React.Component<
    ICategoricalFilterMenuProps,
    {}
> {
    constructor(props: ICategoricalFilterMenuProps) {
        super(props);
        makeObservable(this);
    }

    @action
    private onChangeFilterType(e: any) {
        const newFilterType = e.target.value;
        this.props.updateFilterType(newFilterType);
    }

    @action
    private onChangeFilterString() {
        return (() =>
            inputBoxChangeTimeoutEvent(input => {
                this.props.updateFilterString(input);
            }, 400))();
    }

    @action.bound
    private onChangeSelection(e: any) {
        const id = e.currentTarget.getAttribute('data-id');
        if (id) {
            this.props.toggleSelection(id);
            this.forceUpdate();
        }
    }

    @computed get filterTypeDropdown() {
        return (
            <select
                className="btn btn-default btn-sm"
                onChange={(e: any) => this.onChangeFilterType(e)}
            >
                <option value="contains">Contains</option>
                <option value="doesNotContain">Does Not Contain</option>
                <option value="equals">Equals</option>
                <option value="doesNotEqual">Does Not Equal</option>
                <option value="beginsWith">Begins With</option>
                <option value="doesNotBeginWith">Does Not Begin With</option>
                <option value="endsWith">Ends With</option>
                <option value="doesNotEndWith">Does Not End With</option>
                <option value="regex">Regex</option>
            </select>
        );
    }

    @action.bound
    private selectAll() {
        for (let selection of this.props.allSelections) {
            if (!this.props.currSelections.has(selection)) {
                this.props.toggleSelection(selection);
            }
        }
        this.forceUpdate();
    }

    @action.bound
    private deselectAll() {
        for (let selection of this.props.allSelections) {
            if (this.props.currSelections.has(selection)) {
                this.props.toggleSelection(selection);
            }
        }
        this.forceUpdate();
    }

    @computed get selectDeselectAllButtons() {
        const showSelectAll =
            this.props.currSelections.size !== this.props.allSelections.size;
        const showDeselectAll = this.props.currSelections.size !== 0;
        return (
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                {showSelectAll && (
                    <button
                        className="btn btn-default btn-xs"
                        onClick={this.selectAll}
                    >
                        {`Select all (${this.props.allSelections.size})`}
                    </button>
                )}
                {showDeselectAll && (
                    <button
                        className="btn btn-default btn-xs"
                        onClick={this.deselectAll}
                    >
                        {'Deselect all'}
                    </button>
                )}
            </div>
        );
    }

    @computed get selectionCheckboxes() {
        const checkboxes: JSX.Element[] = [];
        this.props.allSelections.forEach(selection => {
            checkboxes.push(
                <li>
                    <Checkbox
                        data-id={selection}
                        onChange={this.onChangeSelection}
                        checked={this.props.currSelections.has(selection)}
                        inline
                    >
                        {selection}
                    </Checkbox>
                </li>
            );
        });
        return checkboxes;
    }

    render() {
        return (
            <div
                style={{
                    margin: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex' }}>
                    {this.filterTypeDropdown}
                    <input
                        onChange={this.onChangeFilterString()}
                        style={{ width: '160px' }}
                    />
                </div>

                <div style={{ marginTop: 10 }}>
                    {this.selectDeselectAllButtons}
                </div>

                <div
                    style={{
                        marginTop: 10,
                        paddingLeft: 10,
                        maxHeight: 250,
                        maxWidth: 320,
                        overflow: 'auto',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <ul className="list-unstyled">
                        {this.selectionCheckboxes}
                    </ul>
                </div>
            </div>
        );
    }
}

import * as React from 'react';
import queryStore from "./QueryStore";
import * as styles_any from './styles.module.scss';
import ReactSelect from 'react-select';
import {observer} from "mobx-react";
import {computed} from 'mobx';
import {FlexRow, FlexCol} from "../flexbox/FlexBox";
import gene_lists from './gene_lists';
import GeneSymbolValidator from "./GeneSymbolValidator";
import classNames from "../../lib/classNames";
import AsyncStatus from "../asyncStatus/AsyncStatus";
import {getOncoQueryDocUrl} from "../../api/urls";

const styles = styles_any as {
	GeneSetSelector: string,
	ReactSelect: string,
	buttonRow: string,
	geneSet: string,
	empty: string,
	notEmpty: string,
};

@observer
export default class GeneSetSelector extends React.Component<{}, {}>
{
	get store()
	{
		return queryStore;
	}

	@computed get selectedGeneListOption()
	{
		let option = this.geneListOptions.find(opt => opt.value == this.store.geneQuery);
		return option ? option.value : '';
	}

	@computed get geneListOptions()
	{
		return [
			{
				label: 'User-defined List',
				value: ''
			},
			...gene_lists.map(item => ({
				label: `${item.id} (${item.genes.length} genes)`,
				value: item.genes.join(' ')
			}))
		];
	}

	render()
	{
		return (
			<FlexCol padded overflow className={styles.GeneSetSelector}>
				<h2>Enter Gene Set:</h2>
				<a href={getOncoQueryDocUrl()}>Advanced: Onco Query Language (OQL)</a>
				<ReactSelect
					className={styles.ReactSelect}
					value={this.selectedGeneListOption}
					options={this.geneListOptions}
					onChange={option => this.store.geneQuery = option ? option.value : ''}
				/>

				<FlexRow padded className={styles.buttonRow}>
					<AsyncStatus promise={this.store.mutSigForSingleStudy}>
						{!!(this.store.mutSigForSingleStudy.result.length) && (
							<button onClick={() => this.store.showMutSigPopup = true}>
								Select from Recurrently Mutated Genes (MutSig)
							</button>
						)}
					</AsyncStatus>
					<AsyncStatus promise={this.store.gisticForSingleStudy}>
						{!!(this.store.gisticForSingleStudy.result.length) && (
							<button onClick={() => this.store.showGisticPopup = true}>
								Select Genes from Recurrent CNAs (Gistic)
							</button>
						)}
					</AsyncStatus>
				</FlexRow>

				<textarea
					className={classNames(styles.geneSet, this.store.geneQuery ? styles.notEmpty : styles.empty)}
					rows={5}
					cols={80}
					placeholder="Enter HUGO Gene Symbols or Gene Aliases"
					title="Enter HUGO Gene Symbols or Gene Aliases"
					value={this.store.geneQuery}
					onChange={event => {
						this.store.geneQuery = (event.target as HTMLTextAreaElement).value;
					}}
				/>

				<GeneSymbolValidator/>
			</FlexCol>
		);
	}
}

type TODO = any;

export default function (data: TODO) {

    const output: { columns:TODO, items:TODO } = { columns: [], items: {} };

    data.forEach((sample: TODO) => {
        const sampleId = sample.id;

        output.columns.push({ id: sampleId });

        sample.clinicalData.forEach((dataItem: TODO) => {
            output.items[dataItem.id] = output.items[dataItem.id] || {};
            output.items[dataItem.id][sampleId] = dataItem.value.toString();
            output.items[dataItem.id].name = dataItem.name;
            output.items[dataItem.id].id = dataItem.id;
        });
    });

    return output;
}

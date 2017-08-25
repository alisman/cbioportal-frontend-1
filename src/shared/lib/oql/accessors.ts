var cna_profile_data_to_string = {
    "-2": "homdel",
    "-1": "hetloss",
    "0": null,
    "1": "gain",
    "2": "amp"
};

const accessors = {
    'gene': function (d: Mutation | ) {
        return d.hugo_gene_symbol;
    },
    'cna': function (d) {
        if (d.genetic_alteration_type === 'COPY_NUMBER_ALTERATION') {
            return cna_profile_data_to_string[d.profile_data];
        } else {
            return null;
        }
    },
    'mut_type': function (d) {
        if (d.genetic_alteration_type === 'MUTATION_EXTENDED') {
            if (d.simplified_mutation_type === "fusion") {
                return null;
            } else if (d.amino_acid_change.toLowerCase() === "promoter") {
                return "promoter";
            } else {
                return d.simplified_mutation_type;
            }
        } else {
            return null;
        }
    },
    'mut_position': function (d) {
        if (d.genetic_alteration_type === 'MUTATION_EXTENDED') {
            var start = d.protein_start_position;
            var end = d.protein_end_position;
            if (start !== null && end !== null) {
                return [parseInt(start, 10), parseInt(end, 10)];
            } else {
                return null;
            }
        } else {
            return null;
        }
    },
    'mut_amino_acid_change': function (d) {
        if (d.genetic_alteration_type === 'MUTATION_EXTENDED') {
            return d.amino_acid_change;
        } else {
            return null;
        }
    },
    'exp': function (d) {
        if (d.genetic_alteration_type === 'MRNA_EXPRESSION') {
            return parseFloat(d.profile_data);
        } else {
            return null;
        }
    },
    'prot': function (d) {
        if (d.genetic_alteration_type === 'PROTEIN_LEVEL') {
            return parseFloat(d.profile_data);
        } else {
            return null;
        }
    },
    'fusion': function (d) {
        if (d.genetic_alteration_type === 'MUTATION_EXTENDED') {
            return (d.simplified_mutation_type === "fusion");
        } else {
            return null;
        }
    }
}

export default accessors;
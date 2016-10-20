// this is just to ts doesn't get annoyed by temporary use of require bellow
declare var require: any

import * as React from 'react';

// not sure why by typescript doesn't like es6 import version of this
const ImmutableObject = require('seamless-immutable').ImmutableObject;

interface Person
{
    firstName:string,
    lastName:string,
    skills:string[]
}

const apiResponse : Person = { firstName:'Aaron', lastName:'Lisman', skills:[] };

// this is how it would exist in store (wrapped in SeamlessImmutable)
let immutableApiResponse : Person = ImmutableObject(apiResponse);

interface ExampleProps
{
    myData:Person
}

interface ExampleState
{

}

class ExampleComponent extends React.Component<ExampleProps, ExampleState>
{
    render(){
        // misspelling of firstName prop (casing) causes ts error
        //return (<div>{this.props.myData.firstname}</div>)

        // code complete offers correct properties
        return (<div>{this.props.myData.firstName}</div>)

    }
}



interface ExamplePageProps
{
}

interface ExamplePageState
{
}

export default class ExamplePage extends React.Component<ExamplePageProps, ExamplePageState>
{
    render()
    {
        return (<ExampleComponent myData={immutableApiResponse} />);
    }
};


// this is just to ts doesn't get annoyed by temporary use of require bellow
declare var require: any

import * as React from 'react';

// not sure why by typescript doesn't like es6 import version of this
const SeamlessImmutable = require('seamless-immutable');

// this should only be necessary in reducers where mutation is performed
// we need to generate typing for seamless immutable with option members
// @andy maybe there is a more elegant ways to do this?
// also, not sure it's possible to type the set method based key.  is that a problem?
interface myImmututable {

    get?:any
    set?:any,
    setIn?:any

}

// in this solution, our data types need to extend the base immutable object so that typescript
// doesn't yell when we call immutable methods on it
interface Person extends myImmututable
{
    firstName:string,
    lastName:string,
    skills:string[]
}

const apiResponse : Person = { firstName:'Aaron', lastName:'Lisman', skills:["1","2","3"] };

// this is how it would exist in store (wrapped in SeamlessImmutable)
let immutableApiResponse : Person = SeamlessImmutable(apiResponse);

// mutation should only ever be performed in reducers
let mutated = immutableApiResponse.set('firstName','Nora');

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


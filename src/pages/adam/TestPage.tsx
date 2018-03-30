import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as _ from 'lodash';
import $ from 'jquery';
import {observer, Observer} from "mobx-react";
import {MSKTab, MSKTabs} from "../../shared/components/MSKTabs/MSKTabs";
import {computed, observable} from "mobx";
import {remoteData} from "../../shared/api/remoteData";
import MobxPromise from "mobxpromise";


const win = (window as any);

class Store {

    constructor(){

        this.someData.result; // invoke outside of reaction to init cached
        this.someData2.result; // invoke outside of reaction to init cached
    }

    @observable someProp:number = performance.now();

    readonly someData = remoteData({
          invoke:()=>{
              const moo = this.someComputed;
              console.log("some data invoked");
              return new Promise((resolve)=>{
                 setTimeout(()=>{
                     resolve(moo);
                 },1000);
              });
          }
    });

    readonly someData2 = remoteData({
        invoke:()=>{
            const moo = this.someComputed2;
            console.log("some data 2 invoked");
            return new Promise((resolve)=>{
                setTimeout(()=>{
                    resolve(moo);
                },1000);
            });
        }
    });

    @computed get someComputed() {
        console.log("someComputed()");
        return this.someProp;
    }

    @computed get someComputed2() {
        console.log("someComputed2()");
        return this.someProp;
    }

};

const store = new Store();

@observer
class TestCom extends React.Component<{name:string; getter:()=>any}, {}> {
    render(){
        return <div><h1>{this.props.name}</h1><div>{this.props.getter()}</div></div>
    }
}



@observer
export default class TestPage extends React.Component<{}, {}> {


    @observable activeId:string = 'one';

    public render() {


        return (<Observer>
            {()=>(<MSKTabs unmountOnHide={true} activeTabId={this.activeId}  onTabClick={(id:string)=>this.activeId=id}>

            <MSKTab id={'one'}  linkText={'one'}>
                <TestCom name={'one'} getter={()=>store.someComputed}/>
            </MSKTab>

            <MSKTab id={'two'} linkText={'two'}>
                <TestCom name={'two'} getter={()=>store.someComputed2}/>
                <a onClick={()=>store.someProp = performance.now()}>change it</a>
            </MSKTab>

        </MSKTabs>)}
        </Observer>);
    }
}

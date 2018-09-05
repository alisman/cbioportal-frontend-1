import { RouterStore } from 'mobx-react-router';
import {action, computed, observable, runInAction} from 'mobx';
import * as _ from 'lodash';
import URL, {QueryParams} from 'url';
import {remoteData} from "../api/remoteData";
import sessionClient from "../api/sessionServiceInstance";
import AppConfig from "appConfig";

export function getSessionKey(hash:string){
    return `session_${hash}`
}

export interface PortalSession {
    id:string;
    query:{ [key:string] : any };
    path:string;
}

function saveRemoteSession(data:any){
    return sessionClient.saveSession(data);
}

function getRemoteSession(sessionId:string){
    return sessionClient.getSession(sessionId)
}

function normalizeLegacySession(sessionData:any){
    // legacy sessions were stored with values as first item in arrays, so undo this
    sessionData.data = _.mapValues(sessionData.data, (value: any) => {
        if (_.isArray(value)) {
            return value[0];
        } else {
            return value;
        }
    });

    // convert cancer_study_id to cancer_study_list and get rid of cancer_study_id
    if (sessionData.data.cancer_study_id && !sessionData.data.cancer_study_list) {
        sessionData.data.cancer_study_list = sessionData.data.cancer_study_id;
    }
    delete sessionData.data.cancer_study_id;

    return sessionData;
}


export default class ExtendedRouterStore extends RouterStore {

    // this has to be computed to avoid annoying problem where
    // remoteSessionData fires every time new route is pushed, even
    // if sessionId has stayed the same
    @computed get sessionId(){
        return this.location.query.session_id;
    }

    remoteSessionData = remoteData({
        invoke: async () => {
            if (this.sessionId && this.sessionId !== "pending") {
                let sessionData = await getRemoteSession(this.sessionId);

                // if it has no version, it's a legacy session and needs to be normalized
                if (sessionData.version === undefined) {
                    sessionData = normalizeLegacySession(sessionData);
                }

                return sessionData;
            } else {
                return undefined;
            }

        },
        onResult:()=> {
            if (this.remoteSessionData.result) {
                this._session = {
                    id: this.remoteSessionData.result!.id,
                    query: this.remoteSessionData.result!.data,
                    path: this.location.pathname
                };
            } else {
                if (this._session && this._session.id !== "pending") delete this._session;
            }
        }
    });

    sessionEnabledForPath(path:string){
        const tests = [
          /^\/results/,
        ];
        return _.some(tests,(test)=>test.test(path));
    }

    @action updateRoute(newParams: QueryParams, path = this.location.pathname) {

        let newQuery = _.clone(this.query);

        _.each(newParams, (v, k: string)=>{
            if (v === undefined) {
                delete newQuery[k];
            } else {
                newQuery[k] = v;
            }
        });

        // put a leading slash if there isn't one
        path = URL.resolve('/', path);

        // we don't use session
        if (!this.sessionEnabledForPath(path) || JSON.stringify(newQuery).length < (AppConfig.urlLengthThresholdForSession || 10)){
            this.push( URL.format({pathname: path, query: newQuery, hash:this.location.hash}) );
        } else {
            // we are using session: do we need to make a new session?
            if (!this._session || _.size(newParams) > 0) {
                const pendingSession = {
                    id:'pending',
                    query:newQuery,
                    path:path
                };
                // add session version
                pendingSession.query.version = 2;
                this._session = pendingSession;
                this.push( URL.format({pathname: path, query: { session_id:'pending'}, hash:this.location.hash}) );
                saveRemoteSession(pendingSession.query).then((key)=>{
                    this._session!.id = key.id;
                    // we use replace because we don't want the pending state in the history
                    this.replace( URL.format({pathname: path, query: {session_id:key.id}, hash:this.location.hash}) );
                });
            } else { // we already have a session but we only need to update path or hash
                this.push( URL.format({pathname: path, query: {session_id:this._session.id}, hash:this.location.hash}) );
            }
        }

    }

    @observable public _session:PortalSession | null = null;

    @computed
    public get query(){
        if (this.location.query.session_id && this._session) {
            return this._session.query;
        } else {
            return this.location.query;
        }
    }

}

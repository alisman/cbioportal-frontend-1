import {autorun, computed, extendObservable, intercept, IObservableObject, IReactionDisposer, observable} from "mobx";
import ExtendedRouterStore from "./ExtendedRouterStore";

export type Property<T> = {
    name: keyof T,
    isSessionProp: boolean,
    aliases?: string[],
};



export default class URLWrapper<QueryParamsType extends { [key:string] : string | undefined }> {
    public query:QueryParamsType;
    public reactionDisposer: IReactionDisposer;
    protected pathContext:string;

    constructor(
        protected routing:ExtendedRouterStore,
        protected properties:Property<QueryParamsType>[]
    ) {
        const initValues:Partial<QueryParamsType> = {};
        for (const property of properties) {
            initValues[property.name] = (routing.query as QueryParamsType)[property.name];
        }
        this.query = observable<QueryParamsType>(initValues as QueryParamsType);

        intercept(this.query, change=>{
            if (change.newValue === this.query[change.name as keyof QueryParamsType]) {
                // if same value, cancel change to prevent unnecessary changing data
                return null;
            } else {
                return change;
            }
        });
        this.reactionDisposer = autorun(()=>{
            const query = routing.query as QueryParamsType;
            // if there is a path context and it is not
            if (this.pathContext && !(new RegExp(`^/*${this.pathContext}`)).test(routing.location.pathname)) {
                return;
            }
            for (const property of properties) {
                // @ts-ignore
                this.setProperty(property, query);
                //this.query[property.name] = typeof query[property.name] === "string" ? decodeURIComponent(query[property.name]) : undefined;
            }
        });
    }

    public updateQuery(query:Partial<QueryParamsType>) {
        this.routing.updateRoute(query as any);
    }

    private setProperty(property:Property<QueryParamsType>, query:QueryParamsType){
        this._setPropertyAndHandleUndefined(property, query[property.name]);
        // if it's still undefined, then check aliases
        if (this.query[property.name] === undefined && property.aliases && property.aliases.length) {
            for (const alias of property.aliases) {
                this._setPropertyAndHandleUndefined(property, query[alias]);
                // once you've set it, don't bother with any other aliases
                if (this.query[property.name]) break;
            }
        }
    }

    private _setPropertyAndHandleUndefined(property:Property<QueryParamsType>, value:string|undefined){
        // @ts-ignore
        this.query[property.name] = typeof value === "string" ? decodeURIComponent(value) : undefined;
    }

    public getSessionProps() {
        const ret:Partial<QueryParamsType> = {};
        for (const property of this.properties) {
            if (property.isSessionProp) {
                ret[property.name] = this.query[property.name];
            }
        }
        return ret;
    }

    @computed public get pathName() {
        return this.routing.location.pathname;
    }

    public destroy(){
        this.reactionDisposer();
    }

}
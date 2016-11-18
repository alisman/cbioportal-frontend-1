import * as React from 'react';

interface IReactPlotlyJSProps {
    config: any;
}

declare class ReactPlotlyJS extends React.Component<IReactPlotlyJSProps, any> {
}


declare module 'react-plotlyjs' {
    export = ReactPlotlyJS;
}

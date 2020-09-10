import { extendCBioPortalAPI } from 'shared/lib/extendCBioPortalAPI';
import { OncoKbAPI } from 'oncokb-ts-api-client';

const ExtendedOncoKbAPI = extendCBioPortalAPI(OncoKbAPI);

const client = new ExtendedOncoKbAPI();

client.defaultError = function(error: any) {
    // try to derive url
    let url = 'N/A';
    try {
        url = error.response.req.url;
    } catch (e) {}

    return {
        mode: 'alert',
        title: `There has been an error retrieving data from the oncokb api (URL: ${url})`,
    };
};

export default client;

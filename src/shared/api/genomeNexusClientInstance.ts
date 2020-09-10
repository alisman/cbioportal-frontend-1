import { GenomeNexusAPI } from 'genome-nexus-ts-api-client';
import { extendCBioPortalAPI } from 'shared/lib/extendCBioPortalAPI';

async function checkVersion(client: GenomeNexusAPI) {
    const versionResp = await client.fetchVersionGET({});
    if (parseInt(versionResp.version.split('.')[0]) !== 1) {
        console.error(
            'Expected version of Genome Nexus to be 1.x.y, but found: ' +
                versionResp.version
        );
    }
}

const ExtendedGenomeNexusAPI = extendCBioPortalAPI(GenomeNexusAPI);

const client = new ExtendedGenomeNexusAPI();

client.defaultError = function(error: any) {
    // try to derive url
    return {
        mode: 'screen',
        title: `There has been an error retrieving data from the GenomeNexus api`,
    };
};

export default client;

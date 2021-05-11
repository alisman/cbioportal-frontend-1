const assert = require('chai').assert;
const postEndpointMaxResponseTime = require('../../../shared/specUtils')
    .postEndpointMaxResponseTime;
const goToUrlAndSetLocalStorage = require('../../../shared/specUtils')
    .goToUrlAndSetLocalStorage;
const waitForNetworkQuiet = require('../../../shared/specUtils')
    .waitForNetworkQuiet;
const CBIOPORTAL_URL = process.env.CBIOPORTAL_URL.replace(/\/$/, '');

describe('Endpoints performance tests', () => {
    it.skip('Mutated-genes endpoint should return in 2s', () => {
        goToUrlAndSetLocalStorage(CBIOPORTAL_URL, true);
        // endpoint url
        const URL = CBIOPORTAL_URL + '/api/mutated-genes/fetch';
        // run 5 times
        const RUN_TIMES = 5;
        // default max response time: 1s
        const MAX_TIME = 2000;
        // study: Test study es_0
        const REQUEST_BODY = require('./performance_test_request_body.json');
        assert.isAtMost(
            postEndpointMaxResponseTime(URL, REQUEST_BODY, RUN_TIMES),
            MAX_TIME,
            'all mutated-gene queries should be less than 2s'
        );
    });
});

describe('Page loading time test', () => {
    it('Study view page should load in 20s', () => {
        goToUrlAndSetLocalStorage(
            `${CBIOPORTAL_URL}/study/summary?id=study_es_0`,
            true
        );
        waitForNetworkQuiet(200000);
    });
});

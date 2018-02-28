var assert = require('assert');
var expect = require('chai').expect;
var waitForOncoprint = require('./specUtils').waitForOncoprint;
var assertScreenShotMatch = require('../lib/testUtils').assertScreenShotMatch;

const CBIOPORTAL_URL = process.env.CBIOPORTAL_URL.replace(/\/$/, "");

function runResultsTests(){

    it.skip('render the oncoprint', function(){
        waitForOncoprint();
        browser.pause(2000);
        var res = browser.checkElement('#oncoprint');
        assertScreenShotMatch(res);
    });

    // can't get it to pass reliably
    it.skip('igv_tab tab', function(){
        browser.click("[href='#igv_tab']");
        browser.waitForExist('#cnSegmentsFrame', 20000);
        var res = browser.checkElement('#igv_tab',{hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it('cancer type summary', function(){
        browser.click("[href='#pancancer_study_summary']");
        browser.waitForVisible('[data-test="cancerTypeSummaryChart"]',10000);
        var res = browser.checkElement('#pancancer_study_summary', { hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it('mutex tab', function(){
        browser.click("[href='#mutex']");
        var res = browser.checkElement('#mutex',{ hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it('plots tab', function(){
        browser.click("[href='#plots']");
        browser.waitForExist('#plots-box svg',10000);
        var res = browser.checkElement('#plots', { hide:['.qtip'], misMatchTolerance:1 });
        assertScreenShotMatch(res);
    });

    it.skip('mutation tab', function(){
        browser.click("[href='#mutation_details']");
        browser.waitForVisible('.borderedChart svg',20000);
        var res = browser.checkElement('#mutation_details',{hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it('coexpression tab', function(){
        browser.click("[href='#coexp']");
        browser.waitForVisible('#coexp_table_div_KRAS',10000);
        var res = browser.checkElement('#coexp',{hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it.only('survival tab', function(){
        browser.click("[href='#survival']");
        browser.waitForVisible('[data-test=SurvivalChart] svg',10000);
        var res = browser.checkElement('#survival');
        assertScreenShotMatch(res);
    });

    it('network tab', function(){
        browser.click("[href='#network']");
        browser.waitForVisible('#cytoscapeweb canvas',20000);
        var res = browser.checkElement("#network",{hide:['.qtip','canvas'] });
        assertScreenShotMatch(res);
    });

    it.skip('data_download tab', function(){
        browser.click("[href='#data_download']");
        //  browser.pause(1000);
        browser.waitForExist("#text_area_gene_alteration_freq",20000);
        browser.waitUntil(function(){ return browser.getValue("#text_area_gene_alteration_freq").length > 0 },20000);
        var res = browser.checkElement('#data_download',{hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

    it('bookmark tab', function(){
        browser.click("[href='#bookmark_email']");
        browser.waitForExist('#session-id a',10000);
        var res = browser.checkElement('#bookmark_email', {hide:['.qtip'] });
        assertScreenShotMatch(res);
    });

}

describe('result page screenshot tests', function(){
    before(function(){
        var url = `${CBIOPORTAL_URL}/index.do?tab_index=tab_visualize&cancer_study_list=coadread_tcga_pub&cancer_study_id=coadread_tcga_pub&genetic_profile_ids_PROFILE_MUTATION_EXTENDED=coadread_tcga_pub_mutations&genetic_profile_ids_PROFILE_COPY_NUMBER_ALTERATION=coadread_tcga_pub_gistic&Z_SCORE_THRESHOLD=2.0&case_set_id=coadread_tcga_pub_nonhypermut&case_ids=&gene_list=KRAS+NRAS+BRAF&gene_set_choice=user-defined-list&Action=Submit&show_samples=false&`;
        browser.url(url);
        browser.localStorage('POST', {key: 'localdev', value: 'true'});
        browser.refresh();
    });

    runResultsTests()


});

// describe('result page tabs, loading from session id', function(){
//     before(function(){
//         var url = `${CBIOPORTAL_URL}/index.do?session_id=596f9fa3498e5df2e292bdfd`;
//         browser.url(url);
//         browser.localStorage('POST', {key: 'localdev', value: 'true'});
//         browser.refresh();
//     });
//
//     runResultsTests();
//
// });

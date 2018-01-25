function waitForOncoprint(timeout) {
    browser.pause(100); // give oncoprint time to disappear
    browser.waitForExist('#oncoprint-inner svg rect', 10000); // as a proxy for oncoprint being rendered, wait for an svg rectangle to appear in the legend
}

module.exports = {
    waitForOncoprint: waitForOncoprint
};
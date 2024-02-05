"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var csvParser = require("csv-parser");
var csv_writer_1 = require("csv-writer");
var zips = new Map();
var ratesByZip = new Map();
// Adjusted to account for multiple counties or rate areas within a single ZIP code
fs.createReadStream('zips.csv')
    .pipe(csvParser())
    .on('data', function (data) {
    var zipcode = data.zipcode, state = data.state, rateArea = data.rate_area;
    if (!zips.has(zipcode)) {
        zips.set(zipcode, { zipcode: zipcode, state: state, rateAreas: new Set([parseInt(rateArea, 10)]) });
    }
    else {
        zips.get(zipcode).rateAreas.add(parseInt(rateArea, 10));
    }
})
    .on('end', function () {
    loadPlans();
});
function loadPlans() {
    fs.createReadStream('plans.csv')
        .pipe(csvParser())
        .on('data', function (data) {
        if (data.metal_level === 'Silver') {
            var plan_1 = { state: data.state, rateArea: parseInt(data.rate_area, 10), rate: parseFloat(data.rate) };
            zips.forEach(function (zipInfo, zipcode) {
                if (zipInfo.state === plan_1.state && zipInfo.rateAreas.has(plan_1.rateArea)) {
                    if (!ratesByZip.has(zipcode)) {
                        ratesByZip.set(zipcode, []);
                    }
                    ratesByZip.get(zipcode).push(plan_1.rate);
                }
            });
        }
    })
        .on('end', function () {
        updateSLCSP();
    });
}
function updateSLCSP() {
    var slcspRows = [];
    fs.createReadStream('slcsp.csv')
        .pipe(csvParser())
        .on('data', function (data) {
        var zipcode = data.zipcode;
        var zipInfo = zips.get(zipcode);
        if (zipInfo && zipInfo.rateAreas.size === 1) { // Ensure only one rate area per ZIP code
            var rates = ratesByZip.get(zipcode);
            if (rates) {
                var uniqueSortedRates = Array.from(new Set(rates)).sort(function (a, b) { return a - b; });
                if (uniqueSortedRates.length > 1) {
                    slcspRows.push({ zipcode: zipcode, rate: uniqueSortedRates[1].toFixed(2) });
                }
                else {
                    slcspRows.push({ zipcode: zipcode, rate: '' });
                }
            }
            else {
                slcspRows.push({ zipcode: zipcode, rate: '' });
            }
        }
        else {
            // Leave rate blank if ZIP code spans multiple rate areas or if ZIP info is ambiguous
            slcspRows.push({ zipcode: zipcode, rate: '' });
        }
    })
        .on('end', function () {
        writeSLCSP(slcspRows);
    });
}
function writeSLCSP(rows) {
    var csvWriter = (0, csv_writer_1.createObjectCsvWriter)({
        path: 'updated_slcsp.csv',
        header: [
            { id: 'zipcode', title: 'zipcode' },
            { id: 'rate', title: 'rate' }
        ],
        append: false,
    });
    csvWriter
        .writeRecords(rows)
        .then(function () { return console.log('SLCSP rates updated successfully.'); });
}

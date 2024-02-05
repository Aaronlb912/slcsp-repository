import fs from 'fs';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

interface ZipInfo {
  zipcode: string;
  state: string;
  rateArea: number;
}

interface Plan {
  state: string;
  rateArea: number;
  rate: number;
}

const zips = new Map<string, ZipInfo>();
const ratesByZip = new Map<string, number[]>();

// Step 1: Load ZIP codes and their corresponding state and rate area from zips.csv
fs.createReadStream('zips.csv')
  .pipe(csvParser())
  .on('data', (data) => {
    const { zipcode, state, rate_area: rateArea } = data;
    // Assuming each ZIP code corresponds to a unique state and rate area combination
    zips.set(zipcode, { zipcode, state, rateArea: parseInt(rateArea, 10) });
  })
  .on('end', () => {
    // Step 2: After loading ZIPs, proceed to read plans.csv
    loadPlans();
  });

function loadPlans() {
  fs.createReadStream('plans.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      if (data.metal_level === 'Silver') {
        const { state, rate_area: rateArea, rate } = data;
        zips.forEach(({ state: zipState, rateArea: zipRateArea }, zipcode) => {
          if (state === zipState && parseInt(rateArea, 10) === zipRateArea) {
            if (!ratesByZip.has(zipcode)) {
              ratesByZip.set(zipcode, []);
            }
            ratesByZip.get(zipcode)!.push(parseFloat(rate));
          }
        });
      }
    })
    .on('end', () => {
      // Step 3: After loading plans, update SLCSP rates
      updateSLCSP();
    });
}

function updateSLCSP() {
  const slcspRows = [];
  fs.createReadStream('slcsp.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      const zipcode = data.zipcode;
      const rates = ratesByZip.get(zipcode);
      if (rates && rates.length > 1) {
        const sortedRates = rates.sort((a, b) => a - b);
        const secondLowestRate = sortedRates[1]; // Get the second lowest rate
        slcspRows.push({ zipcode, rate: secondLowestRate.toFixed(2) });
      } else {
        // If no second lowest rate, leave the rate blank
        slcspRows.push({ zipcode, rate: '' });
      }
    })
    .on('end', () => {
      writeSLCSP(slcspRows);
    });
}

function writeSLCSP(rows: Array<{ zipcode: string; rate: string }>) {
  const csvWriter = createObjectCsvWriter({
    path: 'updated_slcsp.csv',
    header: [
      { id: 'zipcode', title: 'zipcode' },
      { id: 'rate', title: 'rate' }
    ],
    append: false,
  });

  csvWriter
    .writeRecords(rows)
    .then(() => console.log('SLCSP rates updated successfully.'));
}


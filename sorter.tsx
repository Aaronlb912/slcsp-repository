import * as fs from 'fs';
import * as csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

// Define interfaces for ZIP information and health plans for clarity and type safety.
interface ZipInfo {
  zipcode: string;
  state: string;
  rateAreas: Set<number>;
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
    if (!zips.has(zipcode)) {
      zips.set(zipcode, { zipcode, state, rateAreas: new Set([parseInt(rateArea, 10)]) });
    } else {
      zips.get(zipcode)!.rateAreas.add(parseInt(rateArea, 10));
    }
  })
  .on('end', () => {
    loadPlans();
  });

// Step 2: After loading ZIPs, proceed to read plans.csv
function loadPlans() {
  fs.createReadStream('plans.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      if (data.metal_level === 'Silver') {
        const plan = { state: data.state, rateArea: parseInt(data.rate_area, 10), rate: parseFloat(data.rate) };
        zips.forEach((zipInfo, zipcode) => {
          if (zipInfo.state === plan.state && zipInfo.rateAreas.has(plan.rateArea)) {
            if (!ratesByZip.has(zipcode)) {
              ratesByZip.set(zipcode, []);
            }
            ratesByZip.get(zipcode)!.push(plan.rate);
          }
        });
      }
    })
    .on('end', () => {
      updateSLCSP();
    });
}


function updateSLCSP() {
  const slcspRows = [];
  fs.createReadStream('slcsp.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      const zipcode = data.zipcode;
      const zipInfo = zips.get(zipcode);
      if (zipInfo && zipInfo.rateAreas.size === 1) { // Ensure only one rate area per ZIP code
        const rates = ratesByZip.get(zipcode);
        if (rates) {
          // Remove duplicate rates and sort to find the second lowest rate.          
          const uniqueSortedRates = Array.from(new Set(rates)).sort((a, b) => a - b);
          if (uniqueSortedRates.length > 1) {
            slcspRows.push({ zipcode, rate: uniqueSortedRates[1].toFixed(2) });
          } else {
            slcspRows.push({ zipcode, rate: '' });
          }
        } else {
          slcspRows.push({ zipcode, rate: '' });
        }
      } else {
        // Leave rate blank if ZIP code spans multiple rate areas or if ZIP info is ambiguous
        slcspRows.push({ zipcode, rate: '' });
      }
    })
    .on('end', () => {
      writeSLCSP(slcspRows);
    });
}

// Write the calculated SLCSP rates to 'updated_slcsp.csv'.
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

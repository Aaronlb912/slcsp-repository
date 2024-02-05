import fs from 'fs';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

interface Plan {
  state: string;
  rate_area: number;
  rate: number;
}

interface Zip {
  zipcode: string;
  state: string;
  rate_area: number;
}

const plans: Plan[] = [];
const zips: Map<string, Zip[]> = new Map();
const slcsp: Map<string, number> = new Map();

// Read plans.csv to get silver plans
fs.createReadStream('plans.csv')
  .pipe(csvParser())
  .on('data', (data) => {
    if (data.metal_level === 'Silver') {
      plans.push({
        state: data.state,
        rate_area: parseInt(data.rate_area, 10),
        rate: parseFloat(data.rate),
      });
    }
  })
  .on('end', () => {
    readZips();
  });

// Read zips.csv to correlate ZIP codes with rate areas
function readZips() {
  fs.createReadStream('zips.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      const zipcode = data.zipcode;
      if (!zips.has(zipcode)) {
        zips.set(zipcode, []);
      }
      zips.get(zipcode)!.push({
        zipcode,
        state: data.state,
        rate_area: parseInt(data.rate_area, 10),
      });
    })
    .on('end', () => {
      calculateSLCSP();
    });
}

// Calculate SLCSP for each ZIP code in slcsp.csv
function calculateSLCSP() {
  fs.createReadStream('slcsp.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      const zipcode = data.zipcode;
      const zipInfo = zips.get(zipcode);
      if (!zipInfo || zipInfo.length === 0) {
        slcsp.set(zipcode, null);
        return;
      }

      const rates = new Set<number>();
      zipInfo.forEach((zip) => {
        plans.filter(plan => plan.state === zip.state && plan.rate_area === zip.rate_area)
             .forEach(plan => rates.add(plan.rate));
      });

      const sortedRates = Array.from(rates).sort((a, b) => a - b);
      if (sortedRates.length > 1) {
        slcsp.set(zipcode, sortedRates[1]);
      } else {
        slcsp.set(zipcode, null);
      }
    })
    .on('end', () => {
      writeResults();
    });
}

// Write results to stdout or a new CSV
function writeResults() {
  const csvWriter = createObjectCsvWriter({
    path: 'output_slcsp.csv',
    header: [
      { id: 'zipcode', title: 'zipcode' },
      { id: 'rate', title: 'rate' }
    ]
  });

  const records = Array.from(slcsp).map(([zipcode, rate]) => ({
    zipcode,
    rate: rate ? rate.toFixed(2) : '',
  }));

  csvWriter.writeRecords(records)
    .then(() => console.log('SLCSP calculation completed.'));
}


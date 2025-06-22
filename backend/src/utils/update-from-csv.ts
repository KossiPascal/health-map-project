import fs from 'fs';
import csv from 'csv-parser';
import axios from 'axios';


interface OrgUnit {
    id: string;
    latitude: number;
    longitude: number;
}


const DHIS2_URL = 'https://your-dhis2.org/api';
const basicAuth = Buffer.from('admin:district').toString('base64');


const fetchOrgUnitsWithGeo = async () => {
    try {
        const res = await axios.get(`${DHIS2_URL}/organisationUnits.json`, {
            headers: { Authorization: `Basic ${basicAuth}` },
            params: {
                fields: 'id,name,geometry,level,parent[id,name]',
                paging: false,
            },
        });

        const data = res.data.organisationUnits.map((ou: any) => ({
            id: ou.id,
            name: ou.name,
            latitude: ou.geometry?.coordinates?.[1] || null,
            longitude: ou.geometry?.coordinates?.[0] || null,
            level: ou.level,
            parent: ou.parent?.name || null,
        }));

        fs.writeFileSync('orgunits-geo.json', JSON.stringify(data, null, 2));
        console.log(`✅ Exported ${data.length} orgUnits`);
    } catch (e: any) {
        console.error('❌ Failed to fetch:', e.response?.data || e.message);
    }
};


const main = () => {
    const results: OrgUnit[] = [];
  
    fs.createReadStream('orgunits.csv')
      .pipe(csv())
      .on('data', (data) => {
        if (data.id && data.latitude && data.longitude) {
          results.push({
            id: data.id,
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude),
          });
        }
      })
      .on('end', async () => {
        const geoResults: any[] = [];
  
        for (const ou of results) {
          await updateOrgUnit(ou);
          geoResults.push({
            id: ou.id,
            latitude: ou.latitude,
            longitude: ou.longitude,
          });
        }
  
        fs.writeFileSync('orgunits-geo.json', JSON.stringify(geoResults, null, 2));
        console.log('✅ Finished and saved to orgunits-geo.json');
      });
  };

const updateOrgUnit = async (ou: OrgUnit) => {
    const geometry = {
        type: 'Point',
        coordinates: [ou.longitude, ou.latitude],
    };

    try {
        await axios.put(
            `${DHIS2_URL}/organisationUnits/${ou.id}`,
            { geometry },
            {
                headers: {
                    Authorization: `Basic ${basicAuth}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`✅ Updated ${ou.id}`);
    } catch (e: any) {
        console.error(`❌ Error updating ${ou.id}:`, e.response?.data || e.message);
    }
};

const run = () => {
    const results: OrgUnit[] = [];

    fs.createReadStream('orgunits.csv')
        .pipe(csv())
        .on('data', (data) => {
            if (data.id && data.latitude && data.longitude) {
                results.push({
                    id: data.id,
                    latitude: parseFloat(data.latitude),
                    longitude: parseFloat(data.longitude),
                });
            }
        })
        .on('end', async () => {
            for (const ou of results) {
                await updateOrgUnit(ou);
            }
        });
};

run();






// const run = async () => {
//   const fileData = fs.readFileSync('orgunits-geo.json', 'utf8');
//   const orgUnits: { id: string; latitude: number; longitude: number }[] = JSON.parse(fileData);

//   for (const ou of orgUnits) {
//     if (ou.latitude && ou.longitude) {
//       await updateOrgUnitGeometry(ou.id, ou.latitude, ou.longitude);
//     } else {
//       console.warn(`⚠️ Skipped ${ou.id} (missing coordinates)`);
//     }
//   }
// };
import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Configuration
const CONFIG = {
    oracle: {
        user: 'system',
        password: 'OraclePass123',
        connectString: 'localhost:1521/FREEPDB1'
    },
    dataset: {
        csvPath: 'C:\\musa\\Products Data\\archive\\fashion-dataset\\fashion-dataset\\styles.csv',
        jsonFolder: 'C:\\musa\\Products Data\\archive\\fashion-dataset\\fashion-dataset\\styles',
    },
    batchSize: 500
};

async function ingestDataset() {
    let conn;
    try {
        console.log('🚀 Starting Fashion Dataset Ingestion to Landing Zone...');
        
        conn = await oracledb.getConnection(CONFIG.oracle);
        console.log('✅ Connected to Oracle (FREEPDB1)');

        // Clear existing data for a fresh start
        console.log('🧹 Cleaning up Landing Zone...');
        await conn.execute('TRUNCATE TABLE ATTR_MGR.LANDING_FASHION_DATASET');
        await conn.commit();

        const fileStream = fs.createReadStream(CONFIG.dataset.csvPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let lineCount = 0;
        let batch = [];
        let totalIngested = 0;

        const insertSql = `
            INSERT INTO ATTR_MGR.LANDING_FASHION_DATASET (
                DATASET_ID, DISPLAY_NAME, MASTER_CATEGORY, SUB_CATEGORY, 
                ARTICLE_TYPE, BASE_COLOUR, GENDER, USAGE_TYPE, RAW_JSON
            ) VALUES (
                :1, :2, :3, :4, :5, :6, :7, :8, :9
            )
        `;

        for await (const line of rl) {
            lineCount++;
            if (lineCount === 1) continue; // Skip header

            const parts = line.split(',');
            if (parts.length < 10) continue;

            const id = parts[0];
            const gender = parts[1];
            const masterCat = parts[2];
            const subCat = parts[3];
            const articleType = parts[4];
            const colour = parts[5];
            const usage = parts[8];
            const displayName = parts[9];

            let rawJson = null;
            const jsonPath = path.join(CONFIG.dataset.jsonFolder, `${id}.json`);
            try {
                if (fs.existsSync(jsonPath)) {
                    rawJson = fs.readFileSync(jsonPath, 'utf8');
                }
            } catch (err) {
                // Ignore missing JSONs
            }

            batch.push([
                parseInt(id),
                displayName,
                masterCat,
                subCat,
                articleType,
                colour,
                gender,
                usage,
                rawJson
            ]);

            if (batch.length >= CONFIG.batchSize) {
                const result = await conn.executeMany(insertSql, batch);
                totalIngested += result.rowsAffected;
                console.log(`📦 Ingested ${totalIngested} records...`);
                batch = [];
                await conn.commit();
            }
        }

        if (batch.length > 0) {
            const result = await conn.executeMany(insertSql, batch);
            totalIngested += result.rowsAffected;
            await conn.commit();
        }

        console.log(`\n✨ INGESTION COMPLETE!`);
        console.log(`📊 Total records ingested: ${totalIngested}`);

    } catch (err) {
        console.error('❌ Ingestion Failed:', err);
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

ingestDataset();

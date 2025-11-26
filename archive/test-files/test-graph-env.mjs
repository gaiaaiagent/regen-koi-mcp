import pg from 'pg';
const { Pool } = pg;

// Check env vars
console.log('Environment variables:');
console.log('GRAPH_DB_HOST:', process.env.GRAPH_DB_HOST);
console.log('GRAPH_DB_PORT:', process.env.GRAPH_DB_PORT);
console.log('GRAPH_DB_NAME:', process.env.GRAPH_DB_NAME);
console.log('GRAPH_DB_USER:', process.env.GRAPH_DB_USER);
console.log('GRAPH_NAME:', process.env.GRAPH_NAME);

const pool = new Pool({
  host: process.env.GRAPH_DB_HOST || 'localhost',
  port: parseInt(process.env.GRAPH_DB_PORT || '5432'),
  database: process.env.GRAPH_DB_NAME || 'eliza',
  user: process.env.GRAPH_DB_USER || 'darrenzal',
  password: process.env.GRAPH_DB_PASSWORD || ''
});

async function test() {
  const client = await pool.connect();
  try {
    console.log('\nConnected to database');

    await client.query("LOAD 'age';");
    await client.query(`SET search_path = ag_catalog, "$user", public;`);

    const graphName = process.env.GRAPH_NAME || 'regen_graph';
    const query = `
      MATCH (k:Keeper)-[:HANDLES]->(m:Msg {name: 'MsgCreateBatch'})
      RETURN {keeper_name: k.name, keeper_file_path: k.file_path, keeper_line_number: k.line_number}
    `;

    const cypherQuery = `SELECT * FROM ag_catalog.cypher('${graphName}', $$ ${query} $$) as (result agtype)`;
    const result = await client.query(cypherQuery);

    console.log('Result rows:', result.rows.length);

    // Parse like graph_client does
    const parsed = result.rows.map(row => {
      const agtypeValue = row.result;
      if (typeof agtypeValue === 'string') {
        try {
          return JSON.parse(agtypeValue);
        } catch {
          return agtypeValue;
        }
      }
      return agtypeValue;
    });

    console.log('Parsed results:', JSON.stringify(parsed, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

test();

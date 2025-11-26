import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'eliza',
  user: 'darrenzal',
  password: ''
});

async function test() {
  const client = await pool.connect();
  try {
    console.log('Connected to database');

    await client.query("LOAD 'age';");
    await client.query(`SET search_path = ag_catalog, "$user", public;`);
    console.log('AGE loaded');

    const query = `
      MATCH (k:Keeper)-[:HANDLES]->(m:Msg {name: 'MsgCreateBatch'})
      RETURN {keeper_name: k.name, keeper_file_path: k.file_path, keeper_line_number: k.line_number}
    `;

    const cypherQuery = `SELECT * FROM ag_catalog.cypher('regen_graph', $$ ${query} $$) as (result agtype)`;
    console.log('Running query:', cypherQuery);

    const result = await client.query(cypherQuery);
    console.log('Result rows:', result.rows.length);
    console.log('Results:', JSON.stringify(result.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

test();

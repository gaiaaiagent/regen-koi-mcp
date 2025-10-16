import { SPARQLClient } from './dist/sparql-client-enhanced.js';

async function testQueries() {
    const client = new SPARQLClient();
    
    const testQueries = [
        "Who created projects related to climate?",
        "Find organizations that develop sustainability solutions",
        "What does Gregory Landua work on?",
        "Show relationships involving Regen Network",
        "Count how many unique predicates we have"
    ];

    console.log("=" * 60);
    console.log("TESTING NATURAL LANGUAGE TO SPARQL");
    console.log("=" * 60);

    for (const query of testQueries) {
        console.log(`\nQuery: ${query}`);
        console.log("-".repeat(40));
        
        try {
            // Generate SPARQL
            const sparql = await client.naturalLanguageToSparql(query, 10);
            console.log("Generated SPARQL:");
            console.log(sparql);
            
            // Execute query
            const results = await client.executeQuery(sparql);
            
            // Format results
            const formatted = client.formatResults(results, query);
            console.log("\nResults:");
            console.log(formatted);
            
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }
}

testQueries().catch(console.error);

#!/usr/bin/env python3
"""
KOI API Server - Self-contained API for the Regen KOI MCP Server

Provides endpoints for:
- Hybrid search (vector + keyword) - queries BOTH embedding tables
- Statistics
- Weekly digest generation

This server can be run locally or users can connect to the hosted version.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import os
import sys
import logging
from datetime import datetime, timedelta
import uvicorn
import httpx

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Try to import weekly aggregator (optional)
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'python'))
    from src.content.weekly_aggregator import WeeklyAggregator
    WEEKLY_DIGEST_AVAILABLE = True
except ImportError:
    WEEKLY_DIGEST_AVAILABLE = False
    logging.warning("Weekly digest functionality not available - install Python dependencies")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="KOI API Server",
    version="1.1.0",
    description="Knowledge Organization Infrastructure API for Regen Network"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration from environment
DB_CONFIG = {
    "host": os.getenv("KOI_DB_HOST", "localhost"),
    "port": int(os.getenv("KOI_DB_PORT", "5432")),
    "database": os.getenv("KOI_DB_NAME", "eliza"),
    "user": os.getenv("KOI_DB_USER", "postgres"),
    "password": os.getenv("KOI_DB_PASSWORD", "postgres")
}

# BGE embedding server URL
BGE_SERVER_URL = os.getenv("BGE_SERVER_URL", "http://localhost:8090")

def get_db_connection():
    """Create database connection"""
    try:
        return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise HTTPException(status_code=503, detail="Database connection failed")

def get_bge_embedding(text: str) -> Optional[List[float]]:
    """Get BGE embedding for text"""
    import requests
    try:
        response = requests.post(
            f"{BGE_SERVER_URL}/encode",
            json={"text": text},
            timeout=10
        )
        if response.ok:
            return response.json().get("embedding")
    except Exception as e:
        logger.warning(f"BGE embedding failed: {e}")
    return None

# Pydantic models
class SearchRequest(BaseModel):
    # Support both 'query' and 'question' for compatibility
    query: Optional[str] = None
    question: Optional[str] = None
    limit: int = 5
    published_from: Optional[str] = None
    published_to: Optional[str] = None
    include_undated: bool = False
    filters: Optional[Dict[str, Any]] = None
    include_metadata: bool = True

class SearchResult(BaseModel):
    rid: str
    content: str
    source: Optional[str]
    url: Optional[str]
    score: float
    published_at: Optional[str]

class ChatRequest(BaseModel):
    query: str
    client: Optional[str] = None  # Optional client context (e.g. "landbanking", "renew")
    limit: int = 5

# API Endpoints

@app.get("/")
async def root():
    """API root"""
    return {
        "service": "KOI API Server",
        "version": "1.1.0",
        "endpoints": {
            "search": "/api/koi/search",
            "stats": "/api/koi/stats",
            "weekly_digest": "/api/koi/weekly-digest",
            "health": "/health"
        }
    }

@app.get("/health")
@app.get("/api/koi/health")  # Also support at /api/koi/health
async def health():
    """Health check"""
    db_healthy = False
    try:
        conn = get_db_connection()
        conn.close()
        db_healthy = True
    except:
        pass

    return {
        "status": "healthy" if db_healthy else "degraded",
        "database": "connected" if db_healthy else "disconnected",
        "weekly_digest": "available" if WEEKLY_DIGEST_AVAILABLE else "unavailable"
    }

@app.post("/api/koi/search")
@app.post("/api/koi/query")  # Backward compatibility alias
async def search(request: SearchRequest):
    """
    Hybrid search across KOI knowledge base
    Queries BOTH embedding tables:
    - koi_embeddings (legacy chunks)
    - koi_memory_chunks (new chunked architecture)
    """
    try:
        # Handle both 'query' and 'question' parameters
        search_query = request.query or request.question
        if not search_query:
            raise HTTPException(status_code=400, detail="Either 'query' or 'question' parameter is required")

        # Extract date filters from filters object if present
        date_filters = request.filters.get('date_range', {}) if request.filters else {}
        published_from = request.published_from or date_filters.get('start')
        published_to = request.published_to or date_filters.get('end')
        include_undated = request.include_undated or request.filters.get('include_undated', False) if request.filters else False

        conn = get_db_connection()
        cur = conn.cursor()

        # Get embedding for vector search
        embedding = get_bge_embedding(search_query)

        results = []

        if embedding:
            # Build date filter clause
            date_filter_legacy = ""
            date_filter_chunks = ""
            date_params = []

            if published_from:
                date_filter_legacy += " AND m.published_at >= %s::timestamptz"
                date_filter_chunks += " AND parent.published_at >= %s::timestamptz"
                date_params.append(published_from)
            if published_to:
                date_filter_legacy += " AND m.published_at <= %s::timestamptz"
                date_filter_chunks += " AND parent.published_at <= %s::timestamptz"
                date_params.append(published_to)
            if not include_undated and (published_from or published_to):
                date_filter_legacy += " AND m.published_at IS NOT NULL"
                date_filter_chunks += " AND parent.published_at IS NOT NULL"

            # UNION query: search both embedding tables
            # Note: We use a subquery to combine results, then order and limit
            query = f"""
                WITH combined_results AS (
                    -- Legacy embeddings (koi_embeddings)
                    SELECT
                        m.rid,
                        m.content->>'text' as content,
                        m.metadata->>'source' as source,
                        m.metadata->>'url' as url,
                        1 - (e.dim_1024 <=> %s::vector) as similarity,
                        m.published_at,
                        'legacy' as embedding_source
                    FROM koi_memories m
                    JOIN koi_embeddings e ON m.id = e.memory_id
                    WHERE
                        m.content->>'text' IS NOT NULL
                        AND LENGTH(m.content->>'text') > 50
                        AND e.dim_1024 IS NOT NULL
                        {date_filter_legacy}
                    
                    UNION ALL
                    
                    -- New chunked embeddings (koi_memory_chunks)
                    SELECT
                        mc.chunk_rid as rid,
                        mc.content->>'text' as content,
                        parent.metadata->>'source' as source,
                        parent.metadata->>'url' as url,
                        1 - (mc.embedding <=> %s::vector) as similarity,
                        parent.published_at,
                        'chunks' as embedding_source
                    FROM koi_memory_chunks mc
                    JOIN koi_memories parent ON mc.document_rid = parent.rid
                    WHERE
                        mc.content->>'text' IS NOT NULL
                        AND LENGTH(mc.content->>'text') > 50
                        AND mc.embedding IS NOT NULL
                        {date_filter_chunks}
                )
                SELECT rid, content, source, url, similarity, published_at, embedding_source
                FROM combined_results
                ORDER BY similarity DESC
                LIMIT %s
            """
            
            # Build params: [embedding1, ...date_params_legacy, embedding2, ...date_params_chunks, limit]
            params = [json.dumps(embedding)] + date_params + [json.dumps(embedding)] + date_params + [request.limit]
            
            logger.info(f"Executing unified search query (legacy + chunks)")
            cur.execute(query, params)
            results = cur.fetchall()
            logger.info(f"Unified search returned {len(results)} results")
            
            # Log source distribution
            legacy_count = sum(1 for r in results if r.get('embedding_source') == 'legacy')
            chunks_count = sum(1 for r in results if r.get('embedding_source') == 'chunks')
            logger.info(f"Results breakdown: {legacy_count} from legacy, {chunks_count} from chunks")
        else:
            # Fallback to keyword search (searches both via koi_memories)
            date_filter = ""
            params = [f"%{search_query}%", f"%{search_query.replace(' ', '%')}%"]

            if published_from:
                date_filter += " AND m.published_at >= %s::timestamptz"
                params.append(published_from)
            if published_to:
                date_filter += " AND m.published_at <= %s::timestamptz"
                params.append(published_to)

            params.append(request.limit)

            query = f"""
                SELECT
                    m.rid,
                    m.content->>'text' as content,
                    m.metadata->>'source' as source,
                    m.metadata->>'url' as url,
                    0.5 as similarity,
                    m.published_at
                FROM koi_memories m
                WHERE
                    m.content->>'text' IS NOT NULL
                    AND LENGTH(m.content->>'text') > 50
                    AND (
                        m.content->>'text' ILIKE %s
                        OR m.content->>'text' ILIKE %s
                    )
                    {date_filter}
                ORDER BY RANDOM()
                LIMIT %s
            """
            cur.execute(query, params)
            results = cur.fetchall()

        cur.close()
        conn.close()

        # Format results for compatibility
        formatted_results = [
            {
                "rid": r["rid"],
                "content": r["content"],
                "text": r["content"],  # Alias for compatibility
                "metadata": {
                    "source": r["source"],
                    "url": r["url"],
                },
                "source": r["source"],
                "url": r["url"],
                "score": float(r["similarity"]),
                "published_at": r["published_at"].isoformat() if r["published_at"] else None
            }
            for r in results
        ]

        # Return in both formats for compatibility
        return {
            "success": True,
            "query": search_query,
            "question": search_query,  # Alias
            "memories": formatted_results,  # For hosted API compatibility
            "results": formatted_results,   # Alternative format
            "count": len(results)
        }
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/koi/stats")
async def get_stats(detailed: bool = False):
    """Get knowledge base statistics"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Total documents
        cur.execute("SELECT COUNT(*) as total FROM koi_memories")
        total = cur.fetchone()["total"]

        # By source
        cur.execute("""
            SELECT
                metadata->>'source' as source,
                COUNT(*) as count
            FROM koi_memories
            WHERE metadata->>'source' IS NOT NULL
            GROUP BY source
            ORDER BY count DESC
        """)
        by_source = cur.fetchall()

        # Recent activity
        cur.execute("""
            SELECT COUNT(*) as recent
            FROM koi_memories
            WHERE created_at > NOW() - INTERVAL '7 days'
        """)
        recent = cur.fetchone()["recent"]
        
        # Embedding stats
        cur.execute("SELECT COUNT(*) as count FROM koi_embeddings")
        legacy_embeddings = cur.fetchone()["count"]
        
        cur.execute("SELECT COUNT(*) as count FROM koi_memory_chunks WHERE embedding IS NOT NULL")
        chunk_embeddings = cur.fetchone()["count"]

        cur.close()
        conn.close()

        stats = {
            "total_documents": total,
            "recent_7_days": recent,
            "by_source": {r["source"]: r["count"] for r in by_source},
            "embeddings": {
                "legacy_koi_embeddings": legacy_embeddings,
                "new_koi_memory_chunks": chunk_embeddings,
                "total_searchable": legacy_embeddings + chunk_embeddings
            }
        }

        if detailed:
            stats["database_config"] = {
                "host": DB_CONFIG["host"],
                "port": DB_CONFIG["port"],
                "database": DB_CONFIG["database"]
            }

        return stats
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/koi/weekly-digest")
async def generate_weekly_digest(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    format: str = "markdown"
):
    """Generate weekly digest"""
    if not WEEKLY_DIGEST_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="Weekly digest functionality not available. Install Python dependencies with: cd python && ./setup.sh"
        )

    try:
        # Calculate dates
        now = datetime.now()
        if not end_date:
            end_date = now.strftime('%Y-%m-%d')
        if not start_date:
            start = now - timedelta(days=7)
            start_date = start.strftime('%Y-%m-%d')

        # Initialize aggregator
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            '..',
            'python',
            'config',
            'weekly_aggregator.json'
        )

        aggregator = WeeklyAggregator(config_path)

        # Generate digest
        days_back = (now - datetime.strptime(start_date, '%Y-%m-%d')).days
        digest = aggregator.generate_digest(days_back)

        if not digest:
            raise HTTPException(status_code=404, detail="No content found for the specified period")

        if format == "json":
            return {
                "week_start": digest.week_start.isoformat(),
                "week_end": digest.week_end.isoformat(),
                "total_items": digest.total_items,
                "brief": digest.brief,
                "clusters": digest.clusters,
                "stats": digest.stats
            }
        else:
            # Return markdown
            return {
                "format": "markdown",
                "content": digest.brief,
                "metadata": {
                    "week_start": digest.week_start.isoformat(),
                    "week_end": digest.week_end.isoformat(),
                    "total_items": digest.total_items
                }
            }
    except Exception as e:
        logger.error(f"Weekly digest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

CLIENT_CONTEXTS = {
    "landbanking": "The user is asking about Landbanking Group, a Munich-based natural capital fintech creating 'Nature Equity Assets' — multi-dimensional nature outcomes (carbon, biodiversity, soil, water, social) as investable assets. They are exploring Regen Network registry infrastructure for verification and governance. Their key asset is West African cocoa agroforestry (2,400 ha). Carbon maps directly to C01-C09 credit classes. Biodiversity partially aligns with BT01 (BioTerra). Soil, water, and social have no existing credit classes.",
    "renew": "The user is asking about Renew/RePlanet, a UK-based biodiversity credit proponent using the Wallacea Trust v2.1 five-taxa methodology (3D Forest Structure, Invertebrates, Breeding Birds, Bat Fauna, Higher Plants). They want to stack biodiversity credits on their existing Verra carbon credits using Regen Registry. BT01 (BioTerra) is the primary credit class match. They need data anchoring and third-party verification pathways.",
}

CHAT_SYSTEM_PROMPT = """You are an expert on Regen Network's ecological credit registry infrastructure. You answer questions using ONLY the provided knowledge base excerpts as evidence.

Rules:
- Cite sources by number [1], [2], etc. corresponding to the provided excerpts
- If the excerpts don't contain relevant information, say so honestly
- Be concise (2-4 paragraphs max)
- Focus on practical, actionable information
- Never make up registry details — only cite what's in the evidence

{client_context}"""


@app.post("/api/koi/chat")
async def chat(request: ChatRequest):
    """
    Single-turn RAG chat: searches KOI for context, then generates an answer with citations.
    """
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

    try:
        # Step 1: Search KOI for relevant context
        search_request = SearchRequest(query=request.query, limit=request.limit)
        search_response = await search(search_request)
        koi_results = search_response.get("results", [])

        if not koi_results:
            return {
                "answer": "I couldn't find relevant information in the knowledge base for that question. Try rephrasing or asking about Regen Network credit classes, governance, or methodology review.",
                "sources": [],
                "model": "none",
            }

        # Step 2: Build context string with numbered citations
        context_parts = []
        sources = []
        for i, result in enumerate(koi_results, 1):
            content = result.get("content", "")[:600]
            source_name = result.get("source", "Unknown")
            url = result.get("url", "")
            rid = result.get("rid", "")
            context_parts.append(f"[{i}] ({source_name}) {content}")
            sources.append({
                "rid": rid,
                "title": content[:80] + ("..." if len(content) > 80 else ""),
                "excerpt": content[:200],
                "score": result.get("score", 0),
                "source": source_name,
                "url": url,
            })

        context_str = "\n\n".join(context_parts)

        # Step 3: Build system prompt with optional client context
        client_context = ""
        if request.client and request.client in CLIENT_CONTEXTS:
            client_context = f"\nClient context: {CLIENT_CONTEXTS[request.client]}"

        system_prompt = CHAT_SYSTEM_PROMPT.format(client_context=client_context)

        user_message = f"""Knowledge base excerpts:

{context_str}

Question: {request.query}"""

        # Step 4: Call OpenAI API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 800,
                },
            )
            response.raise_for_status()
            data = response.json()

        answer = data["choices"][0]["message"]["content"]

        return {
            "answer": answer,
            "sources": sources,
            "model": "gpt-4o-mini",
        }

    except httpx.HTTPStatusError as e:
        logger.error(f"OpenAI API error: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="AI generation failed")
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("KOI_API_PORT", "8301"))
    logger.info(f"Starting KOI API Server v1.1.0 on port {port}")
    logger.info(f"Database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    logger.info(f"Weekly digest: {'available' if WEEKLY_DIGEST_AVAILABLE else 'unavailable'}")
    logger.info("Search now queries BOTH koi_embeddings (legacy) and koi_memory_chunks (new)")

    uvicorn.run(app, host="0.0.0.0", port=port)

#!/usr/bin/env python3
"""
KOI API Server - Self-contained API for the Regen KOI MCP Server

Provides endpoints for:
- Hybrid search (vector + keyword)
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
    version="1.0.0",
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

# API Endpoints

@app.get("/")
async def root():
    """API root"""
    return {
        "service": "KOI API Server",
        "version": "1.0.0",
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
    Combines vector similarity and keyword search with RRF
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
            # Vector search with date filtering
            date_filter = ""
            date_params = []

            if published_from:
                date_filter += " AND m.published_at >= %s::timestamptz"
                date_params.append(published_from)
            if published_to:
                date_filter += " AND m.published_at <= %s::timestamptz"
                date_params.append(published_to)
            if not include_undated and (published_from or published_to):
                # Exclude undated documents
                date_filter += " AND m.published_at IS NOT NULL"

            query = f"""
                SELECT
                    m.rid,
                    m.content->>'text' as content,
                    m.metadata->>'source' as source,
                    m.metadata->>'url' as url,
                    1 - (e.dim_1024 <=> %s::vector) as similarity,
                    m.published_at
                FROM koi_memories m
                JOIN koi_embeddings e ON m.id = e.memory_id
                WHERE
                    m.content->>'text' IS NOT NULL
                    AND LENGTH(m.content->>'text') > 50
                    AND e.dim_1024 IS NOT NULL
                    {date_filter}
                ORDER BY e.dim_1024 <=> %s::vector
                LIMIT %s
            """
            # Build params: [embedding for similarity, ...date params, embedding for ORDER BY, limit]
            params_with_vector = [json.dumps(embedding)] + date_params + [json.dumps(embedding), request.limit]
            print(f"DEBUG: date_filter='{date_filter}'", flush=True)
            print(f"DEBUG: date_params={date_params}", flush=True)
            print(f"DEBUG: params_with_vector length={len(params_with_vector)}, limit={request.limit}", flush=True)
            print(f"DEBUG: SQL query:\n{query}", flush=True)
            cur.execute(query, params_with_vector)
            results = cur.fetchall()
            print(f"DEBUG: Vector search returned {len(results)} results", flush=True)
        else:
            # Fallback to keyword search
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

        cur.close()
        conn.close()

        stats = {
            "total_documents": total,
            "recent_7_days": recent,
            "by_source": {r["source"]: r["count"] for r in by_source}
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

if __name__ == "__main__":
    port = int(os.getenv("KOI_API_PORT", "8301"))
    logger.info(f"Starting KOI API Server on port {port}")
    logger.info(f"Database: {DB_CONFIG['database']} @ {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    logger.info(f"Weekly digest: {'available' if WEEKLY_DIGEST_AVAILABLE else 'unavailable'}")

    uvicorn.run(app, host="0.0.0.0", port=port)

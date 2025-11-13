#!/usr/bin/env python3
"""
Weekly Content Aggregator for Regen Network

Builds a comprehensive weekly digest by:
1. Collecting content from past 7 days across all sensors
2. Ranking content using BGE embeddings and relevance scoring
3. Clustering similar content to identify themes
4. Generating 800-1200 word briefs with citations
5. Exporting to NotebookLM-compatible format
"""

import json
import os
import sys
import logging
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np
from sklearn.cluster import DBSCAN
from collections import defaultdict, Counter
import aiohttp
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class ContentItem:
    """Represents a piece of content from the knowledge base"""
    id: str
    content: str
    title: str
    source: str
    url: Optional[str]
    publication_date: datetime
    confidence: float
    tags: List[str]
    embedding: Optional[np.ndarray] = None
    cluster_id: Optional[int] = None
    relevance_score: float = 0.0
    metadata: Optional[Dict[str, Any]] = None  # Store full metadata
    thread_id: Optional[str] = None  # For thread aggregation
    is_aggregated: bool = False  # True if this item represents multiple posts

@dataclass
class WeeklyDigest:
    """Represents the weekly digest output"""
    week_start: datetime
    week_end: datetime
    total_items: int
    clusters: List[Dict[str, Any]]
    top_stories: List[ContentItem]
    brief: str
    citations: List[Dict[str, str]]
    stats: Dict[str, Any]

class WeeklyAggregator:
    def __init__(self, config_path: str = "config/weekly_aggregator.json"):
        """Initialize the weekly aggregator"""
        self.config = self._load_config(config_path)
        self.db_conn = None
        self.bge_url = self.config.get("bge_server_url", "http://localhost:8090")
        self.koi_url = self.config.get("koi_coordinator_url", "http://localhost:8000")
        
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from JSON file"""
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                return json.load(f)
        else:
            # Default configuration
            return {
                "database": {
                    "host": "localhost",
                    "port": 5432,
                    "database": "koi_knowledge",
                    "user": "postgres",
                    "password": "postgres"
                },
                "bge_server_url": "http://localhost:8090",
                "koi_coordinator_url": "http://localhost:8000",
                "content": {
                    "min_confidence": 0.6,
                    "max_items": 100,
                    "clustering_eps": 0.3,
                    "min_cluster_size": 3,
                    "brief_word_count": 1000
                },
                "sources": {
                    "prioritize": ["governance", "ecocredits", "discourse", "twitter"],
                    "exclude": []
                }
            }
    
    async def initialize(self):
        """Initialize the Weekly Aggregator"""
        logger.info("Initializing Weekly Aggregator...")
        try:
            self.connect_db()
            logger.info("Weekly Aggregator initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Weekly Aggregator: {e}")
            return False
    
    async def cleanup(self):
        """Cleanup Weekly Aggregator resources"""
        logger.info("Cleaning up Weekly Aggregator...")
        if hasattr(self, 'db_conn') and self.db_conn:
            self.db_conn.close()
        logger.info("Weekly Aggregator cleaned up")
        return True
    
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.db_conn = psycopg2.connect(
                host=self.config["database"]["host"],
                port=self.config["database"]["port"],
                database=self.config["database"]["database"],
                user=self.config["database"]["user"],
                password=self.config["database"]["password"]
            )
            logger.info("Connected to database")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def collect_weekly_content(self, days_back: int = 7) -> List[ContentItem]:
        """Collect content from the past week"""
        if not self.db_conn:
            self.connect_db()
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Use a balanced query to get content from specific sources only:
        # - Forum (discourse-sensor)
        # - Ledger summaries (check metadata->>'url' for blockchain/ledger content)
        # - Governance notes (regentokenomics.org from website-sensor)
        # Exclude: notion, github, gitlab, podcast, telegram, twitter
        query = """
        WITH source_groups AS (
            SELECT
                rid as id,
                content,
                metadata,
                metadata->>'title' as title,
                source_sensor as source,
                metadata->>'url' as url,
                published_at as publication_date,
                published_confidence as confidence,
                metadata->>'tags' as tags,
                -- Group sources into categories to balance content
                CASE
                    WHEN source_sensor LIKE '%%discourse%%' THEN 'forum'
                    WHEN source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%regentokenomics.org%%' THEN 'governance'
                    WHEN source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%ledger%%' THEN 'ledger'
                    ELSE 'other'
                END as source_category,
                ROW_NUMBER() OVER (
                    PARTITION BY CASE
                        WHEN source_sensor LIKE '%%discourse%%' THEN 'forum'
                        WHEN source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%regentokenomics.org%%' THEN 'governance'
                        WHEN source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%ledger%%' THEN 'ledger'
                        ELSE 'other'
                    END
                    ORDER BY published_at DESC, published_confidence DESC
                ) as category_rank
            FROM koi_memories
            WHERE superseded_at IS NULL
                AND event_type != 'FORGET'
                -- Exclude all heartbeat content
                AND content::text NOT LIKE '%%sensor_heartbeat%%'
                AND content::text NOT LIKE '%%heartbeat%%'
                AND rid NOT LIKE '%%heartbeat%%'
                -- Exclude system/operational messages
                AND content::text NOT LIKE '%%Sensor initialized%%'
                AND content::text NOT LIKE '%%Monitoring active%%'
                AND content::text NOT LIKE '%%Starting sensor%%'
                AND content::text NOT LIKE '%%KOI system%%'
                -- ONLY content actually PUBLISHED in the specified window
                AND published_at IS NOT NULL
                AND published_at >= %s
                AND published_at <= %s
                -- Require reasonable confidence in the published date
                AND published_confidence >= %s
                -- ONLY include allowed sources: discourse (forum) and website (governance/ledger)
                AND (
                    source_sensor LIKE '%%discourse%%'
                    OR (source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%regentokenomics.org%%')
                    OR (source_sensor LIKE '%%website%%' AND metadata->>'url' LIKE '%%ledger%%')
                )
        )
        SELECT
            id, content, metadata, title, source, url,
            publication_date, confidence, tags
        FROM source_groups
        WHERE
            -- Get content from allowed source categories only
            source_category IN ('forum', 'governance', 'ledger')
            AND (
                (source_category = 'forum' AND category_rank <= 500)
                OR (source_category = 'governance' AND category_rank <= 200)
                OR (source_category = 'ledger' AND category_rank <= 200)
            )
        ORDER BY publication_date DESC, confidence DESC
        LIMIT %s
        """
        
        items = []
        with self.db_conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (
                start_date,
                end_date,
                self.config["content"]["min_confidence"],
                self.config["content"]["max_items"]
            ))
            
            for row in cursor.fetchall():
                tags = json.loads(row['tags']) if row['tags'] else []

                # Extract content text
                content_text = ""
                if isinstance(row['content'], dict):
                    content_text = row['content'].get('text', '') or str(row['content'])
                else:
                    content_text = str(row['content'])

                # Extract title with fallback strategies
                title = row['title']
                if not title or title == "Untitled" or title == "":
                    # Strategy 1: Try markdown header
                    if '# ' in content_text:
                        lines = content_text.split('\n')
                        for line in lines:
                            if line.startswith('# '):
                                title = line[2:].strip()
                                break

                    # Strategy 2: Use first sentence/line from content
                    if not title or title == "Untitled":
                        first_line = content_text.split('\n')[0].strip()
                        # Take first 100 chars as title
                        if first_line:
                            title = first_line[:100]
                            if len(first_line) > 100:
                                title += "..."

                # Ensure we have some title
                if not title or title == "":
                    title = "Untitled"

                # Parse metadata
                metadata = row['metadata'] if isinstance(row['metadata'], dict) else {}

                # Extract thread ID from URL or parent_rid for forum posts
                thread_id = None
                if metadata.get('parent_rid'):
                    # For chunked posts, use parent_rid as base thread identifier
                    parent_rid = metadata.get('parent_rid', '')
                    # Extract thread number from parent_rid or URL
                    if 'forum.regen.network_' in parent_rid:
                        # Format: regen.forum-post:forum.regen.network_413_post_2
                        parts = parent_rid.split('_')
                        if len(parts) >= 2:
                            thread_num = parts[-2]  # Get thread number (e.g., "413")
                            thread_id = f"forum.regen.network_{thread_num}"
                    elif 'discourse.group_' in parent_rid:
                        parts = parent_rid.split('_')
                        if len(parts) >= 2:
                            thread_num = parts[-2]
                            thread_id = f"regencommons.discourse.group_{thread_num}"

                items.append(ContentItem(
                    id=row['id'],
                    content=content_text,  # Store FULL content, not truncated
                    title=title,
                    source=row['source'] or "unknown",
                    url=row['url'],
                    publication_date=row['publication_date'],
                    confidence=row['confidence'],
                    tags=tags,
                    metadata=metadata,
                    thread_id=thread_id
                ))
        
        logger.info(f"Collected {len(items)} items from past {days_back} days")
        return items

    def aggregate_threads(self, items: List[ContentItem]) -> List[ContentItem]:
        """
        Aggregate forum posts and chunks into complete threads.
        Returns a new list where thread posts are combined into single items.
        """
        # Group items by thread_id
        threads = defaultdict(list)
        standalone_items = []

        for item in items:
            if item.thread_id:
                threads[item.thread_id].append(item)
            else:
                standalone_items.append(item)

        aggregated_items = []

        # Process each thread
        for thread_id, thread_items in threads.items():
            if len(thread_items) == 1:
                # Single item, no aggregation needed
                aggregated_items.append(thread_items[0])
            else:
                # Multiple posts/chunks in this thread - aggregate them
                # Sort by: post number (from rid), then chunk_index
                def sort_key(item):
                    # Extract post number from rid (e.g., forum.regen.network_413_post_2)
                    rid = item.id
                    post_num = 0
                    if '_post_' in rid:
                        parts = rid.split('_post_')
                        if len(parts) > 1:
                            # Extract number before '#chunk'
                            post_part = parts[1].split('#')[0]
                            try:
                                post_num = int(post_part)
                            except:
                                pass

                    # Get chunk index
                    chunk_idx = 0
                    if item.metadata and 'chunk_index' in item.metadata:
                        try:
                            chunk_idx = int(item.metadata['chunk_index'])
                        except:
                            pass

                    return (post_num, chunk_idx)

                thread_items.sort(key=sort_key)

                # Combine all content
                combined_content = []
                all_tags = []
                urls = []

                for item in thread_items:
                    # Add separator between posts (not chunks of same post)
                    if combined_content and item.metadata.get('chunk_index', '0') == '0':
                        combined_content.append("\n\n---\n\n")

                    combined_content.append(item.content)
                    all_tags.extend(item.tags)
                    if item.url and item.url not in urls:
                        urls.append(item.url)

                # Use first item as base
                first_item = thread_items[0]

                # Extract thread title from URL
                thread_title = first_item.title
                if first_item.url and '/t/' in first_item.url:
                    # URL format: https://forum.regen.network/t/thread-name/413/1
                    url_parts = first_item.url.split('/t/')
                    if len(url_parts) > 1:
                        thread_part = url_parts[1].split('/')[0]
                        # Convert URL slug to title
                        thread_title = thread_part.replace('-', ' ').title()

                # Create aggregated item
                aggregated_item = ContentItem(
                    id=thread_id,
                    content='\n'.join(combined_content),
                    title=f"Thread: {thread_title}",
                    source=first_item.source,
                    url=urls[0] if urls else first_item.url,  # Use first post URL
                    publication_date=first_item.publication_date,  # Use earliest date
                    confidence=first_item.confidence,
                    tags=list(set(all_tags)),  # Unique tags
                    metadata={'aggregated_urls': urls, 'post_count': len(thread_items)},
                    thread_id=thread_id,
                    is_aggregated=True
                )

                aggregated_items.append(aggregated_item)

        # Add standalone items
        aggregated_items.extend(standalone_items)

        logger.info(f"Aggregated {len(threads)} threads from {len(items)} items into {len(aggregated_items)} items")
        return aggregated_items

    async def fetch_ledger_summaries(self, days_back: int = 7) -> List[ContentItem]:
        """
        Fetch ledger summaries directly from Regen blockchain REST API.
        Returns governance proposals and ecocredit activity as ContentItems.
        """
        rest_endpoint = "https://regen-rest.publicnode.com"
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        ledger_items = []

        try:
            async with aiohttp.ClientSession() as session:
                # Fetch governance proposals
                try:
                    async with session.get(
                        f"{rest_endpoint}/cosmos/gov/v1/proposals",
                        params={"pagination.limit": "100", "pagination.reverse": "true"},
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            if data and "proposals" in data:
                                for proposal in data["proposals"]:
                                    # Check if proposal is within time window
                                    submit_time = proposal.get("submit_time", "")
                                    voting_end_time = proposal.get("voting_end_time", "")

                                    relevant = False
                                    pub_date = None

                                    if voting_end_time:
                                        voting_end_dt = datetime.fromisoformat(voting_end_time.replace('Z', '+00:00'))
                                        if voting_end_dt >= cutoff_date:
                                            relevant = True
                                            pub_date = voting_end_dt

                                    if submit_time and not relevant:
                                        submit_dt = datetime.fromisoformat(submit_time.replace('Z', '+00:00'))
                                        if submit_dt >= cutoff_date:
                                            relevant = True
                                            pub_date = submit_dt

                                    if relevant and pub_date:
                                        # Format proposal content
                                        proposal_id = proposal.get("id", "")
                                        title = proposal.get("title", f"Proposal #{proposal_id}")
                                        status = proposal.get("status", "").replace("PROPOSAL_STATUS_", "")
                                        summary = proposal.get("summary", "No summary provided")

                                        # Build full content
                                        content_parts = [
                                            f"# {title}\n",
                                            f"**Proposal ID:** {proposal_id}",
                                            f"**Status:** {status}",
                                            f"**Submitted:** {submit_time}",
                                            f"**Voting Ends:** {voting_end_time}\n",
                                            f"## Summary\n{summary}"
                                        ]

                                        # Add messages if available
                                        messages = proposal.get("messages", [])
                                        if messages:
                                            content_parts.append("\n## Proposal Messages")
                                            for msg in messages[:3]:  # Limit to first 3 messages
                                                msg_type = msg.get("@type", "").split(".")[-1]
                                                content_parts.append(f"- Type: {msg_type}")

                                        ledger_items.append(ContentItem(
                                            id=f"regen.proposal:{proposal_id}",
                                            content="\n".join(content_parts),
                                            title=f"Governance: {title}",
                                            source="regen-ledger",
                                            url=f"https://wallet.keplr.app/chains/regen/proposals/{proposal_id}",
                                            publication_date=pub_date,
                                            confidence=1.0,
                                            tags=["governance", "proposal", status.lower()],
                                            metadata={"proposal_id": proposal_id, "status": status}
                                        ))
                except Exception as e:
                    logger.warning(f"Failed to fetch governance proposals: {e}")

                # Fetch recent ecocredit batches
                try:
                    async with session.get(
                        f"{rest_endpoint}/regen/ecocredit/v1/batches",
                        params={"pagination.limit": "50"},
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            if data and "batches" in data:
                                for batch in data["batches"]:
                                    # Check start/end date
                                    start_date = batch.get("start_date")
                                    if start_date:
                                        try:
                                            batch_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                                            if batch_date >= cutoff_date:
                                                denom = batch.get("denom", "")
                                                project_id = batch.get("project_id", "")
                                                issuer = batch.get("issuer", "")

                                                content_parts = [
                                                    f"# Ecocredit Batch: {denom}\n",
                                                    f"**Project ID:** {project_id}",
                                                    f"**Issuer:** {issuer}",
                                                    f"**Start Date:** {start_date}",
                                                    f"**End Date:** {batch.get('end_date', 'N/A')}",
                                                ]

                                                ledger_items.append(ContentItem(
                                                    id=f"regen.ecocredit.batch:{denom}",
                                                    content="\n".join(content_parts),
                                                    title=f"Ecocredit Batch: {denom}",
                                                    source="regen-ledger",
                                                    url=f"https://app.regen.network/projects/{project_id}",
                                                    publication_date=batch_date,
                                                    confidence=1.0,
                                                    tags=["ecocredit", "batch"],
                                                    metadata={"batch_denom": denom, "project_id": project_id}
                                                ))
                                        except:
                                            pass
                except Exception as e:
                    logger.warning(f"Failed to fetch ecocredit batches: {e}")

        except Exception as e:
            logger.error(f"Error fetching ledger summaries: {e}")

        logger.info(f"Fetched {len(ledger_items)} ledger summary items")
        return ledger_items

    def get_embeddings(self, items: List[ContentItem]) -> None:
        """Get BGE embeddings for content items"""
        embeddings_generated = 0
        for item in items:
            try:
                # Process each item individually since BGE server doesn't support batch
                response = requests.post(
                    f"{self.bge_url}/encode",
                    json={"text": item.content[:5000]}  # Limit text length
                )

                if response.status_code == 200:
                    embedding_data = response.json()
                    item.embedding = np.array(embedding_data["embedding"])
                    embeddings_generated += 1
                else:
                    logger.warning(f"BGE server error for item: {response.status_code}")
                    # Fallback to mock embedding for this item
                    item.embedding = np.random.randn(1024)
            except Exception as e:
                logger.error(f"Error getting embedding for item: {e}")
                # Use mock embedding for this item
                item.embedding = np.random.randn(1024)

        logger.info(f"Generated {embeddings_generated}/{len(items)} BGE embeddings")
    
    def cluster_content(self, items: List[ContentItem]) -> List[List[ContentItem]]:
        """Cluster similar content using DBSCAN"""
        if not items or items[0].embedding is None:
            return [items]  # Return single cluster if no embeddings
        
        # Stack embeddings
        embeddings = np.vstack([item.embedding for item in items])
        
        # Perform clustering
        clustering = DBSCAN(
            eps=self.config["content"]["clustering_eps"],
            min_samples=self.config["content"]["min_cluster_size"],
            metric='cosine'
        ).fit(embeddings)
        
        # Group items by cluster
        clusters = defaultdict(list)
        for item, label in zip(items, clustering.labels_):
            item.cluster_id = label
            clusters[label].append(item)
        
        # Convert to list, putting noise points (-1) in their own clusters
        result = []
        for label in sorted(clusters.keys()):
            if label == -1:
                # Split noise points into individual clusters
                for item in clusters[label]:
                    result.append([item])
            else:
                result.append(clusters[label])
        
        logger.info(f"Created {len(result)} content clusters")
        return result
    
    def rank_content(self, items: List[ContentItem]) -> List[ContentItem]:
        """Rank content by relevance and importance"""
        priority_sources = self.config["sources"]["prioritize"]
        
        for item in items:
            # Base score from confidence
            score = item.confidence
            
            # Boost for priority sources
            if item.source in priority_sources:
                score *= 1.5
            
            # Boost for recent content
            # Handle timezone-aware and naive datetimes
            if item.publication_date.tzinfo is not None:
                days_old = (datetime.now(item.publication_date.tzinfo) - item.publication_date).days
            else:
                days_old = (datetime.now() - item.publication_date).days
            recency_boost = max(0, 1 - (days_old / 7))
            score *= (1 + recency_boost * 0.5)
            
            # Boost for tagged content
            if item.tags:
                score *= 1.2
            
            # Boost for governance/proposal content
            if any(tag in ['governance', 'proposal', 'vote'] for tag in item.tags):
                score *= 1.3
            
            item.relevance_score = score
        
        # Sort by relevance
        items.sort(key=lambda x: x.relevance_score, reverse=True)
        return items
    
    def generate_brief(self, digest: WeeklyDigest) -> str:
        """Generate the weekly brief narrative with FULL content"""
        lines = []

        # Header
        lines.append(f"# Regen Network Weekly Digest")
        lines.append(f"{digest.week_start.strftime('%B %d')} - {digest.week_end.strftime('%B %d, %Y')}\n")

        # Executive Summary
        lines.append("## Executive Summary\n")
        lines.append(f"This week saw {digest.total_items} significant updates across the Regen Network ecosystem. ")

        # Theme summary
        if digest.clusters:
            themes = []
            for cluster in digest.clusters[:3]:
                if cluster['items']:
                    theme = cluster['theme']
                    count = cluster['size']
                    themes.append(f"{theme} ({count} items)")

            if themes:
                lines.append(f"Key themes included {', '.join(themes)}. ")

        lines.append("\n")

        # Full Content Section - ALL CONTENT IN FULL
        lines.append("## Full Content\n")
        lines.append("*This section contains the complete content from all sources this week.*\n\n")

        for i, story in enumerate(digest.top_stories, 1):
            lines.append(f"### {i}. {story.title}\n")

            # Metadata
            lines.append(f"**Source:** {story.source}  \n")
            lines.append(f"**Date:** {story.publication_date.strftime('%Y-%m-%d')}  \n")
            if story.url:
                lines.append(f"**URL:** {story.url}  \n")

            # Show if this is an aggregated thread
            if story.is_aggregated and story.metadata:
                post_count = story.metadata.get('post_count', 0)
                lines.append(f"**Thread Posts:** {post_count}  \n")

            lines.append("\n")

            # FULL CONTENT - No truncation
            lines.append(f"{story.content}\n")
            lines.append("\n---\n\n")
        
        # Thematic Analysis
        lines.append("## Thematic Analysis\n")
        for cluster in digest.clusters[:3]:
            if cluster['items']:
                lines.append(f"### {cluster['theme']}\n")
                lines.append(f"This cluster contains {cluster['size']} related items focusing on {cluster['theme'].lower()}. ")
                
                # Sample items from cluster
                sample_items = cluster['items'][:3]
                if sample_items:
                    lines.append("Key developments include:\n")
                    for item in sample_items:
                        lines.append(f"- {item['title']}\n")
                lines.append("")
        
        # Statistics
        lines.append("## Weekly Statistics\n")
        if digest.stats:
            lines.append(f"- Total Content Items: {digest.stats.get('total_items', 0)}\n")
            lines.append(f"- Unique Sources: {digest.stats.get('unique_sources', 0)}\n")
            lines.append(f"- Most Active Source: {digest.stats.get('most_active_source', 'N/A')}\n")
            lines.append(f"- Average Confidence: {digest.stats.get('avg_confidence', 0):.2f}\n")
        
        # Citations
        lines.append("\n## References\n")
        for i, citation in enumerate(digest.citations[:10], 1):
            if citation.get('url'):
                # Make title clickable if URL is available
                lines.append(f"{i}. [{citation['title']}]({citation['url']}) - {citation['source']} ({citation['date']})\n")
            else:
                # No URL available, just show title
                lines.append(f"{i}. {citation['title']} - {citation['source']} ({citation['date']})\n")
        
        # Additional Context footer
        lines.append("\n## Additional Context\n")
        lines.append("The Regen Network continues to advance its mission of ecological regeneration through coordinated action across technology, governance, and community engagement. ")
        lines.append("This week's developments reflect the growing momentum in regenerative finance and ecological data infrastructure.\n")

        # Footer
        lines.append("\n---\n")
        lines.append("*This digest was automatically generated by the Regen Network KOI system.*\n")

        brief = ''.join(lines)
        return brief
    
    def extract_citations(self, items: List[ContentItem]) -> List[Dict[str, str]]:
        """Extract citations from content items"""
        citations = []
        seen = set()
        
        for item in items:
            # Create unique identifier
            cite_id = f"{item.source}:{item.title}"
            if cite_id not in seen:
                seen.add(cite_id)
                citations.append({
                    "title": item.title,
                    "source": item.source,
                    "url": item.url or "",
                    "date": item.publication_date.strftime('%Y-%m-%d')
                })
        
        return citations
    
    def calculate_stats(self, items: List[ContentItem]) -> Dict[str, Any]:
        """Calculate statistics for the digest"""
        if not items:
            return {}
        
        sources = Counter(item.source for item in items)
        confidences = [item.confidence for item in items]
        
        return {
            "total_items": len(items),
            "unique_sources": len(sources),
            "most_active_source": sources.most_common(1)[0][0] if sources else "N/A",
            "source_distribution": dict(sources),
            "avg_confidence": np.mean(confidences),
            "min_confidence": min(confidences),
            "max_confidence": max(confidences)
        }
    
    def _fetch_ledger_summaries_sync(self, days_back: int = 7) -> List[ContentItem]:
        """Synchronous wrapper for async ledger fetch using thread pool"""
        import concurrent.futures
        try:
            # Use thread pool to run async code in a new event loop
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, self.fetch_ledger_summaries(days_back))
                return future.result(timeout=15)
        except Exception as e:
            logger.warning(f"Failed to fetch ledger summaries: {e}")
            return []

    def generate_digest(self, days_back: int = 7) -> WeeklyDigest:
        """Generate the complete weekly digest"""
        logger.info(f"Generating weekly digest for past {days_back} days")

        # Collect content from database
        items = self.collect_weekly_content(days_back)

        # Fetch ledger summaries directly from blockchain
        ledger_items = self._fetch_ledger_summaries_sync(days_back)
        if ledger_items:
            items.extend(ledger_items)
            logger.info(f"Added {len(ledger_items)} ledger summary items")

        if not items:
            logger.warning("No content found for digest")
            return None

        # Aggregate threads (combine forum posts and chunks)
        items = self.aggregate_threads(items)

        # Get embeddings
        self.get_embeddings(items)

        # Cluster content
        clusters = self.cluster_content(items)

        # Rank content
        ranked_items = self.rank_content(items)
        
        # Prepare cluster data
        cluster_data = []
        used_themes = set()
        cluster_index = 1

        for cluster in clusters:
            if cluster:
                # Determine theme from most common tags
                all_tags = []
                for item in cluster:
                    all_tags.extend(item.tags)

                theme = None
                if all_tags:
                    tag_counts = Counter(all_tags)
                    theme = tag_counts.most_common(1)[0][0].title()

                # If no tags, try to infer from source types
                if not theme:
                    sources = [item.source for item in cluster]
                    if any('github' in s.lower() for s in sources):
                        theme = "Development Activity"
                    elif any('discourse' in s.lower() or 'forum' in s.lower() for s in sources):
                        theme = "Community Discussions"
                    elif any('notion' in s.lower() for s in sources):
                        theme = "Documentation & Planning"
                    elif any('gitlab' in s.lower() for s in sources):
                        theme = "Project Updates"
                    else:
                        theme = "General Updates"

                # Ensure unique theme names
                original_theme = theme
                counter = 1
                while theme in used_themes:
                    theme = f"{original_theme} {counter}"
                    counter += 1
                used_themes.add(theme)

                cluster_data.append({
                    "theme": theme,
                    "size": len(cluster),
                    "items": [
                        {
                            "title": item.title,
                            "source": item.source,
                            "score": item.relevance_score
                        }
                        for item in cluster[:5]  # Top 5 from each cluster
                    ]
                })
        
        # Sort clusters by size
        cluster_data.sort(key=lambda x: x['size'], reverse=True)
        
        # Create digest
        digest = WeeklyDigest(
            week_start=datetime.now() - timedelta(days=days_back),
            week_end=datetime.now(),
            total_items=len(items),
            clusters=cluster_data,
            top_stories=ranked_items[:10],
            brief="",  # Will be generated
            citations=self.extract_citations(ranked_items[:20]),
            stats=self.calculate_stats(items)
        )
        
        # Generate brief
        digest.brief = self.generate_brief(digest)
        
        logger.info(f"Generated digest with {len(digest.top_stories)} top stories and {len(digest.clusters)} clusters")
        return digest
    
    def export_markdown(self, digest: WeeklyDigest, output_path: str):
        """Export digest to Markdown file"""
        with open(output_path, 'w') as f:
            f.write(digest.brief)
        logger.info(f"Exported digest to {output_path}")
    
    def export_json(self, digest: WeeklyDigest, output_path: str):
        """Export digest to JSON for further processing"""
        # Convert to serializable format
        data = {
            "week_start": digest.week_start.isoformat(),
            "week_end": digest.week_end.isoformat(),
            "total_items": digest.total_items,
            "clusters": digest.clusters,
            "top_stories": [
                {
                    "id": story.id,
                    "title": story.title,
                    "content": story.content,
                    "source": story.source,
                    "url": story.url,
                    "publication_date": story.publication_date.isoformat(),
                    "confidence": story.confidence,
                    "tags": story.tags,
                    "relevance_score": story.relevance_score
                }
                for story in digest.top_stories
            ],
            "brief": digest.brief,
            "citations": digest.citations,
            "stats": digest.stats
        }
        
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"Exported digest JSON to {output_path}")

def main():
    """Main entry point for weekly aggregator"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate Regen Network Weekly Digest")
    parser.add_argument('--days', type=int, default=7, help="Number of days to look back")
    parser.add_argument('--config', default="config/weekly_aggregator.json", help="Config file path")
    parser.add_argument('--output-dir', default="output/weekly", help="Output directory")
    parser.add_argument('--format', choices=['markdown', 'json', 'both'], default='both', help="Output format")
    
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Initialize aggregator
    aggregator = WeeklyAggregator(args.config)
    
    # Generate digest
    digest = aggregator.generate_digest(args.days)
    
    if digest:
        # Generate filename with date
        date_str = digest.week_end.strftime('%Y-%m-%d')
        
        # Export based on format
        if args.format in ['markdown', 'both']:
            md_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.md")
            aggregator.export_markdown(digest, md_path)
            print(f"Markdown digest saved to: {md_path}")
        
        if args.format in ['json', 'both']:
            json_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.json")
            aggregator.export_json(digest, json_path)
            print(f"JSON digest saved to: {json_path}")
        
        # Print summary
        print(f"\nWeekly Digest Summary:")
        print(f"- Period: {digest.week_start.strftime('%B %d')} - {digest.week_end.strftime('%B %d, %Y')}")
        print(f"- Total items: {digest.total_items}")
        print(f"- Clusters: {len(digest.clusters)}")
        print(f"- Top stories: {len(digest.top_stories)}")
        print(f"- Word count: {len(digest.brief.split())} words")
    else:
        print("No content found for digest generation")
        sys.exit(1)

if __name__ == "__main__":
    main()
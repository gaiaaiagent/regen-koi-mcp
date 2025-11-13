#!/usr/bin/env python3
"""
CLI Runner for Weekly Aggregator

Provides easy command-line interface for generating weekly digests.
"""

import sys
import os
import json
from datetime import datetime, timedelta
import argparse
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.content.weekly_aggregator import WeeklyAggregator
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def preview_digest(digest, output_markdown=False):
    """Print a preview of the digest to console

    Args:
        digest: The WeeklyDigest object
        output_markdown: If True, output the full markdown content after preview
    """
    print("\n" + "="*80)
    print("WEEKLY DIGEST PREVIEW")
    print("="*80)

    # Handle WeeklyDigest dataclass
    if hasattr(digest, 'week_start'):
        print(f"Period: {digest.week_start.strftime('%B %d')} - {digest.week_end.strftime('%B %d, %Y')}")
        print(f"Total Items: {digest.total_items}")
        if hasattr(digest, 'clusters'):
            print(f"Clusters: {len(digest.clusters)}")
        if hasattr(digest, 'brief'):
            print(f"Word Count: {len(digest.brief.split())} words")

        if hasattr(digest, 'top_stories') and digest.top_stories:
            print("\n" + "-"*40 + " TOP STORIES " + "-"*40)
            for i, story in enumerate(digest.top_stories[:5], 1):
                print(f"\n{i}. {story.title}")
                print(f"   Source: {story.source}")
                if hasattr(story, 'publication_date'):
                    print(f"   Date: {story.publication_date}")

        if hasattr(digest, 'clusters') and digest.clusters:
            print("\n" + "-"*40 + " THEMES " + "-"*40)
            for cluster in digest.clusters[:5]:
                if isinstance(cluster, dict):
                    print(f"\n• {cluster.get('theme', 'Unknown')} ({cluster.get('size', 0)} items)")

        if hasattr(digest, 'brief') and digest.brief:
            print("\n" + "-"*40 + " SUMMARY " + "-"*40)
            print(digest.brief[:500] + "...")

        if hasattr(digest, 'stats') and digest.stats:
            print("\n" + "-"*40 + " STATISTICS " + "-"*40)
            for key, value in digest.stats.items():
                if key != 'source_distribution':
                    print(f"{key}: {value}")

    print("\n" + "="*80 + "\n")

    # Output full markdown content if requested
    if output_markdown and hasattr(digest, 'brief'):
        print("\n" + "="*80)
        print("MARKDOWN_CONTENT_START")
        print("="*80)
        print(digest.brief)
        print("="*80)
        print("MARKDOWN_CONTENT_END")
        print("="*80)

def test_digest():
    """Generate a test digest with sample data"""
    print("\n🧪 Running Weekly Aggregator Test...\n")
    
    # Create test configuration
    test_config = {
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
            "min_confidence": 0.5,
            "max_items": 1000,
            "clustering_eps": 0.3,
            "min_cluster_size": 2,
            "brief_word_count": 1000
        },
        "sources": {
            "prioritize": ["governance", "ecocredits", "discourse"],
            "exclude": []
        }
    }
    
    # Save test config
    test_config_path = "config/test_weekly_aggregator.json"
    os.makedirs("config", exist_ok=True)
    with open(test_config_path, 'w') as f:
        json.dump(test_config, f, indent=2)
    
    # Initialize aggregator
    aggregator = WeeklyAggregator(test_config_path)
    
    try:
        # Generate digest
        print("📊 Collecting content from past 7 days...")
        digest = aggregator.generate_digest(days_back=7)
        
        if digest:
            # Preview
            preview_digest(digest)
            
            # Save outputs
            os.makedirs("output/test", exist_ok=True)
            date_str = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
            
            md_path = f"output/test/test_digest_{date_str}.md"
            aggregator.export_markdown(digest, md_path)
            print(f"✅ Markdown saved to: {md_path}")
            
            json_path = f"output/test/test_digest_{date_str}.json"
            aggregator.export_json(digest, json_path)
            print(f"✅ JSON saved to: {json_path}")
            
            print("\n🎉 Test completed successfully!")
            return True
        else:
            print("❌ No digest generated - check data availability")
            return False
            
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        logger.exception("Test failed with exception")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Generate Regen Network Weekly Digest",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate digest for past 7 days
  python run_weekly_aggregator.py
  
  # Generate digest for past 14 days
  python run_weekly_aggregator.py --days 14
  
  # Preview only (no file output)
  python run_weekly_aggregator.py --preview
  
  # Test with sample data
  python run_weekly_aggregator.py --test
  
  # Custom output directory
  python run_weekly_aggregator.py --output-dir /path/to/output
        """
    )
    
    parser.add_argument(
        '--days', 
        type=int, 
        default=7, 
        help='Number of days to look back (default: 7)'
    )
    parser.add_argument(
        '--config', 
        default='config/weekly_aggregator.json',
        help='Configuration file path'
    )
    parser.add_argument(
        '--output-dir', 
        default='output/weekly',
        help='Output directory for digest files'
    )
    parser.add_argument(
        '--format',
        choices=['markdown', 'json', 'both'],
        default='both',
        help='Output format (default: both)'
    )
    parser.add_argument(
        '--preview',
        action='store_true',
        help='Preview digest without saving files'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='Run test with sample configuration'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    if args.test:
        success = test_digest()
        sys.exit(0 if success else 1)
    
    # Create output directory
    if not args.preview:
        os.makedirs(args.output_dir, exist_ok=True)
    
    # Initialize aggregator
    print(f"\n🚀 Initializing Weekly Aggregator...")
    aggregator = WeeklyAggregator(args.config)
    
    # Generate digest
    print(f"📊 Generating digest for past {args.days} days...")
    digest = aggregator.generate_digest(args.days)
    
    if digest:
        # Preview
        if args.preview:
            preview_digest(digest, output_markdown=True)
            print("\n📋 Preview mode - no files saved", file=sys.stderr)
        else:
            # Generate filename with date
            date_str = digest.week_end.strftime('%Y-%m-%d')
            
            # Export based on format
            if args.format in ['markdown', 'both']:
                md_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.md")
                aggregator.export_markdown(digest, md_path)
                print(f"✅ Markdown digest saved to: {md_path}")
            
            if args.format in ['json', 'both']:
                json_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.json")
                aggregator.export_json(digest, json_path)
                print(f"✅ JSON digest saved to: {json_path}")
            
            # Summary
            print(f"\n📈 Weekly Digest Summary:")
            print(f"  • Period: {digest.week_start.strftime('%B %d')} - {digest.week_end.strftime('%B %d, %Y')}")
            print(f"  • Total items: {digest.total_items}")
            print(f"  • Clusters: {len(digest.clusters)}")
            print(f"  • Top stories: {len(digest.top_stories)}")
            print(f"  • Word count: {len(digest.brief.split())} words")
            print(f"\n✨ Digest generation complete!")
    else:
        print("\n❌ No content found for digest generation")
        print("   Check that:")
        print("   1. Database is accessible")
        print("   2. Content exists for the specified period")
        print("   3. Configuration is correct")
        sys.exit(1)

if __name__ == "__main__":
    main()
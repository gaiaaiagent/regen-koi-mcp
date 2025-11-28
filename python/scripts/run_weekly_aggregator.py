#!/usr/bin/env python3
"""
CLI Runner for Weekly Digest Generation

Provides easy command-line interface for generating weekly digests.
Uses WeeklyCuratorLLM with URL enrichment and NotebookLM export.
"""

import sys
import os
import json
from datetime import datetime, timedelta
import argparse
import logging
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
# First try the koi-processor .env, then fallback to local .env
koi_processor_env = '/opt/projects/koi-processor/.env'
if os.path.exists(koi_processor_env):
    load_dotenv(koi_processor_env)
else:
    load_dotenv()

# Add koi-processor to path to import WeeklyCuratorLLM
koi_processor_path = '/opt/projects/koi-processor'
if os.path.exists(koi_processor_path) and koi_processor_path not in sys.path:
    sys.path.insert(0, koi_processor_path)

from src.content.weekly_curator_llm import WeeklyCuratorLLM
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def preview_digest(digest: Dict[str, Any], output_markdown=False):
    """Print a preview of the digest to console

    Args:
        digest: The digest dictionary from WeeklyCuratorLLM
        output_markdown: If True, output the full markdown content after preview
    """
    print("\n" + "="*80)
    print("WEEKLY DIGEST PREVIEW")
    print("="*80)

    # Handle digest dictionary from WeeklyCuratorLLM
    print(f"Title: {digest.get('title', 'N/A')}")

    # Get statistics
    stats = digest.get('statistics', {})
    if stats:
        print(f"\nTotal Items: {stats.get('total_items', 0)}")
        print(f"Word Count: {len(digest.get('brief', '').split())} words")

        print("\n" + "-"*40 + " STATISTICS " + "-"*40)
        for key, value in stats.items():
            if isinstance(value, (int, float)) and value > 0:
                print(f"  • {key}: {value}")

    # Show brief summary
    brief = digest.get('brief', '')
    if brief:
        print("\n" + "-"*40 + " SUMMARY " + "-"*40)
        print(brief[:500] + "...")

    print("\n" + "="*80 + "\n")

    # Output full markdown content if requested
    if output_markdown and brief:
        print("\n" + "="*80)
        print("MARKDOWN_CONTENT_START")
        print("="*80)
        print(brief)
        print("="*80)
        print("MARKDOWN_CONTENT_END")
        print("="*80)

async def test_digest_async():
    """Generate a test digest with sample data"""
    print("\n🧪 Running Weekly Digest Test with WeeklyCuratorLLM...\n")

    try:
        # Set date range via environment variables
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        os.environ['DIGEST_START_DATE'] = start_date.strftime('%Y-%m-%d')
        os.environ['DIGEST_END_DATE'] = end_date.strftime('%Y-%m-%d')

        # Initialize curator
        curator = WeeklyCuratorLLM()

        # Generate digest
        print(f"📊 Collecting content from past 7 days ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')})...")
        digest = await curator.generate_weekly_digest()

        if digest:
            # Preview
            preview_digest(digest)

            # Save outputs
            os.makedirs("output/test", exist_ok=True)
            date_str = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')

            # Save JSON
            json_path = f"output/test/test_digest_{date_str}.json"
            with open(json_path, 'w') as f:
                json.dump(digest, f, indent=2)
            print(f"✅ JSON saved to: {json_path}")

            # Save markdown brief
            md_path = f"output/test/test_digest_{date_str}.md"
            with open(md_path, 'w') as f:
                f.write(digest.get('brief', ''))
            print(f"✅ Markdown saved to: {md_path}")

            print("\n🎉 Test completed successfully!")
            return True
        else:
            print("❌ No digest generated - check data availability")
            return False

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        logger.exception("Test failed with exception")
        return False

def test_digest():
    """Synchronous wrapper for test_digest_async"""
    return asyncio.run(test_digest_async())

async def main_async():
    """Main async function"""
    parser = argparse.ArgumentParser(
        description="Generate Regen Network Weekly Digest with WeeklyCuratorLLM",
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
        '--output-dir',
        default='/opt/projects/koi-processor/output/weekly',
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

    # Set date range via environment variables (used by WeeklyCuratorLLM)
    end_date = datetime.now()
    start_date = end_date - timedelta(days=args.days)
    os.environ['DIGEST_START_DATE'] = start_date.strftime('%Y-%m-%d')
    os.environ['DIGEST_END_DATE'] = end_date.strftime('%Y-%m-%d')

    # Initialize curator
    print(f"\n🚀 Initializing Weekly Curator with LLM...")
    curator = WeeklyCuratorLLM()

    # Generate digest
    print(f"📊 Generating digest for past {args.days} days ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')})...")
    digest = await curator.generate_weekly_digest()

    if digest:
        # Preview
        if args.preview:
            preview_digest(digest, output_markdown=True)
            print("\n📋 Preview mode - no files saved", file=sys.stderr)
        else:
            # Generate filename with current date
            date_str = datetime.now().strftime('%Y-%m-%d')

            # Export based on format
            if args.format in ['markdown', 'both']:
                md_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.md")
                with open(md_path, 'w') as f:
                    f.write(digest.get('brief', ''))
                print(f"✅ Markdown digest saved to: {md_path}")

            if args.format in ['json', 'both']:
                json_path = os.path.join(args.output_dir, f"weekly_digest_{date_str}.json")
                with open(json_path, 'w') as f:
                    json.dump(digest, f, indent=2)
                print(f"✅ JSON digest saved to: {json_path}")

            # Summary
            stats = digest.get('statistics', {})
            print(f"\n📈 Weekly Digest Summary:")
            print(f"  • Title: {digest.get('title', 'N/A')}")
            print(f"  • Total items: {stats.get('total_items', 0)}")
            print(f"  • Word count: {len(digest.get('brief', '').split())} words")
            print(f"\n✨ Digest generation complete!")
    else:
        print("\n❌ No content found for digest generation")
        print("   Check that:")
        print("   1. Database is accessible")
        print("   2. Content exists for the specified period")
        print("   3. Environment variables are set (OPENAI_API_KEY, POSTGRES_URL)")
        sys.exit(1)

def main():
    """Synchronous wrapper for main_async"""
    asyncio.run(main_async())

if __name__ == "__main__":
    main()